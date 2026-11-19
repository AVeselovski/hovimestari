import { randomBytes, randomUUID } from "node:crypto";
import type pg from "pg";

/** A user made for a test, with the headers that authenticate as them. */
export interface ApiUser {
  id: string;
  auth: { Authorization: string };
}

/**
 * A Google-only user inserted directly into the suite's database, signed in:
 * a live refresh row of a new family, and an access token for them that names
 * it, as a sign-in makes them. It skips the sign-up route and its rate limit,
 * which the auth suites test. The row's hash is of no token, so the session
 * can be checked and ended but not renewed. The token module is imported here, not
 * at the top: it loads the env, which must not be read before the suite has
 * pointed DATABASE_URL at its throwaway database.
 */
export async function signUp(client: pg.Client): Promise<ApiUser> {
  const { rows } = await client.query("INSERT INTO users (email, google_id) VALUES ($1, $2) RETURNING id", [
    `api-${randomUUID()}@example.com`,
    `google-${randomUUID()}`,
  ]);
  const id = rows[0].id as string;
  const fam = randomUUID();
  await client.query(
    `INSERT INTO refresh_tokens (user_id, family_id, token_hash, expires_at)
     VALUES ($1, $2, $3, now() + interval '7 days')`,
    [id, fam, randomBytes(32).toString("hex")],
  );
  const { signAccessToken } = await import("../../lib/jwt.js");
  return { id, auth: { Authorization: `Bearer ${signAccessToken({ sub: id, fam })}` } };
}
