import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { createHash, randomBytes } from "node:crypto";
import {
  issueOneTimeCode,
  MAX_ONE_TIME_CODES,
  MAX_ONE_TIME_CODES_PER_USER,
  nonceMatchesBind,
  ONE_TIME_CODE_TTL_MS,
  redeemOneTimeCode,
  storedOneTimeCodes,
} from "../oneTimeCodes.js";

const USER = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
const NONCE = randomBytes(32).toString("base64url");
const BIND = createHash("sha256").update(NONCE).digest("hex");
const GRANT = { userId: USER, bind: BIND };

afterEach(() => {
  jest.restoreAllMocks();
});

/** Moves the clock past every code an earlier test left, so the next issue clears them. */
function expireEarlierCodes() {
  jest.spyOn(Date, "now").mockReturnValue(Date.now() + 10 * ONE_TIME_CODE_TTL_MS);
}

const issue = (userId = USER) => issueOneTimeCode("google-sign-in", { userId, bind: BIND });
const redeem = (code: string) => redeemOneTimeCode(code, "google-sign-in")?.userId ?? null;

describe("one-time codes", () => {
  it("lives about a minute", () => {
    expect(ONE_TIME_CODE_TTL_MS).toBe(60_000);
  });

  it("redeems to the user it was issued for", () => {
    const code = issue();
    expect(redeem(code)).toBe(USER);
  });

  it("is opaque and unique", () => {
    const a = issue();
    const b = issue();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a).not.toContain(USER);
  });

  it("redeems once", () => {
    const code = issue();
    expect(redeem(code)).toBe(USER);
    expect(redeem(code)).toBeNull();
  });

  it("expires after its minute", () => {
    const now = Date.now();
    const clock = jest.spyOn(Date, "now").mockReturnValue(now);
    const code = issue();
    clock.mockReturnValue(now + ONE_TIME_CODE_TTL_MS + 1);
    expect(redeem(code)).toBeNull();
  });

  it("still redeems just inside its minute", () => {
    const now = Date.now();
    const clock = jest.spyOn(Date, "now").mockReturnValue(now);
    const code = issue();
    clock.mockReturnValue(now + ONE_TIME_CODE_TTL_MS);
    expect(redeem(code)).toBe(USER);
  });

  it("is refused for another purpose, and is spent by the attempt", () => {
    const code = issue();
    expect(redeemOneTimeCode(code, "google-link")).toBeNull();
    expect(redeem(code)).toBeNull();
  });

  it("carries a link's Google id and bind", () => {
    const code = issueOneTimeCode("google-link", { ...GRANT, googleId: "google-123" });
    expect(redeemOneTimeCode(code, "google-link")).toEqual({ ...GRANT, googleId: "google-123" });
  });

  it("carries a sign-in's bind and no Google id", () => {
    expect(redeemOneTimeCode(issue(), "google-sign-in")).toEqual(GRANT);
  });

  it.each([
    ["an unknown code", "nope"],
    ["an empty code", ""],
  ])("refuses %s", (_label, code) => {
    expect(redeem(code)).toBeNull();
  });

  it("drops expired codes when it issues a new one", () => {
    const now = Date.now();
    const clock = jest.spyOn(Date, "now").mockReturnValue(now);
    issue();
    issue();
    expect(storedOneTimeCodes()).toBeGreaterThanOrEqual(2);
    clock.mockReturnValue(now + ONE_TIME_CODE_TTL_MS + 1);
    issue();
    expect(storedOneTimeCodes()).toBe(1);
  });

  it("holds at most its cap, dropping the oldest", () => {
    const first = issue();
    for (let i = 0; i < MAX_ONE_TIME_CODES; i++) issue(`user-${i}`);
    expect(storedOneTimeCodes()).toBe(MAX_ONE_TIME_CODES);
    expect(redeem(first)).toBeNull();
    const last = issue();
    expect(redeem(last)).toBe(USER);
  });

  it("holds at most twenty live codes per user, so one account cannot push out another's", () => {
    expect(MAX_ONE_TIME_CODES_PER_USER).toBe(20);
    expireEarlierCodes();
    const other = issue("other-user");
    expect(storedOneTimeCodes()).toBe(1);
    const before = 1;
    const minted = Array.from({ length: MAX_ONE_TIME_CODES_PER_USER + 1 }, () => issue());
    // The 21st evicted this user's oldest, and nobody else's.
    expect(storedOneTimeCodes() - before).toBe(MAX_ONE_TIME_CODES_PER_USER);
    expect(redeem(minted[0])).toBeNull();
    expect(redeem(minted[1])).toBe(USER);
    expect(redeem(minted[MAX_ONE_TIME_CODES_PER_USER])).toBe(USER);
    expect(redeem(other)).toBe("other-user");
  });

  it("frees a user's place when a code is redeemed", () => {
    expireEarlierCodes();
    const minted = Array.from({ length: MAX_ONE_TIME_CODES_PER_USER }, () => issue());
    expect(redeem(minted[5])).toBe(USER);
    issue();
    // Twenty live again, so nothing was evicted: the oldest still redeems.
    expect(redeem(minted[0])).toBe(USER);
  });
});

describe("nonceMatchesBind", () => {
  it("matches the nonce whose hash is the bind", () => {
    expect(nonceMatchesBind(NONCE, BIND)).toBe(true);
  });

  it("refuses another browser's nonce", () => {
    expect(nonceMatchesBind(randomBytes(32).toString("base64url"), BIND)).toBe(false);
  });

  it("refuses a malformed bind without throwing", () => {
    expect(nonceMatchesBind(NONCE, "zz")).toBe(false);
    expect(nonceMatchesBind(NONCE, "")).toBe(false);
  });
});
