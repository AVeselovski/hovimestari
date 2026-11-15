import type { ErrorCode } from "@hovimestari/types";
import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_NAME, COOKIE_PATH } from "../_constants";
import { requireSameOrigin } from "../_guard";
import { readJson, relay, relayFailure } from "../_relay";
import { browserSession, malformedGrant } from "../_session";

function sessionEnded(): NextResponse {
  const code: ErrorCode = "session_expired";
  const res = NextResponse.json({ message: "The session has ended.", code }, { status: 401 });
  res.cookies.delete({ name: COOKIE_NAME, path: COOKIE_PATH });
  return res;
}

/**
 * Renews the session from the refresh cookie and rotates it. Only the
 * backend's 401 `session_expired` ends the session and deletes the cookie.
 * When the backend cannot be reached the cookie stays and the answer is 503
 * `server_unreachable`, so an outage signs nobody out. Any other refusal is a
 * server fault: 502, cookie kept.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const refusal = requireSameOrigin(request, { readsBody: false });
  if (refusal) return refusal;

  const refreshToken = request.cookies.get(COOKIE_NAME)?.value;
  if (!refreshToken) return sessionEnded();

  let res: Response;
  try {
    res = await relay(request, "/auth/refresh", { body: { refreshToken } });
  } catch (err) {
    return relayFailure(err);
  }
  const body = await readJson<{ code?: unknown }>(res);
  // Only the backend saying the session is over ends it. A refused relay
  // (a wrong secret, a 401 request_refused) is this deployment's fault, and
  // deleting the cookie for it would sign everyone out.
  if (res.status === 401 && body.code === "session_expired") return sessionEnded();
  if (!res.ok) {
    console.error(`[auth relay] the backend refused a renewal with ${res.status}`);
    return NextResponse.json({ message: "Something went wrong." }, { status: 502 });
  }
  return browserSession(body, 200) ?? malformedGrant();
}
