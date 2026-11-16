import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "crypto";
import jwt from "jsonwebtoken";
import { env } from "./env.js";

/** Tokens are signed with HS256 only. Verifying pins it, so no token signed another way, or unsigned, passes. */
const VERIFY: jwt.VerifyOptions = { algorithms: ["HS256"] };

export function signAccessToken(payload: { sub: string }): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN as jwt.SignOptions["expiresIn"],
  });
}

/** A random `jti` makes every token unique. Tokens are stored by hash under a
 *  unique index, and two signed in the same second would otherwise be equal.
 *  `fam` names the token's family, the line of tokens one sign-in produces. */
export function signRefreshToken(payload: { sub: string; fam: string }): string {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN as jwt.SignOptions["expiresIn"],
    jwtid: randomUUID(),
  });
}

export function verifyAccessToken(token: string): { sub: string } {
  const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET, VERIFY) as jwt.JwtPayload;
  if (typeof decoded.sub !== "string") {
    throw new Error("Invalid token payload");
  }
  return { sub: decoded.sub };
}

/** The token's user and family. A token signed before families existed has no `fam`. */
export function verifyRefreshToken(token: string): { sub: string; fam?: string } {
  const decoded = jwt.verify(token, env.JWT_REFRESH_SECRET, VERIFY) as jwt.JwtPayload;
  if (typeof decoded.sub !== "string") {
    throw new Error("Invalid token payload");
  }
  return typeof decoded.fam === "string" ? { sub: decoded.sub, fam: decoded.fam } : { sub: decoded.sub };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// ---------------------------------------------------------------------------
// OAuth state. Every flow that sends a user to Google signs its state here,
// with the purpose always in the signed bytes, so a state from one flow can
// never pass as another's. The fields and the purpose are signed as JSON, so
// no field's text can pose as a boundary. A random nonce makes each state
// unique. A flow that binds the consent to the browser puts it in a cookie.
// ---------------------------------------------------------------------------

/** The flows that sign a state. */
export type OAuthStatePurpose = "google-sign-in" | "google-link";

/** How long a consent may take. */
export const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

const stateSignature = (purpose: OAuthStatePurpose, fields: Record<string, string>, nonce: string, expiresAt: number) =>
  createHmac("sha256", env.JWT_ACCESS_SECRET)
    .update(JSON.stringify(["oauth-state", purpose, Object.entries(fields).sort(), nonce, expiresAt]))
    .digest();

/** A signed state for `purpose` carrying `fields`, and its nonce. */
export function signOAuthState(
  purpose: OAuthStatePurpose,
  fields: Record<string, string>,
): { state: string; nonce: string } {
  const nonce = randomBytes(16).toString("hex");
  const expiresAt = Date.now() + OAUTH_STATE_TTL_MS;
  const sig = stateSignature(purpose, fields, nonce, expiresAt).toString("hex");
  return { state: Buffer.from(JSON.stringify({ fields, nonce, expiresAt, sig })).toString("base64url"), nonce };
}

/** The fields and nonce of a state signed for `purpose`, or null when it is forged, altered, another flow's or expired. */
export function verifyOAuthState(
  purpose: OAuthStatePurpose,
  state: string,
): { fields: Record<string, string>; nonce: string } | null {
  try {
    const { fields, nonce, expiresAt, sig } = JSON.parse(Buffer.from(state, "base64url").toString("utf8")) as Record<
      string,
      unknown
    >;
    if (typeof fields !== "object" || fields === null || Array.isArray(fields)) return null;
    if (!Object.values(fields).every((v) => typeof v === "string")) return null;
    if (typeof nonce !== "string" || typeof expiresAt !== "number" || typeof sig !== "string") return null;
    if (Date.now() > expiresAt) return null;
    const expected = stateSignature(purpose, fields as Record<string, string>, nonce, expiresAt);
    const given = Buffer.from(sig, "hex");
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
    return { fields: fields as Record<string, string>, nonce };
  } catch {
    return null;
  }
}
