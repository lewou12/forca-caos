import { applyPowerup } from '../../../../shared/engine.js';
import {
  apiError,
  codeParam,
  json,
  methodNotAllowed,
  readJson,
  sessionFrom,
} from '../../../../shared/http.js';
import { withRoom } from '../../../../shared/store.js';

export async function onRequestPost(context) {
  try {
    const { request, env, params } = context;
    const code = codeParam(params);
    const session = sessionFrom(request);
    const body = await readJson(request);
    const targetId = typeof body.targetId === 'string' ? body.targetId : null;

    const outcome = await withRoom(env, code, {
      playerId: session.playerId,
      token: session.token,
      mutate: (room, now, viewer) => {
        const result = applyPowerup(
          room,
          viewer.id,
          body.powerupId,
          targetId,
          body.actionId,
          now,
        );
        return { changed: result.changed };
      },
    });

    return json({ snapshot: outcome.snapshot });
  } catch (error) {
    return apiError(error);
  }
}

export function onRequest() {
  return methodNotAllowed('POST');
}
