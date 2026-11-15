import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { randomBytes } from "node:crypto";
import request from "supertest";
import { testPassword } from "../../__tests__/support/credentials.js";
import { relayHeaders } from "../../__tests__/support/relay.js";

// The auth routes against a mocked database: who may call each route, the
// client address rules, the codes a refused body answers with, and the
// answers that must not tell one account from another. The flows themselves
// (sessions, rotation, reset, linking, deletion) run on a real database in
// authFlow.db.test.ts.

// A rotation in progress: the backend accepts the previous relay secret too.
const PREVIOUS_SECRET = randomBytes(32).toString("hex");
process.env.BFF_SECRET_PREVIOUS = PREVIOUS_SECRET;

const mockDbSelect = jest.fn();
const mockDbInsert = jest.fn();
const mockDbTransaction = jest.fn<(cb: (tx: unknown) => Promise<void>) => Promise<void>>();
const unreachable = () => {
  throw new Error("unexpected database call");
};

jest.unstable_mockModule("../../db/index.js", () => ({
  db: {
    select: mockDbSelect,
    insert: mockDbInsert,
    update: unreachable,
    delete: unreachable,
    transaction: mockDbTransaction,
  },
}));

// No sign-in here ever succeeds, so bcrypt is a spy: it shows which refusals paid for a compare.
const mockCompare = jest.fn(async () => false);
jest.unstable_mockModule("bcrypt", () => ({
  default: { hash: async () => "dummy-hash-value", compare: mockCompare },
}));

const mockSendResetEmail = jest.fn<(to: string, link: string) => Promise<void>>();
jest.unstable_mockModule("../../lib/email.js", () => ({ sendPasswordResetEmail: mockSendResetEmail }));

const { app } = await import("../../app.js");
const { env } = await import("../../lib/env.js");
const { resetAuthRateLimits } = await import("../../middleware/authRateLimits.js");
const { signAccessToken } = await import("../../lib/jwt.js");

/** Every select().from().where().limit() resolves to `rows`. */
function selectReturns(rows: unknown[]) {
  mockDbSelect.mockImplementation(() => {
    const chain: Record<string, unknown> = {};
    chain.from = () => chain;
    chain.where = () => chain;
    chain.limit = async () => rows;
    return chain;
  });
}

/** The reset link's transaction: a sweep of expired rows, then the insert. */
function resetLinkStored() {
  mockDbTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<void>) =>
    cb({
      delete: () => ({ where: async () => undefined }),
      insert: () => ({ values: async () => undefined }),
    }),
  );
}

/** Resolves once `check` holds, for work the route does after it has answered. */
async function eventually(check: () => boolean): Promise<void> {
  for (let i = 0; i < 100 && !check(); i++) await new Promise((resolve) => setTimeout(resolve, 5));
  expect(check()).toBe(true);
}

const USER = {
  id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  email: "user@example.com",
  passwordHash: "stored-hash",
  googleId: null as string | null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

beforeEach(async () => {
  env.NODE_ENV = "test";
  await resetAuthRateLimits();
  mockDbSelect.mockReset();
  mockDbInsert.mockReset();
  mockDbTransaction.mockReset();
  mockCompare.mockClear();
  mockSendResetEmail.mockReset();
  mockSendResetEmail.mockResolvedValue(undefined);
  selectReturns([]);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("the relay secret", () => {
  const TOKEN_ROUTES = ["/register", "/login", "/refresh", "/logout", "/google/exchange", "/link/google/exchange"];

  it.each(TOKEN_ROUTES)("POST %s answers 401 without the relay secret, before touching the database", async (path) => {
    const res = await request(app).post(`/api/v1/auth${path}`).send({});
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("request_refused");
    expect(mockDbSelect).not.toHaveBeenCalled();
  });

  it("answers 401 to a wrong secret of a different length, without throwing", async () => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .set({ ...relayHeaders(), "X-Bff-Secret": "short" })
      .send({ email: USER.email, password: testPassword() });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("request_refused");
  });

  it("answers 401 to a wrong secret of the same length", async () => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .set({ ...relayHeaders(), "X-Bff-Secret": randomBytes(32).toString("hex") })
      .send({ email: USER.email, password: testPassword() });
    expect(res.status).toBe(401);
  });

  it("accepts the previous secret during a rotation", async () => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .set({ ...relayHeaders(), "X-Bff-Secret": PREVIOUS_SECRET })
      .send({ email: USER.email, password: testPassword() });
    // Past the relay check: the unknown account is refused as a sign-in.
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("invalid_credentials");
  });
});

describe("the relayed client address", () => {
  const signIn = (headers: Record<string, string>) =>
    request(app).post("/api/v1/auth/login").set(headers).send({ email: USER.email, password: testPassword() });

  it("answers 400 client_address_missing in production when the relay names no address", async () => {
    env.NODE_ENV = "production";
    const res = await signIn({ "X-Bff-Secret": process.env.BFF_SECRET! });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("client_address_missing");
    expect(mockDbSelect).not.toHaveBeenCalled();
  });

  it("keys on the socket address outside production when the relay names none", async () => {
    const res = await signIn({ "X-Bff-Secret": process.env.BFF_SECRET! });
    expect(res.body.code).toBe("invalid_credentials");
  });

  it.each(["test", "production"] as const)(
    "answers 400 client_address_invalid in %s to an address that is not one",
    async (mode) => {
      env.NODE_ENV = mode;
      const res = await signIn(relayHeaders("not-an-ip"));
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("client_address_invalid");
    },
  );

  it("accepts an IPv6 address", async () => {
    const res = await signIn(relayHeaders("2001:db8::1"));
    expect(res.body.code).toBe("invalid_credentials");
  });
});

describe("POST /api/v1/auth/register", () => {
  const register = (body: object) => request(app).post("/api/v1/auth/register").set(relayHeaders()).send(body);

  it.each([
    ["invalid_email", { email: "not-an-email", password: testPassword() }],
    ["password_too_short", { email: "new@example.com", password: "x".repeat(7) }],
    ["password_too_long", { email: "new@example.com", password: "x".repeat(73) }],
    ["invalid_request", { email: "new@example.com" }],
  ])("answers 400 %s", async (code, body) => {
    const res = await register(body);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: expect.any(String), code });
  });

  it("answers 409 email_taken for an address with a password account", async () => {
    selectReturns([{ googleId: null, passwordHash: "stored-hash" }]);
    const res = await register({ email: "USER@example.com", password: testPassword() });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("email_taken");
  });

  it("answers 409 email_taken_google for a Google-only account", async () => {
    selectReturns([{ googleId: "google-123", passwordHash: null }]);
    const res = await register({ email: USER.email, password: testPassword() });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("email_taken_google");
  });
});

describe("POST /api/v1/auth/login", () => {
  const login = (body: object) => request(app).post("/api/v1/auth/login").set(relayHeaders()).send(body);

  it("answers 400 password_too_long to a 73-byte password, without reading the account", async () => {
    const res = await login({ email: USER.email, password: "x".repeat(73) });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("password_too_long");
    expect(mockDbSelect).not.toHaveBeenCalled();
  });

  it("answers 401 invalid_credentials for an unknown email", async () => {
    const res = await login({ email: "nobody@example.com", password: testPassword() });
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ message: "Invalid email or password.", code: "invalid_credentials" });
  });

  it("answers the same for a Google-only account", async () => {
    selectReturns([{ ...USER, passwordHash: null, googleId: "google-123" }]);
    const res = await login({ email: USER.email, password: testPassword() });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("invalid_credentials");
  });

  it.each([
    ["an unknown email", []],
    ["an account with no password", [{ ...USER, passwordHash: null, googleId: "google-123" }]],
    ["a wrong password", [USER]],
  ])("pays one bcrypt compare for %s, so the timing tells nothing", async (_label, rows) => {
    selectReturns(rows);
    const res = await login({ email: USER.email, password: testPassword() });
    expect(res.status).toBe(401);
    expect(mockCompare).toHaveBeenCalledTimes(1);
  });
});

describe("POST /api/v1/auth/refresh", () => {
  it("answers 401 session_expired to a token that does not verify", async () => {
    const res = await request(app).post("/api/v1/auth/refresh").set(relayHeaders()).send({ refreshToken: "not.a.jwt" });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("session_expired");
  });
});

describe("routes behind a bearer", () => {
  it.each<["get" | "post" | "put" | "delete", string]>([
    ["post", "/api/v1/auth/logout-all"],
    ["post", "/api/v1/auth/link/password"],
    ["post", "/api/v1/auth/link/google/start"],
    ["delete", "/api/v1/auth/unlink/google"],
    ["get", "/api/v1/users/me"],
    ["put", "/api/v1/users/me/password"],
    ["delete", "/api/v1/users/me"],
  ])("%s %s answers 401 without one", async (method, path) => {
    const res = await request(app)[method](path).send({});
    expect(res.status).toBe(401);
  });

  it("DELETE /auth/unlink/:method answers 400 invalid_method for another method", async () => {
    const res = await request(app)
      .delete("/api/v1/auth/unlink/facebook")
      .set("Authorization", `Bearer ${signAccessToken({ sub: USER.id })}`);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("invalid_method");
  });
});

describe("Google, switched off", () => {
  it("GET /auth/providers says google: false", async () => {
    const res = await request(app).get("/api/v1/auth/providers");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ google: false });
  });

  it.each(["/api/v1/auth/google", "/api/v1/auth/google/callback", "/api/v1/auth/link/google/callback"])(
    "GET %s answers 404 google_unavailable",
    async (path) => {
      const res = await request(app).get(path);
      expect(res.status).toBe(404);
      expect(res.body.code).toBe("google_unavailable");
    },
  );

  it("POST /auth/link/google/start answers 404 google_unavailable", async () => {
    const res = await request(app)
      .post("/api/v1/auth/link/google/start")
      .set("Authorization", `Bearer ${signAccessToken({ sub: USER.id })}`)
      .set(relayHeaders())
      .send({ bind: "a".repeat(64) });
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("google_unavailable");
  });
});

describe("POST /api/v1/auth/forgot-password", () => {
  const forgot = (email: string) => request(app).post("/api/v1/auth/forgot-password").send({ email });

  it("answers an unknown email exactly as a known one", async () => {
    selectReturns([USER]);
    resetLinkStored();
    const known = await forgot(USER.email);
    selectReturns([]);
    const unknown = await forgot("nobody@example.com");

    expect(unknown.status).toBe(known.status);
    expect(unknown.body).toEqual(known.body);
    expect(Object.keys(unknown.headers).sort()).toEqual(Object.keys(known.headers).sort());
    await eventually(() => mockSendResetEmail.mock.calls.length === 1);
  });

  it("answers before the mail is sent, so a slow mail service cannot tell which addresses have an account", async () => {
    selectReturns([USER]);
    resetLinkStored();
    mockSendResetEmail.mockImplementation(() => new Promise<void>(() => {}));

    const res = await forgot(USER.email);

    expect(res.status).toBe(200);
    expect(mockSendResetEmail).toHaveBeenCalledTimes(1);
  });

  it("mails a one-hour link to the account's address", async () => {
    selectReturns([USER]);
    resetLinkStored();

    await forgot(USER.email);

    await eventually(() => mockSendResetEmail.mock.calls.length === 1);
    const [to, link] = mockSendResetEmail.mock.calls[0];
    expect(to).toBe(USER.email);
    expect(link).toMatch(new RegExp(`^${env.FRONTEND_URL}/auth/reset-password\\?token=[0-9a-f]{64}$`));
  });

  it("answers as usual when the mail cannot be sent, and logs the failure", async () => {
    const logged = jest.spyOn(console, "error").mockImplementation(() => undefined);
    selectReturns([USER]);
    resetLinkStored();
    mockSendResetEmail.mockRejectedValue(new Error("mail service down"));

    const res = await forgot(USER.email);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: "If an account exists, a reset email has been sent." });
    await eventually(() => logged.mock.calls.length > 0);
    expect(String(logged.mock.calls[0][0])).toContain("password reset mail failed");
  });

  it("answers 400 invalid_email to an address that is not one", async () => {
    const res = await forgot("bad");
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("invalid_email");
  });
});
