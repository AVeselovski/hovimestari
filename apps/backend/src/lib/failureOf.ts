interface PgFields {
  code?: unknown;
  constraint?: unknown;
}

/**
 * What an unexpected failure logs: its stack, and a database error's code and
 * constraint. Never the error object itself: Postgres puts the values of the
 * row it refused in `detail` ("Failing row contains (...)"), and a unique
 * violation's key there too. Those are the request's own values, and on some
 * tables a secret. The code and constraint are read from the error or, where
 * a driver wraps it, from its `cause`.
 *
 * A failed query wrapped the way drizzle-orm 0.44 and later wrap it
 * (`DrizzleQueryError`: the SQL and its params in the message, the driver
 * error as `cause`) logs the cause's stack in place of the wrapper's, since
 * the params are row values too. drizzle 0.40 does not export the class, so
 * the shape is matched: a `query`, `params` and an Error `cause`.
 *
 * The answer is one string: the stack (or "<name>: <message>" without one),
 * then " code=<code>" and " constraint=<constraint>" when the error has them,
 * so a unique violation ends "... code=23505 constraint=payees_vault_id_name_unique".
 * A thrown value that is not an Error is named, never printed. Pass the answer
 * as its own `console.error` argument, or as a `failure` field beside the ids
 * that locate the failure.
 */
export function failureOf(err: unknown): string {
  if (!(err instanceof Error)) return "a thrown value that is not an Error";
  if (isQueryWrapper(err)) return failureOf(err.cause);
  const own = err as PgFields;
  const fields = typeof own.code === "string" ? own : ((err.cause ?? {}) as PgFields);
  return [
    err.stack ?? `${err.name}: ${err.message}`,
    typeof fields.code === "string" ? `code=${fields.code}` : "",
    typeof fields.constraint === "string" ? `constraint=${fields.constraint}` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function isQueryWrapper(err: Error): err is Error & { cause: Error } {
  const shape = err as Error & { query?: unknown; params?: unknown };
  return typeof shape.query === "string" && Array.isArray(shape.params) && err.cause instanceof Error;
}
