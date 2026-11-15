import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { env } from "../lib/env.js";
import { failureOf } from "../lib/failureOf.js";
import * as schema from "./schema/index.js";

// Sized for one shared-CPU Postgres: a few busy connections do more work than
// many contending ones, and the excess waits cheaply in the pool's queue.
// The timeouts bound every request: a queued request fails after 5s, a query
// is cancelled on the server after 8s, and a stuck transaction or lock wait
// cannot pin a connection.
export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  max: env.DB_POOL_MAX,
  // Keep warm connections through pauses between clicks, so the next burst
  // does not reconnect (TCP, SCRAM, a backend fork) all at once.
  min: 2,
  idleTimeoutMillis: 300_000,
  connectionTimeoutMillis: 5_000,
  // pg sends the four session settings below as connection startup
  // parameters. That is fine through Fly Postgres today. PgBouncer (and so
  // Fly Managed Postgres) refuses unknown startup parameters, so before any
  // move behind it these must become `ALTER ROLE ... SET` on the database
  // and be removed from here. docs/setup/fly-backend.md says so too.
  statement_timeout: 8_000,
  query_timeout: 9_000,
  lock_timeout: 3_000,
  idle_in_transaction_session_timeout: 10_000,
  application_name: "hovimestari-backend",
  // TCP keepalive so idle sockets silently dropped by intermediary proxies on
  // the internal network are detected instead of lingering as dead clients.
  keepAlive: true,
});

// An idle pooled client whose connection is terminated emits "error" on the
// pool; without a listener Node treats it as an unhandled error event and
// kills the process. Log and continue: the pool discards the broken client
// and creates fresh ones on demand.
pool.on("error", (err) => {
  console.error("[db] idle client error:", failureOf(err));
});

// pg-pool only listens for errors on idle clients. A checked-out client (one
// held by `db.transaction()` between statements) that loses its connection
// emits "error" with nobody listening, and Node exits. This listener stays
// for the client's whole life, so the dropped connection instead rejects the
// transaction's next query and the request fails with a 500.
pool.on("connect", (client) => {
  client.on("error", (err) => {
    const code = (err as { code?: string }).code;
    console.error("[db] client error:", code ?? "", err.message);
  });
});

/** Pool occupancy for the periodic stats log. `waiting > 0` for long
 *  stretches means requests are queueing for a connection. */
export function poolStats(): { total: number; idle: number; waiting: number } {
  return { total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount };
}

export const db = drizzle(pool, { schema });
