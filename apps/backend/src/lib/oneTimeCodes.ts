import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

// ---------------------------------------------------------------------------
// One-time codes. A Google callback finishes in the backend, but the session
// or the link belongs to the browser that started the flow. So the callback
// hands the web server a code in the redirect, never a token, and the web
// server trades it in a server-to-server call together with the nonce that
// only the starting browser holds. A code is opaque, lives a minute, is spent
// by its first redemption, and is bound to the flow, the user and the hash of
// the starting browser's nonce (`bind`). A link code also carries the Google
// id the consent returned.
//
// The store is in this process's memory. With more than one machine serving
// the API, a code minted on one cannot be redeemed on another, so it would
// need a shared store.
// ---------------------------------------------------------------------------

/** The flows a code finishes. */
export type OneTimeCodePurpose = "google-sign-in" | "google-link";

/** What a code was issued for. */
export interface CodeGrant {
  userId: string;
  /** The SHA-256 of the starting browser's nonce, in hex. */
  bind: string;
  /** The Google account a link code links. */
  googleId?: string;
}

/** How long a code lives. The browser follows the redirect at once, so a minute is plenty. */
export const ONE_TIME_CODE_TTL_MS = 60_000;

interface Entry extends CodeGrant {
  purpose: OneTimeCodePurpose;
  expiresAt: number;
}

/** The most codes held at once. Past it the oldest goes, so a flood of requests cannot grow the store without end. */
export const MAX_ONE_TIME_CODES = 10_000;

/** The most live codes one user holds. Past it that user's oldest goes, so one account cannot push out everyone else's. */
export const MAX_ONE_TIME_CODES_PER_USER = 20;

/**
 * Keyed by the code's hash, so the store never holds a code that would
 * redeem. Every code lives as long, so insertion order is expiry order.
 */
const codes = new Map<string, Entry>();

/** Each user's code keys, oldest first. */
const keysByUser = new Map<string, string[]>();

function forget(key: string): void {
  const entry = codes.get(key);
  if (!entry) return;
  codes.delete(key);
  const keys = keysByUser.get(entry.userId) ?? [];
  keys.splice(keys.indexOf(key), 1);
  if (keys.length === 0) keysByUser.delete(entry.userId);
}

const sha256Hex = (value: string) => createHash("sha256").update(value).digest("hex");

/** A new code that finishes `purpose` for `grant`. */
export function issueOneTimeCode(purpose: OneTimeCodePurpose, grant: CodeGrant): string {
  const now = Date.now();
  // The oldest first: stop at the first one still alive.
  for (const [key, entry] of codes) {
    if (entry.expiresAt >= now && codes.size < MAX_ONE_TIME_CODES) break;
    forget(key);
  }
  const own = keysByUser.get(grant.userId) ?? [];
  while (own.length >= MAX_ONE_TIME_CODES_PER_USER) forget(own[0]);
  const code = randomBytes(32).toString("base64url");
  const key = sha256Hex(code);
  codes.set(key, { ...grant, purpose, expiresAt: now + ONE_TIME_CODE_TTL_MS });
  keysByUser.set(grant.userId, [...(keysByUser.get(grant.userId) ?? []), key]);
  return code;
}

/**
 * What a code was issued for, or null when it is unknown, spent, expired or
 * another flow's. Any attempt spends it.
 */
export function redeemOneTimeCode(code: string, purpose: OneTimeCodePurpose): CodeGrant | null {
  const key = sha256Hex(code);
  const entry = codes.get(key);
  if (!entry) return null;
  forget(key);
  if (Date.now() > entry.expiresAt) return null;
  if (entry.purpose !== purpose) return null;
  const { userId, bind, googleId } = entry;
  return googleId === undefined ? { userId, bind } : { userId, bind, googleId };
}

/** Whether `nonce` is the one whose hash the code was bound to. Timing-safe. */
export function nonceMatchesBind(nonce: string, bind: string): boolean {
  const given = Buffer.from(sha256Hex(nonce), "hex");
  const expected = Buffer.from(bind, "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** How many codes the store holds, for tests. */
export function storedOneTimeCodes(): number {
  return codes.size;
}
