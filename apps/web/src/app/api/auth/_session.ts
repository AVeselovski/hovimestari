import { SessionGrantSchema, type BrowserSession, type ErrorCode } from "@hovimestari/types";
import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_NAME, refreshCookieOptions } from "./_constants";
import { passRefusal, readJson, relay, relayFailure } from "./_relay";

// ---------------------------------------------------------------------------
// What every token-issuing handler does with the backend's answer: the
// refresh token goes into the httpOnly cookie, and the browser gets the
// access token and the user, never the refresh token.
// ---------------------------------------------------------------------------

/** The browser's answer for a grant, with the refresh cookie set. Null when the grant is malformed. */
export function browserSession(grant: unknown, status: 200 | 201): NextResponse | null {
  const parsed = SessionGrantSchema.safeParse(grant);
  if (!parsed.success) return null;
  const { accessToken, refreshToken, user } = parsed.data;
  const session: BrowserSession = { accessToken, user };
  const res = NextResponse.json(session, { status });
  res.cookies.set(COOKIE_NAME, refreshToken, refreshCookieOptions());
  return res;
}

export function invalidRequest(): NextResponse {
  const code: ErrorCode = "invalid_request";
  return NextResponse.json({ message: "The request is not valid.", code }, { status: 400 });
}

export function malformedGrant(): NextResponse {
  console.error("[auth relay] the backend answered a grant that does not parse");
  return NextResponse.json({ message: "Something went wrong." }, { status: 502 });
}

/** Relays a sign-in or a sign-up body and answers with the browser's session. */
export async function relayCredentials(
  request: NextRequest,
  path: "/auth/login" | "/auth/register",
  status: 200 | 201,
): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return invalidRequest();
  }

  let res: Response;
  try {
    res = await relay(request, path, { body });
  } catch (err) {
    return relayFailure(err);
  }
  if (!res.ok) return passRefusal(res);
  return browserSession(await readJson(res), status) ?? malformedGrant();
}
