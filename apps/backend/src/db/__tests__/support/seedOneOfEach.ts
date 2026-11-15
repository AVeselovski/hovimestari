import { randomBytes, randomUUID } from "node:crypto";
import type pg from "pg";

/**
 * The user-owned tables `seedOneOfEach` fills. A step that adds a user-owned
 * table adds it here and seeds a row of it below. userCascade.db.test.ts fails
 * while the cascade graph reaches a table this list does not name.
 */
export const SEEDED_TABLES = ["password_reset_tokens", "refresh_tokens"] as const;

const hash = () => randomBytes(32).toString("hex");
const inAWeek = () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

/** One row in every user-owned table for `userId`. */
export async function seedOneOfEach(client: pg.Client, userId: string): Promise<void> {
  await client.query("INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)", [
    userId,
    hash(),
    inAWeek(),
  ]);
  await client.query("INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)", [
    userId,
    hash(),
    inAWeek(),
  ]);
}

/** A user with a sign-in method, made directly in the database. */
export async function insertUser(client: pg.Client): Promise<string> {
  const { rows } = await client.query("INSERT INTO users (email, google_id) VALUES ($1, $2) RETURNING id", [
    `cascade-${randomUUID()}@example.com`,
    `google-${randomUUID()}`,
  ]);
  return rows[0].id as string;
}
