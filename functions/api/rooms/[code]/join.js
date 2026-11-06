import { RATE_LIMITS } from '../../../../shared/constants.js';
import { joinRoom } from '../../../../shared/engine.js';
import {
  apiError,
  codeParam,
  json,
  methodNotAllowed,
  optionalSessionFrom,
  readJson,
} from '../../../../shared/http.js';
import { enforceRateLimit } from '../../../../shared/rate-limit.js';
import { withRoom } from '../../../../shared/store.js';

export async function onRequestPost(context) {
  try {
    const { request, env, params } = context;
    const code = codeParam(params);
    await enforceRateLimit(env, request, 'join', RATE_LIMITS.join);

    const body = await readJson(request);
    const session = optionalSessionFrom(request);

    const outcome = await withRoom(env, code, {
      playerId: session?.playerId ?? null,
      token: session?.token ?? null,
      mutate: (room, now) => {
        const joined = joinRoom(room, {
          name: body.name,
          playerId: session?.playerId ?? null,
          token: session?.token ?? null,
          now,
        });
        return {
          changed: joined.changed,
          viewerId: joined.player.id,
          result: { playerId: joined.player.id, token: joined.token },
        };
      },
    });

    return json({
      code,
      ...outcome.result,
      snapshot: outcome.snapshot,
    });
  } catch (error) {
    return apiError(error);
  }
}

export function onRequest() {
  return methodNotAllowed('POST');
}
