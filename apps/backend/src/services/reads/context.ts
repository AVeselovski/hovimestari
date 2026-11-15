import type { Db } from "../../db/types.js";

export type { Db };

/**
 * What every read service needs to answer for one user. The caller has
 * already authenticated `userId`: a route through `authenticate`, the MCP
 * server through its key. Services never import Express.
 */
export interface ReadContext {
  userId: string;
  db: Db;
  /** The one clock. Routes pass `new Date()`, tests pass a fixed instant. */
  now: Date;
  /** The user's IANA time zone, already checked to be one the runtime knows. */
  timeZone: string;
  /** The user's calendar date at `now` in `timeZone`, `YYYY-MM-DD`. */
  today: string;
}
