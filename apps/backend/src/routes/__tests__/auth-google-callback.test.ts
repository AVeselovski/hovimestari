import { describe, expect, it, jest } from "@jest/globals";
import type { NextFunction, Request, Response } from "express";
import request from "supertest";

// ---------------------------------------------------------------------------
// Mock passport so we can control what req.user looks like after the OAuth
// exchange, without needing a real Google authorization code.
// ---------------------------------------------------------------------------

type AuthenticateMiddleware = (req: Request, res: Response, next: NextFunction) => void;

const makePassportAuthenticateMock =
  (user: { id: string; error?: string }): AuthenticateMiddleware =>
  (_req: Request & { user?: unknown }, _res: Response, next: NextFunction) => {
    (_req as Request & { user?: unknown }).user = user;
    next();
  };

let passportAuthenticateMock = makePassportAuthenticateMock({ id: "user-id-123" });

const mockGenerateStubsForUser = jest.fn<(userId: string, db: unknown) => Promise<void>>().mockResolvedValue(undefined);

jest.unstable_mockModule("../../lib/recurringStubs.js", () => ({
  generateStubsForUser: mockGenerateStubsForUser,
  generateStubsForTemplate: jest.fn<() => Promise<number>>().mockResolvedValue(0),
  generationTarget: jest.fn(() => new Date()),
}));

jest.unstable_mockModule("passport", () => ({
  default: {
    use: jest.fn(),
    initialize: jest.fn(() => (_req: Request, _res: Response, next: NextFunction) => next()),
    authenticate: jest.fn((_strategy: string, _options: unknown) => {
      return (req: Request, res: Response, next: NextFunction) => passportAuthenticateMock(req, res, next);
    }),
  },
}));

const mockDbSelect = jest.fn();
const mockDbInsert = jest.fn();
const mockDbUpdate = jest.fn();
const mockDbDelete = jest.fn();
const mockDbTransaction = jest.fn(async (cb: (tx: unknown) => Promise<void>) => {
  await cb({ select: mockDbSelect, insert: mockDbInsert, update: mockDbUpdate, delete: mockDbDelete });
});

jest.unstable_mockModule("../../db/index.js", () => ({
  db: {
    select: mockDbSelect,
    insert: mockDbInsert,
    update: mockDbUpdate,
    delete: mockDbDelete,
    transaction: mockDbTransaction,
  },
}));

jest.unstable_mockModule("../../lib/email.js", () => ({
  sendPasswordResetEmail: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  sendVaultInvitationEmail: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
}));

jest.unstable_mockModule("bcrypt", () => ({
  default: { hash: jest.fn(), compare: jest.fn() },
  hash: jest.fn(),
  compare: jest.fn(),
}));

const { app } = await import("../../app.js");
const { signOAuthState } = await import("../../lib/jwt.js");

/** The callback, from the browser that started the sign-in. */
function signInCallback() {
  const { state, nonce } = signOAuthState("google-sign-in", {});
  return request(app)
    .get(`/api/v1/auth/google/callback?code=fake&state=${encodeURIComponent(state)}`)
    .set("Cookie", `google_sign_in_oauth=${nonce}`);
}

// ---------------------------------------------------------------------------
// GET /api/v1/auth/google/callback
// ---------------------------------------------------------------------------

describe("GET /api/v1/auth/google/callback", () => {
  it("redirects to sign-in with error=google_email_taken when an email-only account tries Google login", async () => {
    passportAuthenticateMock = makePassportAuthenticateMock({ id: "", error: "email_taken" });

    const res = await signInCallback();

    expect(res.status).toBe(302);
    expect(res.headers.location).toContain("/auth/sign-in?error=google_email_taken");
  });

  it("calls generateStubsForUser with the authenticated userId after issuing tokens", async () => {
    const USER_ID = "user-id-abc";
    passportAuthenticateMock = makePassportAuthenticateMock({ id: USER_ID });
    mockGenerateStubsForUser.mockReset();
    mockGenerateStubsForUser.mockResolvedValue(undefined);

    // issueTokens runs tx.delete().where() (expired cleanup) then tx.insert().values()
    const deleteWhere = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
    mockDbDelete.mockReturnValueOnce({ where: deleteWhere });
    const insertValues = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
    mockDbInsert.mockReturnValueOnce({ values: insertValues });

    const res = await signInCallback();

    expect(res.status).toBe(302);
    expect(res.headers.location).toContain("/auth/callback?accessToken=");
    expect(mockGenerateStubsForUser).toHaveBeenCalledTimes(1);
    expect(mockGenerateStubsForUser.mock.calls[0][0]).toBe(USER_ID);
  });
});
