import type { NextRequest, NextResponse } from "next/server";
import { requireSameOrigin } from "../_guard";
import { relayCredentials } from "../_session";

/** Signs in with an email and a password, and sets the refresh cookie. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  return requireSameOrigin(request, { readsBody: true }) ?? relayCredentials(request, "/auth/login", 200);
}
