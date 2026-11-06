import { DEFAULT_WORD_LENGTH } from '../../../shared/constants.js';
import { createRoom, GameError, snapshot } from '../../../shared/engine.js';
import { apiError, json, methodNotAllowed, readJson } from '../../../shared/http.js';
import { cleanupRateLimits, enforceRateLimit } from '../../../shared/rate-limit.js';
import { insertRoom } from '../../../shared/store.js';
import { RATE_LIMITS } from '../../../shared/constants.js';

export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    await enforceRateLimit(env, request, 'create', RATE_LIMITS.create);
    const body = await readJson(request);
    const wordLength = body.wordLength === undefined ? DEFAULT_WORD_LENGTH : Number(body.wordLength);

    await cleanupRateLimits(env);

    for (let attempt = 0; attempt < 6; attempt += 1) {
      const now = Date.now();
      const { room, playerId, token } = createRoom({
        name: body.name,
        wordLength,
        now,
      });
      const inserted = await insertRoom(env, room, now);
      if (!inserted) continue;
      return json(
        {
          code: room.code,
          playerId,
          token,
          snapshot: snapshot(room, playerId, now),
        },
        201,
      );
    }

    throw new GameError('CODE_GENERATION_FAILED', 'Não foi possível criar a sala. Tente novamente.', 503);
  } catch (error) {
    return apiError(error);
  }
}

export function onRequest() {
  return methodNotAllowed('POST');
}
