import type { NextRequest, NextResponse } from "next/server";
import { requireSameOrigin } from "../_guard";
import { relayCredentials } from "../_session";

/** Creates an account with an email and a password, and signs it in. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  return requireSameOrigin(request, { readsBody: true }) ?? relayCredentials(request, "/auth/register", 201);
}
