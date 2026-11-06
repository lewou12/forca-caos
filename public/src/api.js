/**
 * Cliente HTTP da API. Nenhuma regra de jogo mora aqui: apenas transporte,
 * sessao e traducao de erros para portugues.
 */

const SESSION_KEY = 'forca.sessao.v1';

export class ApiError extends Error {
  constructor(code, message, status) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    if (!parsed.code || !parsed.playerId || !parsed.token) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveSession(session) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    /* modo privado: a sessao vive apenas na memoria da pagina */
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignora */
  }
}

async function request(method, path, { body, session, signal } = {}) {
  const headers = { accept: 'application/json' };
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (session) {
    headers['x-player-id'] = session.playerId;
    headers['x-player-token'] = session.token;
  }

  let response;
  try {
    response = await fetch(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
      cache: 'no-store',
      credentials: 'same-origin',
    });
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    throw new ApiError('NETWORK', 'Sem conexao. Verifique sua internet.', 0);
  }

  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      throw new ApiError('BAD_RESPONSE', 'Resposta inesperada do servidor.', response.status);
    }
  }

  if (!response.ok) {
    const detail = data?.error;
    throw new ApiError(
      detail?.code ?? 'HTTP_ERROR',
      detail?.message ?? 'Algo deu errado. Tente novamente.',
      response.status,
    );
  }
  return data;
}

export const api = {
  health(signal) {
    return request('GET', '/api/health', { signal });
  },

  createRoom({ name, wordLength }, signal) {
    return request('POST', '/api/rooms', { body: { name, wordLength }, signal });
  },

  joinRoom(code, name, session, signal) {
    return request('POST', `/api/rooms/${encodeURIComponent(code)}/join`, {
      body: { name },
      session,
      signal,
    });
  },

  state(session, signal) {
    return request('GET', `/api/rooms/${encodeURIComponent(session.code)}/state`, {
      session,
      signal,
    });
  },

  start(session, signal) {
    return request('POST', `/api/rooms/${encodeURIComponent(session.code)}/start`, {
      body: {},
      session,
      signal,
    });
  },

  guess(session, letter, actionId, signal) {
    return request('POST', `/api/rooms/${encodeURIComponent(session.code)}/guess`, {
      body: { letter, actionId },
      session,
      signal,
    });
  },

  powerup(session, powerupId, targetId, actionId, signal) {
    return request('POST', `/api/rooms/${encodeURIComponent(session.code)}/powerup`, {
      body: { powerupId, targetId, actionId },
      session,
      signal,
    });
  },

  leave(session, signal) {
    return request('POST', `/api/rooms/${encodeURIComponent(session.code)}/leave`, {
      body: {},
      session,
      signal,
    }).catch(() => ({ ok: true, deleted: true }));
  },
};

let counter = 0;
export function newActionId() {
  counter += 1;
  const random = Math.random().toString(36).slice(2, 8);
  return `a${Date.now().toString(36)}${counter.toString(36)}${random}`;
}
