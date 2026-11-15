import { failureOf } from "./failureOf.js";

/**
 * The last-resort handlers for a failure nothing caught: a promise rejected
 * with no handler (a fire-and-forget call) and an exception thrown outside any
 * request (an `error` event with no listener). Each is logged through
 * `failureOf`, so a database error's row values never reach the log, and the
 * process then exits 1 as Node would have, so Fly restarts it clean.
 */
export function installLastResortHandlers(proc: NodeJS.Process = process): void {
  for (const event of ["unhandledRejection", "uncaughtException"] as const) {
    proc.on(event, (reason: unknown) => {
      console.error(`[fatal] ${event}:`, failureOf(reason));
      proc.exit(1);
    });
  }
}
