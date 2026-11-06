/** Helpers HTTP das Pages Functions: JSON seguro, erros e sessão. */

import { MAX_BODY_BYTES } from './constants.js';
import { GameError } from './engine.js';
import { isPlainObject, isValidCode, isValidPlayerId, isValidToken, normalizeCode } from './validate.js';

export const SECURITY_HEADERS = Object.freeze({
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
  'x-frame-options': 'DENY',
  'cross-origin-resource-policy': 'same-origin',
});

export function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...SECURITY_HEADERS,
      ...extraHeaders,
    },
  });
}

export function apiError(error) {
  if (error instanceof GameError) {
    return json(
      { error: { code: error.code, message: error.message } },
      error.status,
    );
  }
  console.error('[forca] erro inesperado:', error);
  return json(
    { error: { code: 'INTERNAL_ERROR', message: 'O servidor tropeçou. Tente novamente.' } },
    500,
  );
}

export function methodNotAllowed(allow = 'POST') {
  return json(
    { error: { code: 'METHOD_NOT_ALLOWED', message: 'Método não permitido.' } },
    405,
    { allow },
  );
}

export async function readJson(request) {
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().startsWith('application/json')) {
    throw new GameError('UNSUPPORTED_MEDIA_TYPE', 'Envie JSON com Content-Type application/json.', 415);
  }

  const declaredLength = Number(request.headers.get('content-length') ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    throw new GameError('BODY_TOO_LARGE', 'Requisição grande demais.', 413);
  }

  let text;
  try {
    text = await request.text();
  } catch {
    throw new GameError('INVALID_BODY', 'Não foi possível ler a requisição.', 400);
  }

  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) {
    throw new GameError('BODY_TOO_LARGE', 'Requisição grande demais.', 413);
  }

  if (!text.trim()) return {};

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new GameError('INVALID_JSON', 'JSON inválido.', 400);
  }

  if (!isPlainObject(parsed)) {
    throw new GameError('INVALID_BODY', 'O corpo deve ser um objeto JSON.', 400);
  }
  return parsed;
}

export function sessionFrom(request) {
  const playerId = request.headers.get('x-player-id')?.trim() ?? '';
  const token = request.headers.get('x-player-token')?.trim() ?? '';
  if (!isValidPlayerId(playerId) || !isValidToken(token)) {
    throw new GameError('INVALID_SESSION', 'Sessão inválida. Volte ao lobby.', 401);
  }
  return { playerId, token };
}

export function optionalSessionFrom(request) {
  const playerId = request.headers.get('x-player-id')?.trim() ?? '';
  const token = request.headers.get('x-player-token')?.trim() ?? '';
  if (!playerId && !token) return null;
  if (!isValidPlayerId(playerId) || !isValidToken(token)) {
    throw new GameError('INVALID_SESSION', 'Sessão inválida. Volte ao lobby.', 401);
  }
  return { playerId, token };
}

export function codeParam(params) {
  const code = normalizeCode(params?.code);
  if (!isValidCode(code)) {
    throw new GameError('ROOM_NOT_FOUND', 'Sala não encontrada.', 404);
  }
  return code;
}
