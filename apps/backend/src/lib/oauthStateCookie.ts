import { timingSafeEqual } from "node:crypto";
import { env } from "./env.js";

// ---------------------------------------------------------------------------
// The cookie that ties an OAuth consent to the browser that started it. The
// start sets the signed state's nonce in a cookie only the flow's callback
// receives. The callback requires the two to match, so a consent URL sent to
// someone else's browser lands nowhere.
// ---------------------------------------------------------------------------

/** A state cookie's attributes for the callback at `path`. The callback clears it with the same ones. */
export const stateCookieOptions = (path: string) =>
  ({
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    // Lax still rides on Google's top-level redirect back to the callback.
    sameSite: "lax",
    path,
  }) as const;

/** One cookie's value from the Cookie header. */
export function cookieValue(header: string | undefined, name: string): string | undefined {
  for (const part of (header ?? "").split(";")) {
    const at = part.indexOf("=");
    if (at > 0 && part.slice(0, at).trim() === name) return part.slice(at + 1).trim();
  }
  return undefined;
}

/** Whether the browser's cookie holds the state's nonce. */
export function nonceMatches(nonce: string, cookie: string | undefined): boolean {
  const given = Buffer.from(cookie ?? "");
  const expected = Buffer.from(nonce);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
