// Postgres errors as the services meet them. node-postgres raises the error
// itself, and drizzle wraps it and keeps it as `cause`, so both are read.

interface PgErrorFields {
  code?: string;
  constraint?: string;
}

/** True when `err` is a unique violation (23505) on `constraint`. Anything else, a non-error included, is false. */
export function isUniqueViolation(err: unknown, constraint: string): boolean {
  const outer = err as (PgErrorFields & { cause?: PgErrorFields }) | null | undefined;
  const source = outer?.code ? outer : outer?.cause;
  return source?.code === "23505" && source.constraint === constraint;
}
