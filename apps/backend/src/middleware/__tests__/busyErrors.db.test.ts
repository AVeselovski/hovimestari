import { describe, expect, it, jest } from "@jest/globals";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type { NextFunction, Request, Response } from "express";
import pg from "pg";
import { realDatabaseAvailable, testDatabaseUrl } from "../../db/__tests__/support/throwawayDb.js";
import { errorHandler } from "../error.js";

// The two busy conditions that carry no Postgres code, produced for real: a
// pool that cannot hand out a connection in time, and a query the client
// gives up reading. Drizzle wraps both in its query error, with the driver
// error as `cause`, and the middleware must still answer 503. Nothing is
// written, so the suite reads the server TEST_DATABASE_URL names directly.

const run = await realDatabaseAvailable("busyErrors");

/** What `promise` rejected with. */
async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (err) {
    return err;
  }
  throw new Error("expected a rejection");
}

function answer(err: unknown) {
  const res = { status: jest.fn(), json: jest.fn(), set: jest.fn() };
  res.status.mockReturnValue(res);
  res.set.mockReturnValue(res);
  jest.spyOn(console, "error").mockImplementation(() => undefined);
  errorHandler(err, {} as Request, res as unknown as Response, jest.fn() as unknown as NextFunction);
  jest.restoreAllMocks();
  return res;
}

(run ? describe : describe.skip)("busy errors as the driver produces them", () => {
  it("answers 503 to a wrapped pool connect timeout", async () => {
    const pool = new pg.Pool({ connectionString: testDatabaseUrl(), max: 1, connectionTimeoutMillis: 100 });
    const held = await pool.connect();
    try {
      const err = await rejection(drizzle(pool).execute(sql`select 1`));
      expect((err as Error).cause).toMatchObject({ message: "timeout exceeded when trying to connect" });

      const res = answer(err);
      expect(res.status).toHaveBeenCalledWith(503); // before: 500, the wrapper's message was read
      expect(res.set).toHaveBeenCalledWith("Retry-After", "2");
    } finally {
      held.release();
      await pool.end();
    }
  });

  it("answers 503 to a wrapped client-side query read timeout", async () => {
    const pool = new pg.Pool({ connectionString: testDatabaseUrl(), max: 1, query_timeout: 100 });
    pool.on("error", () => undefined);
    try {
      const err = await rejection(drizzle(pool).execute(sql`select pg_sleep(2)`));
      expect((err as Error).cause).toMatchObject({ message: "Query read timeout" });

      const res = answer(err);
      expect(res.status).toHaveBeenCalledWith(503); // before: 500
      expect(res.set).toHaveBeenCalledWith("Retry-After", "2");
    } finally {
      await pool.end();
    }
  });
});
