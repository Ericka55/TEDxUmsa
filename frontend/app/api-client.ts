export function apiFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  // Old installations may still have bearer headers in callers; never send those tokens.
  headers.delete('Authorization');
  return fetch(input, { ...init, headers, credentials: 'include', cache: 'no-store' });
}
