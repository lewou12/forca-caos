import { leaveRoom } from '../../../../shared/engine.js';
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
        const result = leaveRoom(room, viewer.id, now);
        return { changed: result.changed, deleteRoom: result.deleteRoom };
      },
    });

    return json({ ok: true, deleted: Boolean(outcome?.deleted) });
  } catch (error) {
    if (error?.code === 'ROOM_NOT_FOUND' || error?.code === 'PLAYER_NOT_FOUND') {
      return json({ ok: true, deleted: true });
    }
    return apiError(error);
  }
}

export function onRequest() {
  return methodNotAllowed('POST');
}
