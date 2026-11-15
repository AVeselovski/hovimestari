import type { Server } from "node:http";
import { failureOf } from "./failureOf.js";

/** How long requests in flight get to finish before the process exits anyway. */
export const SHUTDOWN_TIMEOUT_MS = 10_000;

/**
 * Stops cleanly on SIGTERM or SIGINT: the server stops taking connections and
 * lets requests in flight finish, then the database pool ends, then the
 * process exits 0. Past `timeoutMs` it exits 1 whatever is still open. A
 * deploy sends SIGTERM, so a rolling deploy drops no request.
 *
 * It does not wait for background work a route starts after it has answered,
 * such as sending a password reset mail. Such work cut off by a deploy costs
 * the user one retry.
 */
export function installGracefulShutdown(
  server: Server,
  endPool: () => Promise<void>,
  { proc = process, timeoutMs = SHUTDOWN_TIMEOUT_MS }: { proc?: NodeJS.Process; timeoutMs?: number } = {},
): () => Promise<void> {
  let stopping: Promise<void> | undefined;
  const stop = () =>
    (stopping ??= (async () => {
      const deadline = setTimeout(() => {
        console.error(`[shutdown] still open after ${timeoutMs} ms, exiting`);
        proc.exit(1);
      }, timeoutMs);
      deadline.unref();
      try {
        const closed = new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
        // Idle keep-alive sockets would otherwise hold close() open until they time out.
        server.closeIdleConnections();
        await closed;
        await endPool();
        clearTimeout(deadline);
        proc.exit(0);
      } catch (err) {
        console.error("[shutdown] failed:", failureOf(err));
        proc.exit(1);
      }
    })());
  for (const signal of ["SIGTERM", "SIGINT"] as const) proc.once(signal, () => void stop());
  return stop;
}
