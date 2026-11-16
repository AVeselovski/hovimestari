import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type * as schema from "./schema/index.js";

/**
 * The database, or a transaction on it. A module of its own, so the layers
 * that take a handle can name its type without importing the pool.
 */
export type Db = NodePgDatabase<typeof schema>;

/** A transaction on the database. Code that must hold a lock until it commits takes this, never `Db`. */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
