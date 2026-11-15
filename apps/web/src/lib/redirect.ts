/** `target` resolved against `origin`, as path, search and hash, or null when it leaves that origin. */
function resolveOn(target: string, origin: string): string | null {
  let url: URL;
  try {
    url = new URL(target, origin);
  } catch {
    return null;
  }
  if (url.origin !== origin) return null;
  return `${url.pathname}${url.search}${url.hash}`;
}

/**
 * The path to send a just-signed-in user to, or null when `target` is not a
 * path on this site. The target is resolved the way the browser will resolve
 * it, against `origin`, and only a result on the same origin is kept. The
 * answer is the resolved path, search and hash, never the raw input.
 *
 * Resolving collapses dot segments, so a target such as `/.//host` lands on
 * this origin with a path that begins with `//`. Handed back to a router,
 * that string is a protocol-relative URL to another host. So the answer must
 * also be a fixed point: it must not begin with `//` or `/\`, and resolving
 * it again must stay on this origin and give back the same string. Whatever
 * then resolves the answer stays on this site.
 */
export function safeRedirectPath(target: string | null | undefined, origin: string): string | null {
  if (typeof target !== "string" || !target.startsWith("/")) return null;
  let own: string;
  try {
    own = new URL(origin).origin;
  } catch {
    return null;
  }
  const path = resolveOn(target, own);
  if (path === null || path.startsWith("//") || path.startsWith("/\\")) return null;
  return resolveOn(path, own) === path ? path : null;
}

/**
 * A path only ever resolves onto the origin it is resolved against, so any
 * fixed origin gives the same answer as the page's own, on the server too.
 */
const ANY_ORIGIN = "https://app.invalid";

/** `safeRedirectPath` for this app, usable in a server render as well as the browser. */
export function safeRedirectHere(target: string | null | undefined): string | null {
  return safeRedirectPath(target, ANY_ORIGIN);
}
