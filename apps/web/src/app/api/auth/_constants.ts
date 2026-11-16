/** The refresh token's cookie. httpOnly, so no browser JavaScript can read it. */
export const COOKIE_NAME = "__refresh_token";
/** Sent only to the auth route handlers. */
export const COOKIE_PATH = "/api/auth";
/** Seven days, in seconds: the refresh token's own lifetime. */
export const COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

/** The nonce that binds a Google sign-in to the browser that started it. */
export const GOOGLE_NONCE_COOKIE = "__google_sign_in";
export const GOOGLE_NONCE_PATH = "/api/auth/google";
/** Ten minutes, in seconds: long enough for Google's consent screen. */
export const GOOGLE_NONCE_MAX_AGE = 60 * 10;

/** The nonce that binds linking Google to the browser that started it. */
export const GOOGLE_LINK_NONCE_COOKIE = "__google_link";
export const GOOGLE_LINK_NONCE_PATH = "/api/auth/google/link";

const secure = (): boolean => process.env.NODE_ENV === "production";

/** The refresh cookie's attributes. `strict`: no other site's request ever carries it. */
export function refreshCookieOptions(): {
  httpOnly: true;
  secure: boolean;
  sameSite: "strict";
  path: string;
  maxAge: number;
} {
  return { httpOnly: true, secure: secure(), sameSite: "strict", path: COOKIE_PATH, maxAge: COOKIE_MAX_AGE };
}

/**
 * The Google nonce cookie's attributes. `lax`, because the browser comes back
 * to `google/complete` from Google through the backend, a top-level
 * navigation from another site, and must carry it.
 */
export function googleNonceCookieOptions(): {
  httpOnly: true;
  secure: boolean;
  sameSite: "lax";
  path: string;
  maxAge: number;
} {
  return { httpOnly: true, secure: secure(), sameSite: "lax", path: GOOGLE_NONCE_PATH, maxAge: GOOGLE_NONCE_MAX_AGE };
}

/** The Google link nonce cookie's attributes: as the sign-in nonce's, sent only to the link handlers. */
export function googleLinkNonceCookieOptions(): ReturnType<typeof googleNonceCookieOptions> {
  return { ...googleNonceCookieOptions(), path: GOOGLE_LINK_NONCE_PATH };
}
