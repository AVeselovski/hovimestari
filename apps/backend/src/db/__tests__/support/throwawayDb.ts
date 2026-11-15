import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import pg from "pg";

// Shared scaffold for the migration tests that run on real Postgres: a
// throwaway database, migrated up to a given migration from a temp folder,
// then by the real folder for the rest. The user of DATABASE_URL must be
// allowed to CREATE DATABASE (CI's service container is one).

export const MIGRATIONS = path.resolve("drizzle/migrations");

export type JournalEntry = { idx: number; tag: string; when: number; version: string; breakpoints: boolean };
export const journal = JSON.parse(readFileSync(path.join(MIGRATIONS, "meta/_journal.json"), "utf8")) as {
  entries: JournalEntry[];
};

/** The SQL of one migration file in the real folder. */
export function readMigration(tag: string): string {
  return readFileSync(path.join(MIGRATIONS, `${tag}.sql`), "utf8");
}

async function reachable(url: string | undefined): Promise<boolean> {
  if (!url) return false;
  const probe = new pg.Client({ connectionString: url, connectionTimeoutMillis: 2_000 });
  try {
    await probe.connect();
    return true;
  } catch {
    return false;
  } finally {
    await probe.end().catch(() => {});
  }
}

/**
 * Whether a real-database suite runs. In CI it runs whenever DATABASE_URL is
 * set, so an unreachable database fails loudly. Locally it is skipped, with a
 * warning naming `label`, when the URL is unset or unreachable.
 */
export async function realDatabaseAvailable(label: string): Promise<boolean> {
  const url = process.env.DATABASE_URL;
  const run = process.env.CI ? Boolean(url) : await reachable(url);
  if (!run) console.warn(`[${label}] skipped: DATABASE_URL is unset or the database is unreachable.`);
  return run;
}

/** How long a drop waits for sessions to close. Well under Jest's 5 s hook timeout, so a drop in `afterAll` reaches the forced drop. */
const SESSION_CLOSE_WAIT_MS = 2_000;
const SESSION_POLL_MS = 50;

type OpenSession = { pid: number; state: string | null; application_name: string };

async function openSessions(admin: pg.Client, dbName: string): Promise<OpenSession[]> {
  const { rows } = await admin.query<OpenSession>(
    "SELECT pid, state, application_name FROM pg_stat_activity WHERE datname = $1 AND backend_type = 'client backend'",
    [dbName],
  );
  return rows;
}

/**
 * Drops database `dbName` once the sessions on it have closed. `pool.end()`
 * resolves before Postgres has seen its clients leave, and DROP DATABASE ...
 * WITH (FORCE) ends a session that is still closing with a FATAL error, which
 * a pool with no error listener throws into whichever suite runs next. So the
 * drop waits up to SESSION_CLOSE_WAIT_MS for the sessions to go, then warns
 * and forces out any a suite left open.
 */
export async function dropDatabase(admin: pg.Client, dbName: string): Promise<void> {
  const deadline = Date.now() + SESSION_CLOSE_WAIT_MS;
  let open = await openSessions(admin, dbName);
  while (open.length > 0 && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, SESSION_POLL_MS));
    open = await openSessions(admin, dbName);
  }
  if (open.length > 0) {
    const sessions = open.map((s) => `pid ${s.pid} (${s.state ?? "no state"}, "${s.application_name}")`).join(", ");
    console.warn(
      `[throwawayDb] ${open.length} session(s) still open on "${dbName}" after ${SESSION_CLOSE_WAIT_MS} ms, forcing them out: ${sessions}. A suite left a client or pool open.`,
    );
  }
  await admin.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
}

export interface ThrowawayDb {
  client: pg.Client;
  /** Applies every migration whose idx is below `idx`, from a temp folder holding only those. */
  migrateBefore(idx: number): Promise<void>;
  /** Applies the rest from the real folder. */
  migrateAll(): Promise<void>;
  /** Closes its connection, removes the temp folder and drops the database once every session on it has closed. */
  drop(): Promise<void>;
}

/** Creates database `dbName` next to the one DATABASE_URL names and connects to it. */
export async function createThrowawayDb(dbName: string): Promise<ThrowawayDb> {
  const baseUrl = process.env.DATABASE_URL!;
  const admin = new pg.Client({ connectionString: baseUrl });
  await admin.connect();
  const url = new URL(baseUrl);
  url.pathname = `/${dbName}`;
  const client = new pg.Client({ connectionString: url.toString() });
  try {
    await admin.query(`CREATE DATABASE "${dbName}"`);
    await client.connect();
  } catch (err) {
    await client.end().catch(() => {});
    // Only `client` was ever connected here and it is ended above, so there is
    // no closing session to wait for: the direct forced drop is safe.
    await admin.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`).catch(() => {});
    await admin.end();
    throw err;
  }

  const { drizzle } = await import("drizzle-orm/node-postgres");
  const { migrate } = await import("drizzle-orm/node-postgres/migrator");
  let partialFolder: string | undefined;

  return {
    client,
    async migrateBefore(idx) {
      partialFolder = mkdtempSync(path.join(tmpdir(), `migrations-before-${idx}-`));
      mkdirSync(path.join(partialFolder, "meta"));
      const earlier = journal.entries.filter((e) => e.idx < idx);
      for (const e of earlier) {
        copyFileSync(path.join(MIGRATIONS, `${e.tag}.sql`), path.join(partialFolder, `${e.tag}.sql`));
      }
      writeFileSync(path.join(partialFolder, "meta/_journal.json"), JSON.stringify({ ...journal, entries: earlier }));
      await migrate(drizzle(client), { migrationsFolder: partialFolder });
    },
    async migrateAll() {
      await migrate(drizzle(client), { migrationsFolder: MIGRATIONS });
    },
    async drop() {
      await client.end().catch(() => {});
      if (partialFolder) rmSync(partialFolder, { recursive: true, force: true });
      await dropDatabase(admin, dbName);
      await admin.end();
    },
  };
}
