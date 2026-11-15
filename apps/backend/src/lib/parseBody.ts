import { isErrorCode } from "@hovimestari/types";
import type { z } from "zod";
import { appError } from "./errors.js";

/**
 * A request body parsed with `schema`. On failure it throws a 400 for the
 * first issue: its code when the schema names one, otherwise
 * `invalid_request`. The raw Zod text never reaches the client.
 */
export function parseBody<T extends z.ZodType>(schema: T, body: unknown): z.infer<T> {
  const result = schema.safeParse(body);
  if (result.success) return result.data;
  const message = result.error.issues[0]?.message;
  throw appError(isErrorCode(message) ? message : "invalid_request", 400);
}

/**
 * A request's query string parsed with `schema`, on the same terms as
 * `parseBody`: a 400 with the first issue's code, or `invalid_request`.
 */
export function parseQuery<T extends z.ZodType>(schema: T, query: unknown): z.infer<T> {
  return parseBody(schema, query);
}
