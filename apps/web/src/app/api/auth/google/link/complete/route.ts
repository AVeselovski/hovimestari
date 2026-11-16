import type { GoogleLinkResult } from "@/lib/googleLink";
import { NextResponse, type NextRequest } from "next/server";
import { GOOGLE_LINK_NONCE_COOKIE, GOOGLE_LINK_NONCE_PATH } from "../../../_constants";
import { readJson, relay } from "../../../_relay";

/**
 * Finishes linking Google. The backend's callback sends the browser here
 * with a one-time code. The code and this browser's nonce are exchanged, and
 * the backend links the Google account only when the nonce is the one the
 * flow started with. The nonce cookie is spent on every outcome, and the
 * browser goes back to Settings with the result.
 *
 * A GET navigation arriving from Google through the backend is cross-site by
 * nature, so the same-origin guard cannot apply. The nonce is what protects
 * it: a code made in another browser meets a different nonce here, or none.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const code = request.nextUrl.searchParams.get("code");
  const nonce = request.cookies.get(GOOGLE_LINK_NONCE_COOKIE)?.value;

  let result: GoogleLinkResult = "failed";
  if (code && nonce) {
    try {
      const answer = await relay(request, "/auth/link/google/exchange", { body: { code, nonce } });
      if (answer.ok) result = "linked";
      else if (answer.status === 409) {
        const { code: refusal } = await readJson<{ code?: unknown }>(answer);
        if (refusal === "google_taken") result = "taken";
        else if (refusal === "google_already_linked") result = "already";
      }
    } catch {
      // Out of reach or misconfigured: the link did not finish.
    }
  }

  const out = NextResponse.redirect(new URL(`/settings?google=${result}`, request.nextUrl.origin), 302);
  out.cookies.delete({ name: GOOGLE_LINK_NONCE_COOKIE, path: GOOGLE_LINK_NONCE_PATH });
  return out;
}
