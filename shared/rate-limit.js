/** Rate limiting simples por IP anonimizado + ação + janela. */

import { GameError } from './engine.js';

async function sha256Hex(value) {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function enforceRateLimit(env, request, action, { max, windowMs }) {
  if (!env?.DB) {
    throw new GameError('DB_UNAVAILABLE', 'Banco de dados indisponível.', 503);
  }
  const ip = request.headers.get('cf-connecting-ip')?.trim() || 'local';
  const hash = await sha256Hex(`${action}:${ip}`);
  const now = Date.now();
  const bucket = Math.floor(now / windowMs);
  const key = `${action}:${hash}:${bucket}`;

  const row = await env.DB
    .prepare(
      `INSERT INTO rate_limits (key, count, window_start)
       VALUES (?, 1, ?)
       ON CONFLICT(key) DO UPDATE SET count = count + 1
       RETURNING count`,
    )
    .bind(key, now)
    .first();

  if ((row?.count ?? 0) > max) {
    throw new GameError('RATE_LIMIT', 'Muitas tentativas. Respire e tente de novo em instantes.', 429);
  }
}

export async function cleanupRateLimits(env, now = Date.now()) {
  if (!env?.DB) return;
  await env.DB
    .prepare('DELETE FROM rate_limits WHERE window_start < ?')
    .bind(now - 24 * 60 * 60 * 1000)
    .run();
}
