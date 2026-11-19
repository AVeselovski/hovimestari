import { jest } from "@jest/globals";
import jwt from "jsonwebtoken";
import { createHash } from "node:crypto";
import pg from "pg";
import request from "supertest";
import type { DbSuite } from "../../db/__tests__/support/throwawayDb.js";
import { testPassword } from "./credentials.js";
import { relayHeaders } from "./relay.js";

// The session routes as a real-database suite drives them, and the database
// checks those suites make: a user's refresh rows, and whether a request is
// waiting on a row lock, read from pg_locks rather than guessed with a sleep.

export type Grant = { accessToken: string; refreshToken: string; user: { id: string } };

let n = 0;
/** An address no other test in the run uses. */
export const freshEmail = (): string => `session${++n}-${process.pid}-${Date.now()}@example.com`;

/** The SHA-256 the server stores a refresh token by. */
export const hashOf = (token: string): string => createHash("sha256").update(token).digest("hex");

/** The family a refresh token names, or undefined for a token without one. */
export const familyOf = (token: string): string | undefined =>
  (jwt.decode(token) as { fam?: string } | null)?.fam ?? undefined;

/** A refresh token signed with the runtime secret, the way tokens were signed before families existed. */
export const tokenWithoutFamily = (sub: string): string =>
  jwt.sign({ sub }, process.env.JWT_REFRESH_SECRET!, { expiresIn: "7d", jwtid: `${Date.now()}-${++n}` });

/** An access token signed with the runtime secret that names no session, as access tokens were signed before they named one. */
export const accessTokenWithoutFamily = (sub: string): string =>
  jwt.sign({ sub }, process.env.JWT_ACCESS_SECRET!, { expiresIn: "15m" });

/** How long a test waits for requests to queue on a lock. Under the pool's 3 s `lock_timeout`. */
const QUEUE_WAIT_MS = 2_000;

export function sessionApi(suite: DbSuite) {
  const api = () => request(suite.app);
  const bearer = (accessToken: string) => ({ Authorization: `Bearer ${accessToken}` });

  const register = (email: string, password: string) =>
    api().post("/api/v1/auth/register").set(relayHeaders()).send({ email, password });
  const login = (email: string, password: string) =>
    api().post("/api/v1/auth/login").set(relayHeaders()).send({ email, password });
  const refresh = (refreshToken: string) =>
    api().post("/api/v1/auth/refresh").set(relayHeaders()).send({ refreshToken });
  const logout = (refreshToken: string) => api().post("/api/v1/auth/logout").set(relayHeaders()).send({ refreshToken });
  const logoutAll = (accessToken: string) => api().post("/api/v1/auth/logout-all").set(bearer(accessToken));

  async function signedUp(): Promise<Grant & { email: string; password: string }> {
    const email = freshEmail();
    const password = testPassword();
    const res = await register(email, password);
    if (res.status !== 201) throw new Error(`sign-up answered ${res.status}`);
    return { email, password, ...(res.body as Grant) };
  }

  /** The user's refresh rows: all of them, the live ones and the superseded ones. */
  async function rowsOf(userId: string): Promise<{ total: number; live: number; superseded: number }> {
    const { rows } = await suite.client.query(
      `SELECT count(*)::int AS total,
              count(*) FILTER (WHERE superseded_at IS NULL)::int AS live,
              count(*) FILTER (WHERE superseded_at IS NOT NULL)::int AS superseded
         FROM refresh_tokens WHERE user_id = $1`,
      [userId],
    );
    return rows[0] as { total: number; live: number; superseded: number };
  }

  /** How many of the user's refresh rows there are, in any state. */
  async function countOf(userId: string): Promise<number> {
    const { rows } = await suite.client.query("SELECT count(*)::int AS n FROM refresh_tokens WHERE user_id = $1", [
      userId,
    ]);
    return rows[0].n as number;
  }

  /** Whether a row exists for `token`. */
  async function stored(token: string): Promise<boolean> {
    const { rows } = await suite.client.query("SELECT 1 FROM refresh_tokens WHERE token_hash = $1", [hashOf(token)]);
    return rows.length > 0;
  }

  /**
   * Holds the user's row lock the way a session write holds it, on a
   * connection of its own, until `release` or `commit`. `query` runs inside
   * the holding transaction.
   */
  async function holdUserLock(userId: string) {
    const holder = new pg.Client({ connectionString: suite.url });
    await holder.connect();
    await holder.query("BEGIN");
    await holder.query("SELECT id FROM users WHERE id = $1 FOR NO KEY UPDATE", [userId]);
    const end = async (how: "ROLLBACK" | "COMMIT") => {
      await holder.query(how);
      await holder.end();
    };
    return {
      query: (text: string, values?: unknown[]) => holder.query(text, values),
      release: () => end("ROLLBACK"),
      commit: () => end("COMMIT"),
    };
  }

  /** The number of connections to this database with a lock they have asked for and not been granted. */
  async function waitingOnLocks(): Promise<number> {
    const { rows } = await suite.client.query(
      `SELECT count(DISTINCT l.pid)::int AS n
         FROM pg_locks l JOIN pg_stat_activity a ON a.pid = l.pid
        WHERE NOT l.granted AND a.datname = current_database()`,
    );
    return rows[0].n as number;
  }

  /** Polls pg_locks until `count` requests wait on a lock, or the wait is over. Answers how many waited. */
  async function queuedOnLock(count: number): Promise<number> {
    const deadline = Date.now() + QUEUE_WAIT_MS;
    let waiting = await waitingOnLocks();
    while (waiting < count && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 10));
      waiting = await waitingOnLocks();
    }
    return waiting;
  }

  /** The reset token the console mailer wrote, once the route's background work has sent it. */
  async function mailedResetToken(email: string): Promise<string> {
    const log = jest.spyOn(console, "log").mockImplementation(() => undefined);
    try {
      const asked = await api().post("/api/v1/auth/forgot-password").send({ email });
      if (asked.status !== 200) throw new Error(`forgot-password answered ${asked.status}`);
      const read = () =>
        /reset-password\?token=([0-9a-f]+)/.exec(log.mock.calls.map((c) => String(c[0])).join("\n"))?.[1];
      for (let i = 0; i < 200 && !read(); i++) await new Promise((resolve) => setTimeout(resolve, 10));
      const token = read();
      if (!token) throw new Error("no reset mail was written");
      return token;
    } finally {
      log.mockRestore();
    }
  }

  return {
    api,
    bearer,
    register,
    login,
    refresh,
    logout,
    logoutAll,
    signedUp,
    rowsOf,
    countOf,
    stored,
    holdUserLock,
    queuedOnLock,
    mailedResetToken,
  };
}

/** The reuse lines `console.warn` was called with. */
export function reuseLines(warn: { mock: { calls: unknown[][] } }): string[] {
  return warn.mock.calls.map((c) => c.map(String).join(" ")).filter((line) => line.includes("refresh token reuse"));
}
