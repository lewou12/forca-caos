import {
  apiError,
  codeParam,
  json,
  methodNotAllowed,
  sessionFrom,
} from '../../../../shared/http.js';
import { withRoom } from '../../../../shared/store.js';

export async function onRequestGet(context) {
  try {
    const { request, env, params } = context;
    const code = codeParam(params);
    const session = sessionFrom(request);

    const outcome = await withRoom(env, code, {
      playerId: session.playerId,
      token: session.token,
    });

    return json({ snapshot: outcome.snapshot });
  } catch (error) {
    return apiError(error);
  }
}

export function onRequest() {
  return methodNotAllowed('GET');
}
