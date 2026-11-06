#!/usr/bin/env node
/**
 * Verificacoes estaticas do projeto:
 *  - sintaxe de todos os modulos (.js/.mjs)
 *  - arquivos obrigatorios
 *  - invariantes de seguranca do cliente (sem innerHTML/eval)
 *  - _headers, _routes.json e package.json coerentes
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const failures = [];
const checks = [];

function pass(name) {
  checks.push(`  \u2713 ${name}`);
}

function failCheck(name, detail) {
  failures.push(`${name}: ${detail}`);
  checks.push(`  \u2717 ${name} — ${detail}`);
}

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.git' || entry === '.wrangler') continue;
    const full = join(dir, entry);
    const info = statSync(full);
    if (info.isDirectory()) walk(full, out);
    else if (['.js', '.mjs'].includes(extname(entry))) out.push(full);
  }
  return out;
}

/* 1. sintaxe */
const sourceDirs = ['shared', 'functions', 'public/src', 'scripts', 'tests'];
const files = sourceDirs.flatMap((dir) => walk(join(root, dir)));
let syntaxFailures = 0;
for (const file of files) {
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  } catch (error) {
    syntaxFailures += 1;
    failCheck('sintaxe', `${relative(root, file)}\n${error.stderr?.toString() ?? error.message}`);
  }
}
if (syntaxFailures === 0) pass(`sintaxe de ${files.length} modulos`);

/* 2. arquivos obrigatorios */
const required = [
  'GDD.md',
  'debate_log.md',
  'estado_da_esteira.md',
  'DEPLOY.md',
  'package.json',
  'wrangler.toml',
  'migrations/0001_init.sql',
  'public/index.html',
  'public/styles.css',
  'public/_headers',
  'public/_routes.json',
  'public/favicon.svg',
  'public/src/main.js',
  'public/src/api.js',
  'public/src/views.js',
  'public/src/dom.js',
  'public/src/powerups.js',
  'public/src/sound.js',
  'shared/engine.js',
  'shared/store.js',
  'shared/cas.js',
  'tests/engine.test.js',
  'tests/security.test.js',
  'tests/race.test.js',
  '.github/workflows/test.yml',
  '.github/workflows/deploy.yml',
];
for (const path of required) {
  if (existsSync(join(root, path))) pass(`existe ${path}`);
  else failCheck('arquivo obrigatorio', path);
}

/* 3. invariantes de seguranca no cliente */
const clientFiles = walk(join(root, 'public', 'src'));
const forbidden = [
  { pattern: /\.innerHTML\s*=/, label: 'innerHTML' },
  { pattern: /\.outerHTML\s*=/, label: 'outerHTML' },
  { pattern: /\bdocument\.write\b/, label: 'document.write' },
  { pattern: /\beval\s*\(/, label: 'eval' },
  { pattern: /\bnew Function\b/, label: 'new Function' },
  { pattern: /insertAdjacentHTML/, label: 'insertAdjacentHTML' },
];
let securityFailures = 0;
for (const file of clientFiles) {
  const source = readFileSync(file, 'utf8');
  for (const rule of forbidden) {
    if (rule.pattern.test(source)) {
      securityFailures += 1;
      failCheck('invariante de seguranca', `${relative(root, file)} usa ${rule.label}`);
    }
  }
}
if (securityFailures === 0) pass(`cliente sem HTML dinamico inseguro (${clientFiles.length} arquivos)`);

/* 4. _headers e _routes.json */
const headers = readFileSync(join(root, 'public', '_headers'), 'utf8');
for (const header of [
  'Content-Security-Policy',
  'X-Content-Type-Options',
  'X-Frame-Options',
  'Referrer-Policy',
  'Permissions-Policy',
]) {
  if (headers.includes(header)) pass(`_headers contem ${header}`);
  else failCheck('_headers', `faltando ${header}`);
}
if (headers.includes("script-src 'self'") && !headers.includes("script-src 'unsafe-inline'")) {
  pass('CSP bloqueia script inline');
} else {
  failCheck('CSP', 'script-src deve ser apenas self');
}

try {
  const routes = JSON.parse(readFileSync(join(root, 'public', '_routes.json'), 'utf8'));
  if (routes.include?.includes('/api/*')) pass('_routes.json encaminha /api/* para Functions');
  else failCheck('_routes.json', 'include deve conter /api/*');
} catch (error) {
  failCheck('_routes.json', error.message);
}

/* 5. package.json */
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
for (const script of ['dev', 'test', 'check', 'smoke']) {
  if (pkg.scripts?.[script]) pass(`script npm ${script}`);
  else failCheck('package.json', `script ${script} ausente`);
}

/* 6. index.html referencia assets existentes */
const html = readFileSync(join(root, 'public', 'index.html'), 'utf8');
const assetRefs = [...html.matchAll(/(?:href|src)="(\/[^"]+)"/g)].map((match) => match[1]);
let missingAssets = 0;
for (const ref of new Set(assetRefs)) {
  if (ref.startsWith('/api/')) continue;
  const clean = ref.split('?')[0];
  if (!existsSync(join(root, 'public', clean.replace(/^\//, '')))) {
    missingAssets += 1;
    failCheck('asset do index.html', clean);
  }
}
if (missingAssets === 0) pass(`${new Set(assetRefs).size} assets do index.html existem`);

/* resultado */
console.log('\nForca Caos — verificacao estatica\n');
console.log(checks.join('\n'));
if (failures.length > 0) {
  console.error(`\n${failures.length} problema(s) encontrados.`);
  process.exitCode = 1;
} else {
  console.log(`\nTudo certo: ${checks.length} verificacoes.`);
}
