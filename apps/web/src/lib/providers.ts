import { BackendConfigError, backendUrl } from "@/lib/backend";
import { AuthProvidersSchema, type AuthProviders } from "@hovimestari/types";
import { connection } from "next/server";

/** How long the guest pages wait for the backend before they render without Google. */
const PROVIDERS_TIMEOUT_MS = 3_000;

/**
 * Which sign-in providers the backend offers, read on the server at request
 * time. When the backend cannot be reached, or answers something else, the
 * page renders without Google rather than failing.
 */
export async function readProviders(): Promise<AuthProviders> {
  // At request time, never at build time, when no backend is running.
  await connection();
  try {
    const backend = backendUrl();
    const res = await fetch(`${backend}/api/v1/auth/providers`, {
      cache: "no-store",
      signal: AbortSignal.timeout(PROVIDERS_TIMEOUT_MS),
    });
    if (!res.ok) return { google: false };
    const parsed = AuthProvidersSchema.safeParse(await res.json());
    return parsed.success ? parsed.data : { google: false };
  } catch (err) {
    if (err instanceof BackendConfigError) console.error("[providers] BACKEND_URL is not set");
    return { google: false };
  }
}
