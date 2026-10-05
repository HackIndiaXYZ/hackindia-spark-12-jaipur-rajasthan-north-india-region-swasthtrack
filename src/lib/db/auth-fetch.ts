/**
 * `fetch` for our own API routes. The session travels in an HttpOnly cookie the browser
 * attaches by itself, so this only fixes the content type and the credentials mode.
 */
export async function authFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  return fetch(input, { ...init, headers, credentials: "same-origin" });
}
