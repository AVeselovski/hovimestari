import { backendUrl } from "@/lib/backend";
import { isErrorCode, type ErrorCode } from "@hovimestari/types";
import { NextResponse, type NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// The relay from the app's route handlers to the backend. Every call carries
// the relay secret, which only this server holds, and the browser's address,
// which the secret vouches for so the backend's rate limits key on the real
// person rather than on this server.
//
// In production the address is `x-real-ip` only, which Vercel sets from the
// connecting address and a client cannot override. Without it the handler
// relays nothing. `x-forwarded-for` is never read, because outside Vercel's
// edge a client can set it. In development the address is `x-real-ip` when
// present and the loopback address otherwise.
//
// A production build run on this machine (`next start`) has no Vercel in
// front of it. `LOCAL_PRODUCTION_RELAY=1` lets it fall back to the loopback
// address as development does. Vercel sets `VERCEL`, and there the flag is
// ignored, so a deployment can never key every sign-in on one address.
// ---------------------------------------------------------------------------

export const BFF_SECRET_HEADER = "X-Bff-Secret";
export const CLIENT_IP_HEADER = "X-Client-Ip";

/** How long a relayed call may take before it counts as the backend being out of reach. */
const RELAY_TIMEOUT_MS = 10_000;

/** Why a relay could not be made. */
export class RelayError extends Error {
  constructor(readonly kind: "misconfigured" | "unreachable") {
    super(kind);
    this.name = "RelayError";
  }
}

/** The browser's address, as this deployment can know it. Null when it cannot. */
export function clientAddress(request: NextRequest): string | null {
  const realIp = request.headers.get("x-real-ip")?.trim() || null;
  const localRun = process.env.LOCAL_PRODUCTION_RELAY === "1" && !process.env.VERCEL;
  if (process.env.NODE_ENV === "production" && !localRun) return realIp;
  return realIp ?? "127.0.0.1";
}

/**
 * Calls `POST /api/v1<path>` on the backend for `request`'s browser. Throws a
 * `RelayError` when this server is misconfigured or the backend cannot be
 * reached. Any answer, a refusal included, is returned as it came.
 */
export async function relay(
  request: NextRequest,
  path: string,
  { body, bearer }: { body?: unknown; bearer?: string } = {},
): Promise<Response> {
  const secret = process.env.BFF_SECRET;
  const address = clientAddress(request);
  if (!secret || !address) throw new RelayError("misconfigured");
  let base: string;
  try {
    base = backendUrl();
  } catch {
    throw new RelayError("misconfigured");
  }

  const headers: Record<string, string> = { [BFF_SECRET_HEADER]: secret, [CLIENT_IP_HEADER]: address };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (bearer) headers.Authorization = `Bearer ${bearer}`;

  try {
    return await fetch(`${base}/api/v1${path}`, {
      method: "POST",
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(RELAY_TIMEOUT_MS),
    });
  } catch {
    throw new RelayError("unreachable");
  }
}

/** The browser's answer when a relay could not be made. Logs nothing of the request. */
export function relayFailure(err: unknown): NextResponse {
  if (err instanceof RelayError && err.kind === "unreachable") {
    const code: ErrorCode = "server_unreachable";
    return NextResponse.json({ message: "The server cannot be reached.", code }, { status: 503 });
  }
  if (err instanceof RelayError) {
    console.error("[auth relay] misconfigured: BFF_SECRET, BACKEND_URL or the client address is missing");
    return NextResponse.json({ message: "Something went wrong." }, { status: 500 });
  }
  throw err;
}

/**
 * Passes a backend refusal to the browser: its status, `message`, `code` and
 * `Retry-After`, and nothing else.
 */
export async function passRefusal(res: Response): Promise<NextResponse> {
  // A body that is not JSON passes the status alone.
  const body = await readJson<{ message?: unknown; code?: unknown }>(res);
  const out = NextResponse.json(
    {
      message: typeof body.message === "string" ? body.message : "The request failed.",
      code: isErrorCode(body.code) ? body.code : undefined,
    },
    { status: res.status },
  );
  const retryAfter = res.headers.get("retry-after");
  if (retryAfter) out.headers.set("Retry-After", retryAfter);
  return out;
}

/** A response's JSON body, or an empty object when it has none or it does not parse. */
export async function readJson<T extends object>(res: Response): Promise<Partial<T>> {
  try {
    const value: unknown = await res.json();
    return value && typeof value === "object" ? (value as Partial<T>) : {};
  } catch {
    return {};
  }
}
