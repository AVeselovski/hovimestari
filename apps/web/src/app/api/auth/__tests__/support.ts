import { NextRequest } from "next/server";

export const ORIGIN = "http://localhost:3000";

/** A browser request to one of the handlers. Same-origin by default, as a fetch from the app sends it. */
export function browserRequest(
  path: string,
  {
    method = "POST",
    body,
    contentType = body === undefined ? undefined : "application/json",
    site = "same-origin",
    origin,
    cookies = {},
    headers = {},
  }: {
    method?: string;
    body?: string;
    contentType?: string;
    site?: string | null;
    origin?: string;
    cookies?: Record<string, string>;
    headers?: Record<string, string>;
  } = {},
): NextRequest {
  const h = new Headers(headers);
  // A browser sends the address it loaded the page from.
  if (!h.has("host")) h.set("host", new URL(ORIGIN).host);
  if (contentType) h.set("content-type", contentType);
  if (site !== null) h.set("sec-fetch-site", site);
  if (origin) h.set("origin", origin);
  const cookie = Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
  if (cookie) h.set("cookie", cookie);
  return new NextRequest(`${ORIGIN}${path}`, { method, body, headers: h });
}

/** A random value of the kind a token or a nonce is, made at run time. */
export function randomValue(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

/** A session grant as the backend answers one. Values are made at run time. */
export function grant(): { accessToken: string; refreshToken: string; user: Record<string, unknown> } {
  return {
    accessToken: `access-${randomValue()}`,
    refreshToken: `refresh-${randomValue()}`,
    user: {
      id: crypto.randomUUID(),
      email: "ada@example.com",
      hasPassword: true,
      hasGoogle: false,
      foodNameLanguage: "en",
      timeZone: "Europe/Helsinki",
    },
  };
}

export function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

/** Every Set-Cookie of a response, parsed to name, value and the raw line. */
export function setCookies(res: Response): Array<{ name: string; value: string; line: string }> {
  return res.headers.getSetCookie().map((line) => {
    const [pair] = line.split(";");
    const at = pair.indexOf("=");
    return { name: pair.slice(0, at), value: pair.slice(at + 1), line };
  });
}

/** Sets an environment variable for one test. Returns the restore. */
export function withEnv(values: Record<string, string | undefined>): () => void {
  const env = process.env as Record<string, string | undefined>;
  const before = Object.fromEntries(Object.keys(values).map((k) => [k, env[k]]));
  for (const [k, v] of Object.entries(values)) {
    if (v === undefined) delete env[k];
    else env[k] = v;
  }
  return () => {
    for (const [k, v] of Object.entries(before)) {
      if (v === undefined) delete env[k];
      else env[k] = v;
    }
  };
}
