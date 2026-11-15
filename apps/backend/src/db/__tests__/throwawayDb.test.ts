import { describe, expect, it, jest } from "@jest/globals";
import pg from "pg";
import { createThrowawayDb, realDatabaseAvailable } from "./support/throwawayDb.js";

// ---------------------------------------------------------------------------
// The throwaway database's drop, on real Postgres. `pool.end()` resolves
// before Postgres has seen its clients leave, and DROP DATABASE ... WITH
// (FORCE) ends a session that is still closing with a FATAL error. A pool with
// no error listener throws that error, failing whichever suite is running. So
// drop() waits for the database's sessions to close before it forces.
// Skipped locally when DATABASE_URL is unset or unreachable.
// ---------------------------------------------------------------------------

const run = await realDatabaseAvailable("throwawayDb");

function urlOf(dbName: string): string {
  const url = new URL(process.env.DATABASE_URL!);
  url.pathname = `/${dbName}`;
  return url.toString();
}

async function exists(dbName: string): Promise<boolean> {
  const admin = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await admin.connect();
  try {
    const { rows } = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName]);
    return rows.length > 0;
  } finally {
    await admin.end();
  }
}

(run ? describe : describe.skip)("createThrowawayDb drop()", () => {
  it("lets a session that is still closing leave before it drops the database", async () => {
    const dbName = `throwaway_drop_${process.pid}_${Date.now()}`;
    const throwaway = await createThrowawayDb(dbName);
    const other = new pg.Client({ connectionString: urlOf(dbName) });
    await other.connect();
    const errors: unknown[] = [];
    other.on("error", (err) => errors.push(err));
    const closed = new Promise<void>((resolve) => setTimeout(() => void other.end().then(resolve), 300));

    await throwaway.drop();
    await closed;

    expect(errors).toEqual([]);
    expect(await exists(dbName)).toBe(false);
  });

  it("drops right after a pool ends without the pool raising an error", async () => {
    const dbName = `throwaway_pool_${process.pid}_${Date.now()}`;
    const throwaway = await createThrowawayDb(dbName);
    const pool = new pg.Pool({ connectionString: urlOf(dbName), max: 4 });
    const errors: unknown[] = [];
    pool.on("error", (err) => errors.push(err));
    await Promise.all(Array.from({ length: 4 }, () => pool.query("SELECT pg_sleep(0.05)")));

    await pool.end();
    await throwaway.drop();

    expect(errors).toEqual([]);
    expect(await exists(dbName)).toBe(false);
  });

  it("still drops a database a suite left a session open on", async () => {
    const dbName = `throwaway_left_${process.pid}_${Date.now()}`;
    const throwaway = await createThrowawayDb(dbName);
    const forgotten = new pg.Client({ connectionString: urlOf(dbName) });
    await forgotten.connect();
    forgotten.on("error", () => {});
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});

    try {
      await throwaway.drop();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining(`1 session(s) still open on "${dbName}"`));
    } finally {
      // The forced drop killed its session; end the client object so it does not linger in the worker.
      await forgotten.end().catch(() => {});
      warn.mockRestore();
    }

    expect(await exists(dbName)).toBe(false);
  }, 10_000);
});
