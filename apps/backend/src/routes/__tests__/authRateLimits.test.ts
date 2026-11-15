import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import request from "supertest";
import { testPassword } from "../../__tests__/support/credentials.js";
import { relayHeaders } from "../../__tests__/support/relay.js";

// The sign-in, sign-up and password-reset endpoints are rate limited. Failed
// sign-ins count per address and email, so one account's guesses never lock
// out another account behind the same address, with a looser cap per address
// against guessing many accounts. Sign-up and reset count per address. The
// limiters are module-level, so every case starts from clean books
// (resetAuthRateLimits). Sign-in and sign-up are relayed by the web server,
// which names the browser's address in X-Client-Ip beside the relay secret.

const mockDbSelect = jest.fn();
jest.unstable_mockModule("../../db/index.js", () => ({
  db: { select: mockDbSelect, insert: jest.fn(), update: jest.fn(), delete: jest.fn(), transaction: jest.fn() },
}));
jest.unstable_mockModule("../../lib/email.js", () => ({
  sendPasswordResetEmail: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
}));

const { app } = await import("../../app.js");
const { env } = await import("../../lib/env.js");
const { AUTH_RATE_LIMITS, loginKeyOf, resetAuthRateLimits } = await import("../../middleware/authRateLimits.js");

/** Every lookup finds no user: a failed sign-in, a free email, an unknown reset address. */
function noUsers() {
  mockDbSelect.mockImplementation(() => {
    const chain: Record<string, jest.Mock> = {
      from: jest.fn(),
      where: jest.fn(),
      limit: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
    };
    chain.from.mockReturnValue(chain);
    chain.where.mockReturnValue(chain);
    return chain;
  });
}

/** A relayed sign-in from the browser at `ip`. */
const login = (ip?: string, email = "someone@example.com") =>
  request(app).post("/api/v1/auth/login").set(relayHeaders(ip)).send({ email, password: testPassword() });
const register = () => request(app).post("/api/v1/auth/register").set(relayHeaders()).send({ email: "not-an-email" });
const forgot = (headers: Record<string, string> = {}) =>
  request(app).post("/api/v1/auth/forgot-password").set(headers).send({ email: "someone@example.com" });

beforeEach(async () => {
  env.NODE_ENV = "test";
  mockDbSelect.mockReset();
  noUsers();
  await resetAuthRateLimits();
});

describe("auth rate limits", () => {
  it("sets the budgets: 10 failed sign-ins per account and 100 per address in 15 minutes, 10 sign-ups and 5 reset requests per hour", () => {
    expect(AUTH_RATE_LIMITS).toEqual({
      login: { limit: 10, windowMs: 15 * 60 * 1000 },
      loginPerAddress: { limit: 100, windowMs: 15 * 60 * 1000 },
      register: { limit: 10, windowMs: 60 * 60 * 1000 },
      forgotPassword: { limit: 5, windowMs: 60 * 60 * 1000 },
      changePassword: { limit: 10, windowMs: 15 * 60 * 1000 },
      deleteAccount: { limit: 10, windowMs: 15 * 60 * 1000 },
    });
  });

  it("answers the 11th failed sign-in for one email from one address with 429", async () => {
    for (let i = 0; i < 10; i++) expect((await login()).status).toBe(401);
    const limited = await login();
    expect(limited.status).toBe(429);
    expect(limited.body).toEqual({
      message: "Too many sign-in attempts. Try again in 15 minutes.",
      code: "login_rate_limited",
    });
    expect(limited.headers["retry-after"]).toBeDefined();
  });

  it("does not lock another account behind the same address", async () => {
    for (let i = 0; i < 10; i++) await login(undefined, "victim@example.com");
    expect((await login(undefined, "victim@example.com")).status).toBe(429);
    expect((await login(undefined, "neighbour@example.com")).status).toBe(401);
  });

  it("counts an email in any letter case and with spaces as the same account", async () => {
    for (let i = 0; i < 10; i++) await login(undefined, i % 2 ? "Victim@Example.com" : " victim@example.com ");
    expect((await login(undefined, "VICTIM@EXAMPLE.COM")).status).toBe(429);
  });

  it("answers an address 429 after 100 failed sign-ins across many accounts", async () => {
    for (let i = 0; i < 100; i++) expect((await login(undefined, `guess${i}@example.com`)).status).toBe(401);
    const limited = await login(undefined, "fresh@example.com");
    expect(limited.status).toBe(429);
    expect(limited.body).toEqual({
      message: "Too many sign-in attempts from this network. Try again in 15 minutes.",
      code: "login_network_rate_limited",
    });
  }, 60_000);

  it("keys an email by a fixed-size hash, so a 90 kB email takes no more room than a short one", () => {
    const keyFor = (email: string) => loginKeyOf({ ip: "203.0.113.7", body: { email }, get: () => undefined } as never);
    expect(keyFor("x".repeat(90 * 1024)).length).toBe(keyFor("a@example.com").length);
    expect(keyFor("A@Example.com ")).toBe(keyFor("a@example.com"));
  });

  it("gives two over-long emails that share their first 254 characters one budget", async () => {
    const prefix = `${"x".repeat(240)}@example.com`.padEnd(254, "y");
    // Each is a failed sign-in, refused by the schema or by the lookup.
    for (let i = 0; i < 10; i++) expect([400, 401]).toContain((await login(undefined, `${prefix}first`)).status);
    expect((await login(undefined, `${prefix}second`)).status).toBe(429);
  });

  it("answers the 11th sign-up from one address with 429", async () => {
    for (let i = 0; i < 10; i++) expect((await register()).status).toBe(400);
    const limited = await register();
    expect(limited.status).toBe(429);
    expect(limited.body).toEqual({
      message: "Too many sign-ups from this network. Try again later.",
      code: "signup_rate_limited",
    });
  });

  it("answers the 6th reset request from one address with 429", async () => {
    for (let i = 0; i < 5; i++) expect((await forgot()).status).toBe(200);
    const limited = await forgot();
    expect(limited.status).toBe(429);
    expect(limited.body).toEqual({
      message: "Too many password reset requests. Try again later.",
      code: "reset_rate_limited",
    });
  });

  it("keeps a budget per endpoint", async () => {
    for (let i = 0; i < 10; i++) await login();
    expect((await login()).status).toBe(429);
    expect((await forgot()).status).toBe(200);
    expect((await register()).status).toBe(400);
  });

  it("keys a relayed sign-in on the browser's address, so one browser cannot use up another's budget", async () => {
    for (let i = 0; i < 10; i++) await login("203.0.113.1");
    expect((await login("203.0.113.1")).status).toBe(429);
    expect((await login("203.0.113.2")).status).toBe(401);
  });

  it("ignores X-Client-Ip without the relay secret, so a caller cannot pick a fresh budget per request", async () => {
    for (let i = 0; i < 5; i++) expect((await forgot({ "X-Client-Ip": `198.51.100.${i}` })).status).toBe(200);
    expect((await forgot({ "X-Client-Ip": "198.51.100.99" })).status).toBe(429);
  });

  it("keys on Fly-Client-IP in production for a call that is not relayed", async () => {
    env.NODE_ENV = "production";
    for (let i = 0; i < 5; i++) await forgot({ "Fly-Client-IP": "203.0.113.1" });
    expect((await forgot({ "Fly-Client-IP": "203.0.113.1" })).status).toBe(429);
    expect((await forgot({ "Fly-Client-IP": "203.0.113.2" })).status).toBe(200);
  });

  it("ignores Fly-Client-IP outside production, where a caller could set it", async () => {
    for (let i = 0; i < 5; i++) await forgot({ "Fly-Client-IP": `203.0.113.${i}` });
    expect((await forgot({ "Fly-Client-IP": "203.0.113.99" })).status).toBe(429);
  });
});
