import { describe, expect, it, jest } from "@jest/globals";
import { EventEmitter } from "node:events";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const poolInstances: FakePool[] = [];

class FakePool extends EventEmitter {
  options: Record<string, unknown>;

  constructor(options: Record<string, unknown>) {
    super();
    this.options = options;
    poolInstances.push(this);
  }
}

jest.unstable_mockModule("pg", () => ({
  default: { Pool: FakePool },
}));

jest.unstable_mockModule("../../lib/env.js", () => ({
  env: { DATABASE_URL: "postgresql://tester@localhost:5432/test", DB_POOL_MAX: 7 },
}));

jest.unstable_mockModule("drizzle-orm/node-postgres", () => ({
  drizzle: jest.fn(() => ({})),
}));

// ---------------------------------------------------------------------------
// Import module under test (after mocks are registered)
// ---------------------------------------------------------------------------

const { poolStats } = await import("../index.js");
const pool = poolInstances[0];

describe("db pool configuration", () => {
  it("constructs the pool with the env pool size, warm connections and bounded timeouts", () => {
    expect(poolInstances).toHaveLength(1);
    expect(pool.options).toMatchObject({
      connectionString: "postgresql://tester@localhost:5432/test",
      max: 7,
      min: 2,
      idleTimeoutMillis: 300_000,
      connectionTimeoutMillis: 5_000,
      statement_timeout: 8_000,
      query_timeout: 9_000,
      lock_timeout: 3_000,
      idle_in_transaction_session_timeout: 10_000,
      application_name: "hovimestari-backend",
      keepAlive: true,
    });
  });

  it("registers an error listener on the pool", () => {
    expect(pool.listenerCount("error")).toBe(1);
  });

  it("survives an idle client error without throwing", () => {
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    try {
      const err = Object.assign(new Error("connection terminated"), { code: "57P01", detail: "secret row values" });
      expect(() => pool.emit("error", err)).not.toThrow();
      expect(consoleSpy).toHaveBeenCalledWith(
        "[db] idle client error:",
        expect.stringContaining("Error: connection terminated"),
      );
      // Logged through failureOf: the code, never the error's detail.
      const logged = String(consoleSpy.mock.calls[0][1]);
      expect(logged).toContain("code=57P01");
      expect(logged).not.toContain("secret row values");
    } finally {
      consoleSpy.mockRestore();
    }
  });

  it("attaches an error listener to every client it connects, so a checked-out client's dropped connection cannot crash the process", () => {
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    try {
      const client = new EventEmitter();
      pool.emit("connect", client);
      // Without a listener, EventEmitter throws on "error" and Node exits.
      expect(() =>
        client.emit(
          "error",
          Object.assign(new Error("terminating connection due to administrator command"), { code: "57P01" }),
        ),
      ).not.toThrow();
      expect(consoleSpy).toHaveBeenCalledWith(
        "[db] client error:",
        "57P01",
        "terminating connection due to administrator command",
      );
    } finally {
      consoleSpy.mockRestore();
    }
  });

  it("reports pool occupancy", () => {
    Object.assign(pool, { totalCount: 4, idleCount: 1, waitingCount: 3 });
    expect(poolStats()).toEqual({ total: 4, idle: 1, waiting: 3 });
  });
});
