import type { RequestHandler } from "express";

const UUID = /\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?=\/|$)/gi;
const PERIOD = /\/\d{4}-\d{2}(-\d{2})?(?=\/|$)/g;
const QUIET_PATHS = new Set(["/livez", "/health"]);

/** The request path with its ids and periods replaced by placeholders, so
 *  every request to one route logs the same key and no ids reach the log. */
export function routeKey(originalUrl: string): string {
  const path = originalUrl.split("?")[0];
  return path.replace(UUID, "/:id").replace(PERIOD, "/:period");
}

/**
 * One line per request: method, route, status, duration and Fly's request id.
 * A request whose client left before the response was sent logs `aborted`
 * in place of a status. The health checks are skipped, they would drown the
 * log.
 */
export function requestLog(log: (line: string) => void = console.log): RequestHandler {
  return (req, res, next) => {
    if (QUIET_PATHS.has(req.path)) return next();
    const start = process.hrtime.bigint();
    res.once("close", () => {
      const ms = Number(process.hrtime.bigint() - start) / 1e6;
      const status = res.writableFinished ? String(res.statusCode) : "aborted";
      const flyId = req.get("fly-request-id");
      log(
        `[req] ${req.method} ${routeKey(req.originalUrl)} ${status} ${ms.toFixed(0)}ms${flyId ? ` fly=${flyId}` : ""}`,
      );
    });
    next();
  };
}
