import { randomBytes, randomUUID } from "node:crypto";
import type pg from "pg";

// Record rows and connections written straight into a suite's database, for
// the suites that read the record. A row's time is given as a timestamp
// literal, never read off the test machine's clock, so rows can share one
// microsecond or arrive in any order the test names.

/** A connection of `userId`, inserted with a hash of nothing. Revoked when `revoked` is set. */
export async function insertConnection(
  client: pg.Client,
  userId: string,
  name: string,
  { revoked = false }: { revoked?: boolean } = {},
): Promise<string> {
  const { rows } = await client.query(
    `INSERT INTO assistant_connections (user_id, name, key_hash, access, expires_at, revoked_at)
     VALUES ($1, $2, $3, 'read_write', now() + interval '30 days', CASE WHEN $4 THEN now() END)
     RETURNING id`,
    [userId, name, randomBytes(32).toString("hex"), revoked],
  );
  return rows[0].id as string;
}

export interface ChangeRow {
  /** A timestamptz literal, such as "2026-11-18 14:32:00.000001+00". */
  at: string;
  /** The name the summary reads. Defaults to "Rahka". */
  name?: string;
  /** A chosen id, for a test that orders rows sharing one time. */
  id?: string;
}

/**
 * A `favourite.set` row for the connection, as `set_favourite` records one,
 * with a request key and hash of its own. Answers its id.
 */
export async function insertChange(
  client: pg.Client,
  userId: string,
  connectionId: string,
  row: ChangeRow,
): Promise<string> {
  const { rows } = await client.query(
    `INSERT INTO assistant_changes
       (id, user_id, connection_id, connection_name, action, entity_ids, summary, request_key, request_hash, created_at)
     SELECT $1, $2, c.id, c.name, 'favourite.set', ARRAY[$3::uuid], $4::jsonb, $5, $6, $7::timestamptz
       FROM assistant_connections c WHERE c.id = $8
     RETURNING id`,
    [
      row.id ?? randomUUID(),
      userId,
      randomUUID(),
      JSON.stringify({ entity: "food", name: row.name ?? "Rahka", changes: [] }),
      `rk_${randomBytes(9).toString("base64url")}`,
      randomBytes(32).toString("hex"),
      row.at,
      connectionId,
    ],
  );
  return rows[0].id as string;
}

/** `n` rows for the connection, one a minute from `from`, oldest first. Answers their ids, oldest first. */
export async function insertChanges(
  client: pg.Client,
  userId: string,
  connectionId: string,
  n: number,
  from = "2026-11-18 08:00:00+00",
): Promise<string[]> {
  const { rows } = await client.query(
    `INSERT INTO assistant_changes
       (user_id, connection_id, connection_name, action, entity_ids, summary, request_key, request_hash, created_at)
     SELECT $1, c.id, c.name, 'favourite.set', ARRAY[gen_random_uuid()],
            jsonb_build_object('entity', 'food', 'name', 'Food ' || i, 'changes', '[]'::jsonb),
            'rk_' || md5(random()::text || i), md5(random()::text), $3::timestamptz + make_interval(mins => i)
       FROM assistant_connections c, generate_series(1, $4::int) AS i
      WHERE c.id = $2
     RETURNING id, created_at`,
    [userId, connectionId, from, n],
  );
  return (rows as { id: string; created_at: Date }[])
    .sort((a, b) => a.created_at.getTime() - b.created_at.getTime())
    .map((r) => r.id);
}
