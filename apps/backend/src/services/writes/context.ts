import type { ReadContext } from "../reads/context.js";

/**
 * What every write service needs: the user, the database and the clock of a
 * read, plus who is writing. The MCP step adds the connection behind a write
 * as `actor.via`.
 */
export interface WriteContext extends ReadContext {
  actor: { userId: string };
}

/**
 * What a write service hands back. A route sends `value`, the MCP tools also
 * report `outcome`. `replayed` is an add whose client-chosen id was already
 * added: nothing was written, and `value` is the first answer.
 */
export interface WriteOutcome<T> {
  value: T;
  outcome: "created" | "changed" | "unchanged" | "deleted" | "replayed";
}
