/** @jest-environment node */
import { createHash } from "node:crypto";
import { GET as googleComplete } from "../google/complete/route";
import { GET as googleStart } from "../google/start/route";
import { POST as refresh } from "../refresh/route";
import { POST as signIn } from "../sign-in/route";
import { POST as signOut } from "../sign-out/route";
import { POST as signUp } from "../sign-up/route";
import { browserRequest, grant, jsonResponse, randomValue, setCookies, withEnv } from "./support";

const fetchSpy = jest.fn<Promise<Response>, Parameters<typeof fetch>>();
let secret: string;
let restore: () => void;

beforeEach(() => {
  secret = randomValue();
  restore = withEnv({
    BFF_SECRET: secret,
    BACKEND_URL: "http://backend.test",
    NEXT_PUBLIC_API_URL: "http://backend.test/api/v1",
  });
  fetchSpy.mockReset();
  global.fetch = fetchSpy as unknown as typeof fetch;
});
afterEach(() => restore());

/** The one call the handler relayed: its URL, headers and parsed body. */
function relayed(): { url: string; headers: Headers; body: unknown } {
  expect(fetchSpy).toHaveBeenCalledTimes(1);
  const [url, init] = fetchSpy.mock.calls[0];
  return {
    url: String(url),
    headers: new Headers(init?.headers),
    body: init?.body ? JSON.parse(String(init.body)) : undefined,
  };
}

const credentials = JSON.stringify({ email: "ada@example.com", password: `pw-${randomValue()}` });

describe("sign-in and sign-up", () => {
  it.each([
    ["sign-in", signIn, "/api/v1/auth/login", 200],
    ["sign-up", signUp, "/api/v1/auth/register", 201],
  ] as const)(
    "%s relays with the secret and the address, sets the cookie, and hands over no refresh token",
    async (_n, handler, path, status) => {
      const g = grant();
      fetchSpy.mockResolvedValue(jsonResponse(status, g));
      const res = await handler(
        browserRequest("/api/auth/x", { body: credentials, headers: { "x-real-ip": "203.0.113.7" } }),
      );

      const call = relayed();
      expect(call.url).toBe(`http://backend.test${path}`);
      expect(call.headers.get("X-Bff-Secret")).toBe(secret);
      expect(call.headers.get("X-Client-Ip")).toBe("203.0.113.7");
      expect(call.body).toEqual(JSON.parse(credentials));

      expect(res.status).toBe(status);
      const body = await res.text();
      expect(body).not.toContain("refreshToken");
      expect(body).not.toContain(g.refreshToken);
      expect(JSON.parse(body)).toEqual({ accessToken: g.accessToken, user: g.user });

      const [cookie] = setCookies(res);
      expect(cookie.name).toBe("__refresh_token");
      expect(cookie.value).toBe(g.refreshToken);
      expect(cookie.line).toMatch(/HttpOnly/i);
      expect(cookie.line).toMatch(/SameSite=strict/i);
      expect(cookie.line).toMatch(/Path=\/api\/auth/);
    },
  );

  it("passes a refusal through with its status, code and Retry-After, and sets no cookie", async () => {
    fetchSpy.mockResolvedValue(
      jsonResponse(429, { message: "Too many.", code: "login_rate_limited" }, { "Retry-After": "900" }),
    );
    const res = await signIn(browserRequest("/api/auth/sign-in", { body: credentials }));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("900");
    expect(await res.json()).toEqual({ message: "Too many.", code: "login_rate_limited" });
    expect(setCookies(res)).toEqual([]);
  });

  it("answers 503 server_unreachable when the backend cannot be reached", async () => {
    fetchSpy.mockRejectedValue(new TypeError("fetch failed"));
    const res = await signIn(browserRequest("/api/auth/sign-in", { body: credentials }));
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ code: "server_unreachable" });
  });

  it("answers 502 for a 200 whose body is not JSON, and passes a non-JSON refusal by status", async () => {
    fetchSpy.mockResolvedValueOnce(new Response("<html>", { status: 200 }));
    const ok = await signIn(browserRequest("/api/auth/sign-in", { body: credentials }));
    expect(ok.status).toBe(502);
    expect(setCookies(ok)).toEqual([]);
    fetchSpy.mockResolvedValueOnce(new Response("Bad Gateway", { status: 502 }));
    const refused = await signIn(browserRequest("/api/auth/sign-in", { body: credentials }));
    expect(refused.status).toBe(502);
  });

  it("answers 400 for a body that is not JSON, without relaying", async () => {
    const res = await signIn(browserRequest("/api/auth/sign-in", { body: "{not json" }));
    expect(res.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("sends the loopback address in development when x-real-ip is absent", async () => {
    fetchSpy.mockResolvedValue(jsonResponse(200, grant()));
    await signIn(browserRequest("/api/auth/sign-in", { body: credentials }));
    expect(relayed().headers.get("X-Client-Ip")).toBe("127.0.0.1");
  });
});

describe("the client address in production", () => {
  let restoreEnv: () => void;
  beforeEach(() => {
    restoreEnv = withEnv({ NODE_ENV: "production" });
  });
  afterEach(() => restoreEnv());

  it("answers 500 without x-real-ip and relays nothing, whatever x-forwarded-for says", async () => {
    const res = await signIn(
      browserRequest("/api/auth/sign-in", { body: credentials, headers: { "x-forwarded-for": "198.51.100.1" } }),
    );
    expect(res.status).toBe(500);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("sends x-real-ip and never x-forwarded-for", async () => {
    fetchSpy.mockResolvedValue(jsonResponse(200, grant()));
    await signIn(
      browserRequest("/api/auth/sign-in", {
        body: credentials,
        headers: { "x-real-ip": "203.0.113.9", "x-forwarded-for": "198.51.100.1" },
      }),
    );
    expect(relayed().headers.get("X-Client-Ip")).toBe("203.0.113.9");
  });

  it("falls back to the loopback address for a local production run, and never on Vercel", async () => {
    fetchSpy.mockResolvedValue(jsonResponse(200, grant()));
    const local = withEnv({ LOCAL_PRODUCTION_RELAY: "1", VERCEL: undefined });
    await signIn(browserRequest("/api/auth/sign-in", { body: credentials }));
    expect(relayed().headers.get("X-Client-Ip")).toBe("127.0.0.1");
    local();

    fetchSpy.mockClear();
    const vercel = withEnv({ LOCAL_PRODUCTION_RELAY: "1", VERCEL: "1" });
    const res = await signIn(browserRequest("/api/auth/sign-in", { body: credentials }));
    vercel();
    expect(res.status).toBe(500);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("answers 500 and calls nothing when BACKEND_URL is not set", async () => {
    const unset = withEnv({ BACKEND_URL: undefined });
    const res = await signIn(
      browserRequest("/api/auth/sign-in", { body: credentials, headers: { "x-real-ip": "203.0.113.9" } }),
    );
    unset();
    expect(res.status).toBe(500);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("sends Google to sign-in with google_unavailable when NEXT_PUBLIC_API_URL is not set", async () => {
    const unset = withEnv({ NEXT_PUBLIC_API_URL: undefined });
    const res = await googleStart(browserRequest("/api/auth/google/start", { method: "GET" }));
    unset();
    expect(res.headers.get("location")).toBe("http://localhost:3000/auth/sign-in?error=google_unavailable");
    expect(setCookies(res)).toEqual([]);
  });

  it("marks the refresh cookie Secure", async () => {
    fetchSpy.mockResolvedValue(jsonResponse(200, grant()));
    const res = await signIn(
      browserRequest("/api/auth/sign-in", { body: credentials, headers: { "x-real-ip": "203.0.113.9" } }),
    );
    expect(setCookies(res)[0].line).toMatch(/Secure/);
  });
});

describe("refresh", () => {
  it("rotates the cookie and hands over no refresh token", async () => {
    const old = randomValue();
    const g = grant();
    fetchSpy.mockResolvedValue(jsonResponse(200, g));
    const res = await refresh(browserRequest("/api/auth/refresh", { cookies: { __refresh_token: old } }));
    expect(relayed().body).toEqual({ refreshToken: old });
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).not.toContain("refreshToken");
    expect(setCookies(res)[0]).toMatchObject({ name: "__refresh_token", value: g.refreshToken });
  });

  it("deletes the cookie on the backend's 401", async () => {
    fetchSpy.mockResolvedValue(jsonResponse(401, { message: "x", code: "session_expired" }));
    const res = await refresh(browserRequest("/api/auth/refresh", { cookies: { __refresh_token: randomValue() } }));
    expect(res.status).toBe(401);
    const [cookie] = setCookies(res);
    expect(cookie.name).toBe("__refresh_token");
    expect(cookie.line).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/);
  });

  it("keeps the cookie and answers 503 server_unreachable when the backend cannot be reached", async () => {
    fetchSpy.mockRejectedValue(new TypeError("fetch failed"));
    const res = await refresh(browserRequest("/api/auth/refresh", { cookies: { __refresh_token: randomValue() } }));
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ code: "server_unreachable" });
    expect(setCookies(res)).toEqual([]);
  });

  it.each([
    ["a server error", () => jsonResponse(500, { message: "x" })],
    ["a refused relay secret", () => jsonResponse(401, { message: "x", code: "request_refused" })],
    ["a 401 that is not JSON", () => new Response("Unauthorized", { status: 401 })],
  ])("keeps the cookie and answers 502, not unreachable, on %s", async (_case, answer) => {
    fetchSpy.mockResolvedValue(answer());
    const res = await refresh(browserRequest("/api/auth/refresh", { cookies: { __refresh_token: randomValue() } }));
    expect(res.status).toBe(502);
    expect((await res.json()).code).toBeUndefined();
    expect(setCookies(res)).toEqual([]);
  });

  it("answers 502 without a cookie for a 200 whose body is not JSON", async () => {
    fetchSpy.mockResolvedValue(new Response("<html>", { status: 200 }));
    const res = await refresh(browserRequest("/api/auth/refresh", { cookies: { __refresh_token: randomValue() } }));
    expect(res.status).toBe(502);
    expect(setCookies(res)).toEqual([]);
  });

  it("answers 401 without calling the backend when there is no cookie", async () => {
    const res = await refresh(browserRequest("/api/auth/refresh"));
    expect(res.status).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("sign-out", () => {
  it("tells the backend and deletes the cookie", async () => {
    const token = randomValue();
    fetchSpy.mockResolvedValue(new Response(null, { status: 204 }));
    const res = await signOut(browserRequest("/api/auth/sign-out", { cookies: { __refresh_token: token } }));
    expect(relayed()).toMatchObject({ url: "http://backend.test/api/v1/auth/logout", body: { refreshToken: token } });
    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");
    expect(setCookies(res)[0].line).toMatch(/__refresh_token=;.*Path=\/api\/auth/);
  });

  it("deletes the cookie even when the backend cannot be reached", async () => {
    fetchSpy.mockRejectedValue(new TypeError("fetch failed"));
    const res = await signOut(browserRequest("/api/auth/sign-out", { cookies: { __refresh_token: randomValue() } }));
    expect(res.status).toBe(204);
    expect(setCookies(res)[0].name).toBe("__refresh_token");
  });
});

describe("Google sign-in", () => {
  it("start sets a nonce cookie and sends only its SHA-256 to the backend", async () => {
    const res = await googleStart(browserRequest("/api/auth/google/start", { method: "GET", site: "none" }));
    expect(res.status).toBe(302);
    const [cookie] = setCookies(res);
    expect(cookie.name).toBe("__google_sign_in");
    expect(cookie.line).toMatch(/HttpOnly/i);
    expect(cookie.line).toMatch(/SameSite=lax/i);
    expect(cookie.line).toMatch(/Path=\/api\/auth\/google/);
    const location = new URL(res.headers.get("location")!);
    expect(`${location.origin}${location.pathname}`).toBe("http://backend.test/api/v1/auth/google");
    expect(location.searchParams.get("bind")).toBe(createHash("sha256").update(cookie.value).digest("hex"));
    expect(res.headers.get("location")).not.toContain(cookie.value);
    expect(await res.text()).not.toContain("refreshToken");
  });

  it("each start makes a new nonce", async () => {
    const a = setCookies(
      await googleStart(browserRequest("/api/auth/google/start", { method: "GET", site: "none" })),
    )[0].value;
    const b = setCookies(
      await googleStart(browserRequest("/api/auth/google/start", { method: "GET", site: "none" })),
    )[0].value;
    expect(a).not.toBe(b);
  });

  function complete(cookies: Record<string, string>, code = randomValue()): ReturnType<typeof googleComplete> {
    return googleComplete(
      browserRequest(`/api/auth/google/complete?code=${code}`, { method: "GET", site: "cross-site", cookies }),
    );
  }

  it("complete exchanges the code with this browser's nonce, sets the session cookie and clears the nonce", async () => {
    const nonce = randomValue();
    const code = randomValue();
    const g = grant();
    fetchSpy.mockResolvedValue(jsonResponse(200, g));
    const res = await complete({ __google_sign_in: nonce }, code);

    expect(relayed()).toMatchObject({ url: "http://backend.test/api/v1/auth/google/exchange", body: { code, nonce } });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("http://localhost:3000/auth/sign-in");
    const cookies = setCookies(res);
    expect(cookies.find((c) => c.name === "__refresh_token")?.value).toBe(g.refreshToken);
    expect(cookies.find((c) => c.name === "__google_sign_in")?.line).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/);
    expect(await res.text()).not.toContain("refreshToken");
  });

  it("without a nonce cookie, fails without relaying and sets no session", async () => {
    const res = await complete({});
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(res.headers.get("location")).toBe("http://localhost:3000/auth/sign-in?error=google_failed");
    expect(setCookies(res).map((c) => c.name)).toEqual(["__google_sign_in"]);
  });

  it.each([
    ["another browser's nonce", 401],
    ["a spent code", 401],
    ["a backend failure", 500],
  ])("with %s the backend refuses, and the browser gets google_failed and no session", async (_case, status) => {
    fetchSpy.mockResolvedValue(jsonResponse(status, { message: "x", code: "google_failed" }));
    const res = await complete({ __google_sign_in: randomValue() });
    expect(res.headers.get("location")).toBe("http://localhost:3000/auth/sign-in?error=google_failed");
    const names = setCookies(res).map((c) => c.name);
    expect(names).not.toContain("__refresh_token");
    expect(names).toContain("__google_sign_in");
  });

  it("without a code, fails without relaying", async () => {
    const res = await googleComplete(
      browserRequest("/api/auth/google/complete", { method: "GET", cookies: { __google_sign_in: randomValue() } }),
    );
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(res.headers.get("location")).toContain("error=google_failed");
  });
});
