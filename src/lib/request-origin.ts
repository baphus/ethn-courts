export function hasValidOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const url = new URL(request.url);
  const host = request.headers.get("host");
  // Next's local server may construct request.url with localhost instead of the Host header.
  if (url.protocol === "http:" && url.hostname === "localhost" && host && /^(?:localhost|127\.0\.0\.1)(?::\d+)?$/i.test(host)) {
    return origin === `http://${host}`;
  }
  return origin === url.origin;
}
