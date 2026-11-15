import type { ReadContext } from "../reads/context.js";

/**
 * What every write service needs: the user, the database and the clock of a
 * read, plus who is writing. The MCP step adds the connection behind a write
 * as `actor.via`.
 */
export interface WriteContext extends ReadContext {
  actor: { userId: string };
}

/** What a write service hands back. A route sends `value`, the MCP tools also report `outcome`. */
export interface WriteOutcome<T> {
  value: T;
  outcome: "created" | "changed" | "unchanged" | "deleted";
}
