// Postgres errors as the services meet them. node-postgres raises the error
// itself, and drizzle wraps it and keeps it as `cause`, so both are read.

interface PgErrorFields {
  code?: string;
  constraint?: string;
}

function pgFields(err: unknown): PgErrorFields | undefined {
  const outer = err as (PgErrorFields & { cause?: PgErrorFields }) | null | undefined;
  return outer?.code ? outer : outer?.cause;
}

/** True when `err` is a unique violation (23505) on `constraint`. Anything else, a non-error included, is false. */
export function isUniqueViolation(err: unknown, constraint: string): boolean {
  const source = pgFields(err);
  return source?.code === "23505" && source.constraint === constraint;
}

/** True when `err` is a check violation (23514) on `constraint`. Anything else, a non-error included, is false. */
export function isCheckViolation(err: unknown, constraint: string): boolean {
  const source = pgFields(err);
  return source?.code === "23514" && source.constraint === constraint;
}
