import { SECURITY_HEADERS } from '../shared/http.js';

export async function onRequest(context) {
  const response = await context.next();
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    if (!headers.has(name)) headers.set(name, value);
  }
  if (!headers.has('content-security-policy')) {
    headers.set('content-security-policy', "default-src 'none'; frame-ancestors 'none'");
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
