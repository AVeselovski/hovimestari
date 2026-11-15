import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_NAME, COOKIE_PATH } from "../_constants";
import { requireSameOrigin } from "../_guard";
import { relay } from "../_relay";

/** Ends this device's session. The backend is told best effort, and the cookie goes whatever it answers. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const refusal = requireSameOrigin(request, { readsBody: false });
  if (refusal) return refusal;

  const refreshToken = request.cookies.get(COOKIE_NAME)?.value;
  if (refreshToken) {
    try {
      await relay(request, "/auth/logout", { body: { refreshToken } });
    } catch {
      // Best effort. The token expires on its own.
    }
  }

  const res = new NextResponse(null, { status: 204 });
  res.cookies.delete({ name: COOKIE_NAME, path: COOKIE_PATH });
  return res;
}
