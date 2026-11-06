import { startMatch } from '../../../../shared/engine.js';
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
    await readJson(request);

    const outcome = await withRoom(env, code, {
      playerId: session.playerId,
      token: session.token,
      mutate: (room, now, viewer) => {
        startMatch(room, viewer.id, now);
        return { changed: true };
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
