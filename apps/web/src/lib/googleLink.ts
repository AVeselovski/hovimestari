/**
 * What Settings says about a finished Google link. The link's complete
 * handler sends the browser to `/settings?google=<result>`, and the backend's
 * own callback sends `failed` when Google's answer was refused.
 */
export const GOOGLE_LINK_RESULTS = ["linked", "taken", "already", "failed"] as const;

export type GoogleLinkResult = (typeof GOOGLE_LINK_RESULTS)[number];

export function isGoogleLinkResult(value: unknown): value is GoogleLinkResult {
  return typeof value === "string" && (GOOGLE_LINK_RESULTS as readonly string[]).includes(value);
}
