/** @jest-environment node */
import { createHash } from "node:crypto";
import { GET as linkComplete } from "../google/link/complete/route";
import { POST as linkStart } from "../google/link/start/route";
import { browserRequest, jsonResponse, randomValue, setCookies, withEnv } from "./support";

// The web half of linking Google. A fake backend keeps the one rule the real
// one enforces on the exchange (apps/backend/src/routes/authGoogle.ts): the
// link is made only when the SHA-256 of the nonce the browser presents equals
// the `bind` the start was signed over. So these tests prove the handlers
// carry each browser's own nonce end to end. That a code is spent on first use
// is the backend's rule, tested there.

const fetchSpy = jest.fn<Promise<Response>, Parameters<typeof fetch>>();
let secret: string;
let restore: () => void;

beforeEach(() => {
  secret = randomValue();
  restore = withEnv({ BFF_SECRET: secret, BACKEND_URL: "http://backend.test" });
  fetchSpy.mockReset();
  global.fetch = fetchSpy as unknown as typeof fetch;
});
afterEach(() => restore());

const sha256 = (value: string): string => createHash("sha256").update(value).digest("hex");

/** One backend: codes it issued, keyed by code, each bound to a start's `bind` and a Google account. */
function fakeBackend(): { issue: (bind: string, googleId: string) => string; holders: Map<string, string> } {
  const codes = new Map<string, { bind: string; googleId: string }>();
  // Google id -> the user holding it.
  const holders = new Map<string, string>();
  fetchSpy.mockImplementation(async (url, init) => {
    const path = String(url).replace("http://backend.test/api/v1", "");
    const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, string>;
    if (path === "/auth/link/google/start")
      return jsonResponse(200, { url: `https://accounts.google.test/?b=${body.bind}` });
    if (path === "/auth/link/google/exchange") {
      const grant = codes.get(body.code);
      if (!grant || sha256(body.nonce) !== grant.bind) return jsonResponse(401, { code: "google_failed" });
      const holder = holders.get(grant.googleId);
      if (holder && holder !== "me") return jsonResponse(409, { code: "google_taken" });
      holders.set(grant.googleId, "me");
      return new Response(null, { status: 204 });
    }
    return jsonResponse(404, {});
  });
  return {
    issue: (bind, googleId) => {
      const code = randomValue();
      codes.set(code, { bind, googleId });
      return code;
    },
    holders,
  };
}

/** Starts a link in one browser: the nonce cookie it got, and the bind the backend received. */
async function start(): Promise<{ nonce: string; bind: string }> {
  const res = await linkStart(
    browserRequest("/api/auth/google/link/start", { headers: { authorization: "Bearer t" } }),
  );
  expect(res.status).toBe(200);
  const nonce = setCookies(res).find((c) => c.name === "__google_link")!.value;
  const startCall = fetchSpy.mock.calls.find(([url]) => String(url).endsWith("/auth/link/google/start"))!;
  const { bind } = JSON.parse(String(startCall[1]?.body)) as { bind: string };
  return { nonce, bind };
}

function complete(code: string | null, nonce: string | null): Promise<Response> {
  const query = code === null ? "" : `?code=${code}`;
  return linkComplete(
    browserRequest(`/api/auth/google/link/complete${query}`, {
      method: "GET",
      site: "cross-site",
      cookies: nonce === null ? {} : { __google_link: nonce },
    }),
  );
}

const resultOf = (res: Response): string | null => new URL(res.headers.get("location")!).searchParams.get("google");

/** The answer deletes the nonce cookie at the path it was set on, so a nonce is spent on every outcome. */
function expectNonceCleared(res: Response): void {
  const cleared = setCookies(res).find((c) => c.name === "__google_link");
  expect(cleared).toBeDefined();
  expect(cleared!.line).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/);
  expect(cleared!.line).toMatch(/Path=\/api\/auth\/google\/link(;|$)/);
}

describe("starting a Google link", () => {
  it("sets an httpOnly nonce cookie for the link handlers only, and relays its hash with the bearer and the secret", async () => {
    fakeBackend();
    const res = await linkStart(
      browserRequest("/api/auth/google/link/start", { headers: { authorization: "Bearer the-access" } }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const cookie = setCookies(res).find((c) => c.name === "__google_link")!;
    expect(cookie.line).toMatch(/HttpOnly/i);
    expect(cookie.line).toMatch(/SameSite=lax/i);
    expect(cookie.line).toMatch(/Path=\/api\/auth\/google\/link(;|$)/);

    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toBe("http://backend.test/api/v1/auth/link/google/start");
    const headers = new Headers(init?.headers);
    expect(headers.get("authorization")).toBe("Bearer the-access");
    expect(headers.get("x-bff-secret")).toBe(secret);
    expect(JSON.parse(String(init?.body))).toEqual({ bind: sha256(cookie.value) });
    // The nonce itself never leaves this server.
    expect(String(init?.body)).not.toContain(cookie.value);
    expect(await res.json()).toEqual({ url: `https://accounts.google.test/?b=${sha256(cookie.value)}` });
  });

  it("marks the nonce cookie Secure in production", async () => {
    const restoreEnv = withEnv({ NODE_ENV: "production" });
    try {
      fakeBackend();
      const res = await linkStart(
        browserRequest("/api/auth/google/link/start", {
          // Production relays the client address the platform set.
          headers: { authorization: "Bearer t", "x-real-ip": "203.0.113.9" },
        }),
      );
      expect(res.status).toBe(200);
      expect(setCookies(res).find((c) => c.name === "__google_link")!.line).toMatch(/;\s*Secure/i);
    } finally {
      restoreEnv();
    }
  });

  it("refuses without a bearer and relays nothing", async () => {
    const res = await linkStart(browserRequest("/api/auth/google/link/start"));
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ code: "unauthorized" });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(setCookies(res)).toEqual([]);
  });

  it("refuses a cross-site start and relays nothing", async () => {
    const res = await linkStart(
      browserRequest("/api/auth/google/link/start", { site: "cross-site", headers: { authorization: "Bearer t" } }),
    );
    expect(res.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(setCookies(res)).toEqual([]);
  });

  it("passes a backend refusal through and sets no nonce", async () => {
    fetchSpy.mockResolvedValue(jsonResponse(409, { message: "x", code: "google_already_linked" }));
    const res = await linkStart(
      browserRequest("/api/auth/google/link/start", { headers: { authorization: "Bearer t" } }),
    );
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "google_already_linked" });
    expect(setCookies(res)).toEqual([]);
  });

  it("answers 503 server_unreachable when the backend cannot be reached", async () => {
    fetchSpy.mockRejectedValue(new TypeError("down"));
    const res = await linkStart(
      browserRequest("/api/auth/google/link/start", { headers: { authorization: "Bearer t" } }),
    );
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ code: "server_unreachable" });
  });
});

describe("finishing a Google link", () => {
  it("links with the starting browser's own nonce, goes back to Settings, and clears the nonce", async () => {
    const backend = fakeBackend();
    const { nonce, bind } = await start();
    const res = await complete(backend.issue(bind, "g-1"), nonce);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("http://localhost:3000/settings?google=linked");
    expect(backend.holders.get("g-1")).toBe("me");
    expectNonceCleared(res);
  });

  it("links nothing for a code finished in another browser, whose nonce is not this one", async () => {
    const backend = fakeBackend();
    const attacker = await start();
    const victim = await start();
    const res = await complete(backend.issue(attacker.bind, "g-attacker"), victim.nonce);
    expect(resultOf(res)).toBe("failed");
    expect(backend.holders.size).toBe(0);
    expectNonceCleared(res);
  });

  it("links nothing and relays nothing without a nonce cookie", async () => {
    const backend = fakeBackend();
    const { bind } = await start();
    fetchSpy.mockClear();
    const res = await complete(backend.issue(bind, "g-1"), null);
    expect(resultOf(res)).toBe("failed");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(backend.holders.size).toBe(0);
    expectNonceCleared(res);
  });

  it("links nothing without a code", async () => {
    fakeBackend();
    const { nonce } = await start();
    fetchSpy.mockClear();
    expect(resultOf(await complete(null, nonce))).toBe("failed");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("says taken for a Google account another user holds, and links nothing", async () => {
    const backend = fakeBackend();
    backend.holders.set("g-1", "someone-else");
    const { nonce, bind } = await start();
    const res = await complete(backend.issue(bind, "g-1"), nonce);
    expect(resultOf(res)).toBe("taken");
    expect(backend.holders.get("g-1")).toBe("someone-else");
    expectNonceCleared(res);
  });

  it("says already when this account holds another Google account", async () => {
    fetchSpy.mockResolvedValue(jsonResponse(409, { code: "google_already_linked" }));
    const res = await complete(randomValue(), randomValue());
    expect(resultOf(res)).toBe("already");
    expectNonceCleared(res);
  });

  it("says failed when the backend cannot be reached", async () => {
    fetchSpy.mockRejectedValue(new TypeError("down"));
    expect(resultOf(await complete(randomValue(), randomValue()))).toBe("failed");
  });
});
