import { jest } from "@jest/globals";
import jwt from "jsonwebtoken";
import { accessTokenWithoutFamily } from "../../__tests__/support/sessionApi.js";
import { env } from "../env.js";
import {
  hashToken,
  OAUTH_STATE_TTL_MS,
  signAccessToken,
  signOAuthState,
  signRefreshToken,
  verifyAccessToken,
  verifyOAuthState,
  verifyRefreshToken,
} from "../jwt.js";

const TEST_USER_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
const TEST_FAMILY_ID = "f1e2d3c4-b5a6-4789-8abc-def012345678";

describe("signAccessToken / verifyAccessToken", () => {
  it("produces a token that verifies with the correct payload", () => {
    const token = signAccessToken({ sub: TEST_USER_ID, fam: TEST_FAMILY_ID });
    const payload = verifyAccessToken(token);
    expect(payload.sub).toBe(TEST_USER_ID);
  });

  it("carries the session's family, and answers none for a token that names none", () => {
    expect(verifyAccessToken(signAccessToken({ sub: TEST_USER_ID, fam: TEST_FAMILY_ID }))).toEqual({
      sub: TEST_USER_ID,
      fam: TEST_FAMILY_ID,
    });
    expect(verifyAccessToken(accessTokenWithoutFamily(TEST_USER_ID))).toEqual({ sub: TEST_USER_ID });
  });

  it("throws on a tampered token", () => {
    const token = signAccessToken({ sub: TEST_USER_ID, fam: TEST_FAMILY_ID });
    expect(() => verifyAccessToken(token + "x")).toThrow();
  });

  it("throws on a completely invalid string", () => {
    expect(() => verifyAccessToken("not.a.jwt")).toThrow();
  });

  it("throws on an expired token", () => {
    const expired = jwt.sign({ sub: TEST_USER_ID, exp: Math.floor(Date.now() / 1000) - 60 }, env.JWT_ACCESS_SECRET);
    expect(() => verifyAccessToken(expired)).toThrow();
  });
});

describe("signRefreshToken / verifyRefreshToken", () => {
  it("produces a token that verifies with the correct payload", () => {
    const token = signRefreshToken({ sub: TEST_USER_ID, fam: TEST_FAMILY_ID });
    const payload = verifyRefreshToken(token);
    expect(payload.sub).toBe(TEST_USER_ID);
  });

  it("throws on a tampered token", () => {
    const token = signRefreshToken({ sub: TEST_USER_ID, fam: TEST_FAMILY_ID });
    expect(() => verifyRefreshToken(token + "x")).toThrow();
  });

  it("issues a distinct token each time, even twice in the same second", () => {
    // The refresh token is stored by its hash under a unique index, so two
    // sign-ins in one second must not produce the same token.
    jest.spyOn(globalThis.Date, "now").mockReturnValue(1_790_000_000_000);
    const first = signRefreshToken({ sub: TEST_USER_ID, fam: TEST_FAMILY_ID });
    const second = signRefreshToken({ sub: TEST_USER_ID, fam: TEST_FAMILY_ID });
    jest.spyOn(globalThis.Date, "now").mockRestore();
    expect(first).not.toBe(second);
    expect(hashToken(first)).not.toBe(hashToken(second));
  });

  it("throws on an expired token", () => {
    const expired = jwt.sign({ sub: TEST_USER_ID, exp: Math.floor(Date.now() / 1000) - 60 }, env.JWT_REFRESH_SECRET);
    expect(() => verifyRefreshToken(expired)).toThrow();
  });

  // Test 16 of docs/design/session-renewal.md.
  it("carries the token's family in `fam` (fails today)", () => {
    const token = signRefreshToken({ sub: TEST_USER_ID, fam: TEST_FAMILY_ID });
    expect(verifyRefreshToken(token)).toEqual({ sub: TEST_USER_ID, fam: TEST_FAMILY_ID });
  });

  it("verifies a token signed before families existed, with no family (guard)", () => {
    const legacy = jwt.sign({ sub: TEST_USER_ID }, env.JWT_REFRESH_SECRET, { expiresIn: "7d" });
    const payload = verifyRefreshToken(legacy);
    expect(payload.sub).toBe(TEST_USER_ID);
    expect(payload.fam).toBeUndefined();
  });
});

describe("the signing algorithm", () => {
  const unsigned = (payload: object) =>
    `${Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url")}.${Buffer.from(
      JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + 60 }),
    ).toString("base64url")}.`;

  it.each([
    ["an access token", env.JWT_ACCESS_SECRET, verifyAccessToken],
    ["a refresh token", env.JWT_REFRESH_SECRET, verifyRefreshToken],
  ] as const)("refuses %s signed with the right secret but another HMAC algorithm", (_label, secret, verify) => {
    const other = jwt.sign({ sub: TEST_USER_ID, fam: TEST_FAMILY_ID }, secret, { algorithm: "HS384", expiresIn: 60 });
    expect(() => verify(other)).toThrow();
  });

  it.each([
    ["an access token", verifyAccessToken],
    ["a refresh token", verifyRefreshToken],
  ] as const)("refuses %s that is unsigned (guard)", (_label, verify) => {
    expect(() => verify(unsigned({ sub: TEST_USER_ID, fam: TEST_FAMILY_ID }))).toThrow();
  });
});

describe("hashToken", () => {
  it("returns a 64-character lowercase hex string (SHA-256)", () => {
    const hash = hashToken("some-token");
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]+$/);
  });

  it("is deterministic for the same input", () => {
    expect(hashToken("my-token")).toBe(hashToken("my-token"));
  });

  it("produces different hashes for different inputs", () => {
    expect(hashToken("token-a")).not.toBe(hashToken("token-b"));
  });
});

describe("signOAuthState / verifyOAuthState", () => {
  const decode = (state: string) => JSON.parse(Buffer.from(state, "base64url").toString("utf8"));
  const encode = (payload: unknown) => Buffer.from(JSON.stringify(payload)).toString("base64url");

  it("returns the fields and the nonce it was signed with", () => {
    const { state, nonce } = signOAuthState("google-link", { userId: TEST_USER_ID });
    expect(nonce).toMatch(/^[0-9a-f]{32}$/);
    expect(verifyOAuthState("google-link", state)).toEqual({ fields: { userId: TEST_USER_ID }, nonce });
  });

  it("holds for ten minutes and no longer", () => {
    expect(OAUTH_STATE_TTL_MS).toBe(10 * 60 * 1000);
    const start = 1_800_000_000_000;
    const now = jest.spyOn(Date, "now").mockReturnValue(start);
    const { state } = signOAuthState("google-link", { userId: TEST_USER_ID });
    now.mockReturnValue(start + OAUTH_STATE_TTL_MS);
    expect(verifyOAuthState("google-link", state)).not.toBeNull();
    now.mockReturnValue(start + OAUTH_STATE_TTL_MS + 1);
    expect(verifyOAuthState("google-link", state)).toBeNull();
    now.mockRestore();
  });

  it("never passes for another purpose, even with the same fields", () => {
    const fields = { userId: TEST_USER_ID, bind: "a".repeat(64) };
    expect(verifyOAuthState("google-sign-in", signOAuthState("google-link", fields).state)).toBeNull();
    expect(verifyOAuthState("google-link", signOAuthState("google-sign-in", fields).state)).toBeNull();
  });

  it("refuses a changed, added or removed field", () => {
    const payload = decode(signOAuthState("google-link", { userId: TEST_USER_ID, bind: "v1" }).state);
    expect(
      verifyOAuthState("google-link", encode({ ...payload, fields: { ...payload.fields, bind: "v2" } })),
    ).toBeNull();
    expect(
      verifyOAuthState("google-link", encode({ ...payload, fields: { ...payload.fields, extra: "x" } })),
    ).toBeNull();
    expect(verifyOAuthState("google-link", encode({ ...payload, fields: { userId: TEST_USER_ID } }))).toBeNull();
  });

  it("does not let a field's text pose as a field boundary", () => {
    // Fields are signed as JSON, so "a:b" in one field is not "a" and "b" in two.
    const joined = decode(signOAuthState("google-link", { userId: `${TEST_USER_ID}:v1` }).state);
    const split = encode({ ...joined, fields: { userId: TEST_USER_ID, bind: "v1" } });
    expect(verifyOAuthState("google-link", split)).toBeNull();
  });

  it("refuses an expiry pushed out", () => {
    const payload = decode(signOAuthState("google-link", { userId: TEST_USER_ID }).state);
    expect(verifyOAuthState("google-link", encode({ ...payload, expiresAt: payload.expiresAt + 60_000 }))).toBeNull();
  });

  it("refuses garbage", () => {
    expect(verifyOAuthState("google-link", "not-valid-base64url!!!")).toBeNull();
    expect(verifyOAuthState("google-link", encode({ fields: { userId: TEST_USER_ID } }))).toBeNull();
    expect(
      verifyOAuthState("google-link", encode({ fields: { userId: 1 }, nonce: "n", expiresAt: 1, sig: "00" })),
    ).toBeNull();
  });
});
