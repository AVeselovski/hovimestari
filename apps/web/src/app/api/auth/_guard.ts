import type { ErrorCode } from "@hovimestari/types";
import { NextResponse, type NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// The same-origin guard. Every route handler that accepts a POST runs it
// first, so no other site can drive one: a cross-site form could otherwise
// sign a visitor into an account it controls and read what they log.
//
// A request passes when the browser says it is same-origin
// (`Sec-Fetch-Site: same-origin`), or, from a browser that does not send that
// header, when `Origin` is this site. A request with neither is refused.
// A JSON body is required where the handler reads one, and any other body
// type is refused everywhere, so a cross-site `<form enctype="text/plain">`
// that happens to hold valid JSON never reaches a parser.
// ---------------------------------------------------------------------------

function refused(status: 403 | 415): NextResponse {
  const code: ErrorCode = "request_refused";
  return NextResponse.json({ message: "The request was refused.", code }, { status });
}

function isSameOrigin(request: NextRequest): boolean {
  const site = request.headers.get("sec-fetch-site");
  if (site !== null) return site === "same-origin";
  const origin = request.headers.get("origin");
  return origin !== null && origin === request.nextUrl.origin;
}

function isJson(request: NextRequest): boolean {
  const type = request.headers.get("content-type");
  return type !== null && type.split(";")[0].trim().toLowerCase() === "application/json";
}

/**
 * The refusal for a request this handler must not serve, or null to go on.
 * `readsBody` says whether the handler parses a JSON body.
 */
export function requireSameOrigin(request: NextRequest, { readsBody }: { readsBody: boolean }): NextResponse | null {
  if (!isSameOrigin(request)) return refused(403);
  const hasType = request.headers.get("content-type") !== null;
  if (readsBody ? !isJson(request) : hasType && !isJson(request)) return refused(415);
  return null;
}
