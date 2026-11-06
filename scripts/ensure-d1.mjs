#!/usr/bin/env node
/**
 * Garante que o banco D1 remoto exista e injeta o database_id real no
 * wrangler.toml. Requer CLOUDFLARE_API_TOKEN e CLOUDFLARE_ACCOUNT_ID.
 *
 * Uso: node scripts/ensure-d1.mjs [nome-do-banco]
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const dbName = process.argv[2] ?? 'forca-caos-db';
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';

function wrangler(args, { allowFailure = false } = {}) {
  try {
    return execFileSync(npx, ['wrangler', ...args], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, CI: 'true', WRANGLER_SEND_METRICS: 'false' },
    });
  } catch (error) {
    const detail = `${error.stdout ?? ''}\n${error.stderr ?? ''}`.trim();
    if (allowFailure) return '';
    throw new Error(`wrangler ${args.join(' ')} falhou:\n${detail}`);
  }
}

function extractJson(text) {
  const start = text.search(/[[{]/);
  if (start === -1) return null;
  const open = text[start];
  const close = open === '[' ? ']' : '}';
  const end = text.lastIndexOf(close);
  if (end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

function listDatabases() {
  const output = wrangler(['d1', 'list', '--json']);
  const parsed = extractJson(output);
  if (!Array.isArray(parsed)) {
    throw new Error(`Nao foi possivel interpretar "wrangler d1 list --json":\n${output}`);
  }
  return parsed;
}

function findDatabase(list) {
  return list.find((entry) => entry?.name === dbName) ?? null;
}

function createDatabase() {
  const output = wrangler(['d1', 'create', dbName]);
  const parsed = extractJson(output);
  const id =
    parsed?.uuid ??
    parsed?.database_id ??
    parsed?.id ??
    output.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i)?.[1] ??
    null;
  if (!id) {
    throw new Error(`Banco criado, mas nao encontrei o id na saida:\n${output}`);
  }
  return id;
}

function main() {
  if (!process.env.CLOUDFLARE_API_TOKEN) {
    throw new Error('CLOUDFLARE_API_TOKEN ausente.');
  }
  if (!process.env.CLOUDFLARE_ACCOUNT_ID) {
    throw new Error('CLOUDFLARE_ACCOUNT_ID ausente.');
  }

  let database = findDatabase(listDatabases());
  let id;

  if (database) {
    id = database.uuid ?? database.database_id ?? database.id;
    console.log(`D1 "${dbName}" ja existe: ${id}`);
  } else {
    console.log(`D1 "${dbName}" nao existe; criando…`);
    id = createDatabase();
    console.log(`D1 "${dbName}" criado: ${id}`);
  }

  const tomlPath = join(root, 'wrangler.toml');
  const toml = readFileSync(tomlPath, 'utf8');
  const pattern = /(database_id\s*=\s*")[^"]*(")/;
  if (!pattern.test(toml)) {
    throw new Error('wrangler.toml nao contem database_id para substituir.');
  }
  writeFileSync(tomlPath, toml.replace(pattern, `$1${id}$2`), 'utf8');
  console.log(`wrangler.toml atualizado com database_id=${id}`);

  const tomlAfter = readFileSync(tomlPath, 'utf8');
  if (!tomlAfter.includes(`database_id = "${id}"`)) {
    throw new Error('Falha ao atualizar wrangler.toml.');
  }
}

try {
  main();
} catch (error) {
  console.error(`\n[ensure-d1] ${error.message}\n`);
  process.exitCode = 1;
}
