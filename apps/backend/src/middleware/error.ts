import type { ErrorRequestHandler } from "express";
import { AppError } from "../lib/errors.js";
import { failureOf } from "../lib/failureOf.js";
import { ReadAbandoned } from "../lib/requestAborted.js";

/** Postgres and pool conditions that mean "busy right now", not "broken":
 *  a cancelled statement (statement_timeout), a lock wait that gave up
 *  (lock_timeout) and a connection that did not come free in time. The web
 *  app can retry these or show a busy state. */
const BUSY_PG_CODES = new Set(["57014", "55P03"]);
// The pool and client timeouts carry no code, only these messages, as pg 8.x
// and pg-pool 3.x word them. The error middleware test pins both strings, so
// a pg upgrade that rewords them fails there rather than in production.
const BUSY_MESSAGES = ["timeout exceeded when trying to connect", "Query read timeout"];

function isBusyError(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const { code, message } = err as { code?: string; message?: string };
  if (code && BUSY_PG_CODES.has(code)) return true;
  return typeof message === "string" && BUSY_MESSAGES.some((m) => message.includes(m));
}

/** A body-parser failure: a 4xx it marks safe to expose, with a `type` such
 *  as "entity.parse.failed". It carries the raw body, so it is never logged. */
function bodyParserStatus(err: unknown): number | null {
  if (typeof err !== "object" || err === null) return null;
  const { type, status, expose } = err as { type?: unknown; status?: unknown; expose?: unknown };
  if (typeof type !== "string" || expose !== true || typeof status !== "number") return null;
  return status >= 400 && status < 500 ? status : null;
}

const BODY_MESSAGES: Record<string, string> = {
  "entity.parse.failed": "The request body is not valid JSON.",
  "entity.too.large": "The request body is too large.",
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  // The client is gone, so there is nothing to answer and nothing to log.
  if (err instanceof ReadAbandoned) {
    if (!res.writableEnded) res.end();
    return;
  }

  if (err instanceof AppError) {
    res.status(err.status).json(err.code ? { message: err.message, code: err.code } : { message: err.message });
    return;
  }

  const bodyStatus = bodyParserStatus(err);
  if (bodyStatus !== null) {
    const type = (err as { type: string }).type;
    res
      .status(bodyStatus)
      .json({ message: BODY_MESSAGES[type] ?? "The request body could not be read.", code: "invalid_request" });
    return;
  }

  if (isBusyError(err)) {
    console.error("[busy]", (err as { code?: string }).code ?? "", (err as Error).message);
    res.set("Retry-After", "2");
    res.status(503).json({ message: "The server is busy. Please try again." });
    return;
  }

  // Unexpected: logged as its stack, code and constraint only, never the
  // object, whose `detail` can hold a refused row's values. The client learns nothing.
  console.error(failureOf(err));
  res.status(500).json({ message: "Internal server error" });
};
