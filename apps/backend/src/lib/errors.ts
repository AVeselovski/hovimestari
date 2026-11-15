/**
 * AppError represents a known, intentional error whose message is safe to
 * send to the client. Throw this for validation errors, auth failures, 404s,
 * etc. — anything where the message is written by us, not derived from an
 * external system (DB, filesystem, third-party API).
 *
 * All other errors are treated as unexpected and return a generic 500 message.
 */
export class AppError extends Error {
  constructor(
    public override readonly message: string,
    public readonly status: number = 400,
    /**
     * Optional `{ cause }` — attach the underlying error when an AppError is
     * translating something lower-level (a driver error, a failed write). The
     * error middleware only returns `message` to the client, so the cause is
     * for logs and debuggers, never the response body.
     */
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "AppError";
  }
}
