import { NextResponse, type NextRequest } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import { GOOGLE_NONCE_COOKIE, googleNonceCookieOptions } from "../../_constants";

/**
 * Starts a Google sign-in. A fresh nonce goes into an httpOnly cookie in this
 * browser, and only its SHA-256 travels to the backend and Google. The
 * finished sign-in is exchanged with the nonce itself (`google/complete`), so
 * a flow finished in one browser is useless in any other.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const nonce = randomBytes(32).toString("base64url");
  const bind = createHash("sha256").update(nonce).digest("hex");
  const configured = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (!configured && process.env.NODE_ENV === "production") {
    console.error("[google start] NEXT_PUBLIC_API_URL is not set");
    return NextResponse.redirect(new URL("/auth/sign-in?error=google_unavailable", request.nextUrl.origin), 302);
  }
  const apiUrl = (configured || "http://localhost:3001/api/v1").replace(/\/+$/, "");

  const res = NextResponse.redirect(`${apiUrl}/auth/google?bind=${bind}`, 302);
  res.cookies.set(GOOGLE_NONCE_COOKIE, nonce, googleNonceCookieOptions());
  return res;
}
