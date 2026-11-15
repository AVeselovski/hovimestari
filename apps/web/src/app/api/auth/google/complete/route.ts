import { NextResponse, type NextRequest } from "next/server";
import { GOOGLE_NONCE_COOKIE, GOOGLE_NONCE_PATH } from "../../_constants";
import { readJson, relay } from "../../_relay";
import { browserSession } from "../../_session";

/**
 * Finishes a Google sign-in. The backend's callback sends the browser here
 * with a one-time code. The code and this browser's nonce are exchanged for a
 * session, the refresh cookie is set, and the browser goes on to the sign-in
 * page, where the guard forwards it into the app. The nonce cookie is spent
 * on every outcome.
 *
 * A GET navigation arriving from Google through the backend is cross-site by
 * nature, so the same-origin guard cannot apply. The nonce is what protects it.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const code = request.nextUrl.searchParams.get("code");
  const nonce = request.cookies.get(GOOGLE_NONCE_COOKIE)?.value;

  let res: NextResponse | null = null;
  if (code && nonce) {
    try {
      const answer = await relay(request, "/auth/google/exchange", { body: { code, nonce } });
      if (answer.ok) res = browserSession(await readJson(answer), 200);
    } catch {
      // Out of reach or misconfigured: the sign-in did not finish.
    }
  }

  const to = new URL(res ? "/auth/sign-in" : "/auth/sign-in?error=google_failed", request.nextUrl.origin);
  const out = NextResponse.redirect(to, 302);
  if (res) {
    // Carry the refresh cookie from the session answer onto the redirect.
    for (const cookie of res.cookies.getAll()) out.cookies.set(cookie);
  }
  out.cookies.delete({ name: GOOGLE_NONCE_COOKIE, path: GOOGLE_NONCE_PATH });
  return out;
}
