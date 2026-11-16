import type { WriteOutcome } from "../services/writes/context.js";

/** The HTTP status of an add: 201 when this request wrote, 200 when it repeated one that had. */
export const statusOf = (outcome: WriteOutcome<unknown>["outcome"]): 200 | 201 => (outcome === "created" ? 201 : 200);
