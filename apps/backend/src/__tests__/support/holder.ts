import pg from "pg";
import type { WriteContext } from "../../services/writes/context.js";

// The two ways a race suite holds a transaction open while a request goes
// through the API: raw SQL on a connection of its own, or a real service call
// inside a transaction on the app's pool. Either stays open until `commit`,
// and the suite reads pg_locks to see the request queue behind it.

/** A transaction on a connection of its own to `url`, held until `commit` or `rollback`. */
export async function sqlHolder(url: string) {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  await client.query("BEGIN");
  const end = async (how: "COMMIT" | "ROLLBACK") => {
    await client.query(how);
    await client.end();
  };
  return {
    query: (text: string, values?: unknown[]) => client.query(text, values),
    commit: () => end("COMMIT"),
    rollback: () => end("ROLLBACK"),
  };
}

/**
 * Runs `write`, a real service call, inside a transaction on `ctx.db` and
 * holds that transaction open until `commit`. Answers once `write` has
 * returned, with what it returned. The service's own transaction becomes a
 * savepoint inside the held one, so its locks last until `commit`.
 */
export async function serviceHolder<T>(ctx: WriteContext, write: (ctx: WriteContext) => Promise<T>) {
  let release!: () => void;
  const released = new Promise<void>((resolve) => (release = resolve));
  let wrote!: (value: T) => void;
  let failed!: (err: unknown) => void;
  const written = new Promise<T>((resolve, reject) => {
    wrote = resolve;
    failed = reject;
  });
  const done = ctx.db.transaction(async (tx) => {
    wrote(await write({ ...ctx, db: tx }));
    await released;
  });
  // A failure before `write` returns rejects `written`. One after it, at the
  // commit, comes back from `commit` itself, which awaits `done`.
  done.catch(failed);
  const value = await written;
  return {
    value,
    commit: async () => {
      release();
      await done;
    },
  };
}
