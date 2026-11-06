import { json, apiError, methodNotAllowed } from '../../shared/http.js';
import { pingDatabase } from '../../shared/store.js';

export async function onRequestGet(context) {
  try {
    await pingDatabase(context.env);
    return json({ ok: true, db: 'ok', ts: Date.now() });
  } catch {
    return json({ ok: false, db: 'down', ts: Date.now() }, 503);
  }
}

export function onRequest() {
  return methodNotAllowed('GET');
}
