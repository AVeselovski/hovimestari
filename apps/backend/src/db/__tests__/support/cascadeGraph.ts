import type pg from "pg";

/** One foreign key, from a referencing table to the table it points at. */
interface Edge {
  child: string;
  parent: string;
  name: string;
  /** pg_constraint.confdeltype: "c" is ON DELETE CASCADE. */
  onDelete: string;
}

/** What the walk found: every table reached from `users`, and every rule broken. */
export interface CascadeReport {
  reached: string[];
  violations: string[];
}

/**
 * Walks the foreign keys backwards from `users`: every table that references
 * a table already reached is reached too, until nothing new is. Every edge
 * into the reached set must cascade on delete, or deleting a user would leave
 * orphans or be blocked. A table with a `user_id` column outside the reached
 * set is a user's data that no deletion reaches.
 */
export async function walkCascadeGraph(client: pg.Client): Promise<CascadeReport> {
  const { rows: edges } = await client.query<Edge>(`
    SELECT c.conrelid::regclass::text AS child, c.confrelid::regclass::text AS parent,
           c.conname AS name, c.confdeltype::text AS "onDelete"
    FROM pg_constraint c
    JOIN pg_namespace n ON n.oid = c.connamespace
    WHERE c.contype = 'f' AND n.nspname = 'public'`);

  const reached = new Set(["users"]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const edge of edges) {
      if (reached.has(edge.parent) && !reached.has(edge.child)) {
        reached.add(edge.child);
        grew = true;
      }
    }
  }

  const violations = edges
    .filter((e) => reached.has(e.parent) && e.child !== e.parent && e.onDelete !== "c")
    .map((e) => `${e.child} -> ${e.parent} (${e.name}) does not cascade on delete`);

  const { rows: withUserId } = await client.query<{ table: string }>(`
    SELECT table_name AS table FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name = 'user_id'`);
  for (const { table } of withUserId) {
    if (!reached.has(table)) violations.push(`${table} has user_id but no cascading foreign key reaches it from users`);
  }

  reached.delete("users");
  return { reached: [...reached].sort(), violations };
}
