import { createHash, randomBytes } from "node:crypto";

/**
 * Turns Google on for the suite that calls it, before it imports the app.
 * The client secret is generated, so no test holds one.
 */
export function enableGoogle(): void {
  Object.assign(process.env, {
    GOOGLE_CLIENT_ID: "test-client-id",
    GOOGLE_CLIENT_SECRET: randomBytes(32).toString("hex"),
    GOOGLE_CALLBACK_URL: "http://localhost:3001/api/v1/auth/google/callback",
    GOOGLE_LINK_CALLBACK_URL: "http://localhost:3001/api/v1/auth/link/google/callback",
  });
}

/** A web app nonce and its bind, as /api/auth/google/start makes them. */
export function browserNonce(): { nonce: string; bind: string } {
  const nonce = randomBytes(32).toString("base64url");
  return { nonce, bind: createHash("sha256").update(nonce).digest("hex") };
}
