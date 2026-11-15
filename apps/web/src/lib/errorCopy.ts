import type { ErrorCode } from "@hovimestari/types";
import type messages from "../../messages/en.json";

// ---------------------------------------------------------------------------
// Which error codes have their own line in the catalog (`errors.<code>`).
// A code listed here never reaches a screen as itself, for the reason given.
// lib/__tests__/errorCopy.test.ts fails when a code has neither copy nor an
// entry here, and when an entry here has copy, so this list cannot go stale.
// ---------------------------------------------------------------------------

export const CODES_WITHOUT_COPY = [
  // No screen sends a sign-in method the server could refuse.
  "invalid_method",
  // The forgot-password page shows its usual answer for a limited request too.
  "reset_rate_limited",
] as const satisfies readonly ErrorCode[];

type CodeWithoutCopy = (typeof CODES_WITHOUT_COPY)[number];

/** An error code with its own catalog line. */
export type CopiedErrorCode = Exclude<ErrorCode, CodeWithoutCopy>;

/** Every key under `errors` in the catalog: one per copied code, and the fallback. */
export type ErrorCopyKey = keyof (typeof messages)["errors"];

const WITHOUT_COPY: ReadonlySet<string> = new Set(CODES_WITHOUT_COPY);

/**
 * The `errors` catalog key for a code, or the generic line for none. The
 * `satisfies` makes tsc fail when a copied code has no catalog entry.
 */
export function errorCopyKey(code: ErrorCode | undefined): ErrorCopyKey {
  if (code === undefined || WITHOUT_COPY.has(code)) return "fallback";
  return code as CopiedErrorCode satisfies ErrorCopyKey;
}
