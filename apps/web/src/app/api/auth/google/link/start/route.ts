import { GoogleLinkStartSchema, type ErrorCode } from "@hovimestari/types";
import { NextResponse, type NextRequest } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import { GOOGLE_LINK_NONCE_COOKIE, googleLinkNonceCookieOptions } from "../../../_constants";
import { requireSameOrigin } from "../../../_guard";
import { passRefusal, readJson, relay, relayFailure } from "../../../_relay";

/**
 * Starts linking Google to the signed-in account. A fresh nonce goes into an
 * httpOnly cookie in this browser, and only its SHA-256 travels to the
 * backend, inside the state it signs for Google. The finished link is
 * exchanged with the nonce itself (`google/link/complete`), so a link
 * finished in any other browser links nothing.
 *
 * A POST from the page with the person's bearer, so it runs the same-origin
 * guard: no other site can start a link in this browser. It answers Google's
 * consent address, and the page navigates there.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const refusal = requireSameOrigin(request, { readsBody: false });
  if (refusal) return refusal;

  const bearer = /^Bearer (\S+)$/.exec(request.headers.get("authorization") ?? "")?.[1];
  if (!bearer) {
    const code: ErrorCode = "unauthorized";
    return NextResponse.json({ message: "Sign in first.", code }, { status: 401 });
  }

  const nonce = randomBytes(32).toString("base64url");
  const bind = createHash("sha256").update(nonce).digest("hex");

  let res: Response;
  try {
    res = await relay(request, "/auth/link/google/start", { body: { bind }, bearer });
  } catch (err) {
    return relayFailure(err);
  }
  if (!res.ok) return passRefusal(res);

  const parsed = GoogleLinkStartSchema.safeParse(await readJson(res));
  if (!parsed.success) {
    console.error("[google link start] the backend answered a start that does not parse");
    return NextResponse.json({ message: "Something went wrong." }, { status: 502 });
  }
  const out = NextResponse.json(parsed.data, { status: 200, headers: { "Cache-Control": "no-store" } });
  out.cookies.set(GOOGLE_LINK_NONCE_COOKIE, nonce, googleLinkNonceCookieOptions());
  return out;
}
