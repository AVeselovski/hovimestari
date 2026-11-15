/** The part of a schema error this reads. */
interface SchemaError {
  issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }>;
}

/**
 * The first issue of each field of a failed schema check, as the field's
 * name and the issue's message. The shared schemas put an error code in the
 * message (`invalid_email`, `password_too_short`), which the page turns into
 * copy. Any other message is the schema library's own text and is never shown.
 */
export function firstIssues(error: SchemaError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? "");
    out[field] ??= issue.message;
  }
  return out;
}
