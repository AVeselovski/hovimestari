import { describe, expect, it } from "@jest/globals";
import { failureOf } from "../failureOf.js";

// Shaped as node-postgres throws it: the refused row's values sit in `detail`.
const refused = () =>
  Object.assign(new Error('new row for relation "vault_drive_connections" violates check constraint "x_check"'), {
    code: "23514",
    constraint: "x_check",
    detail: "Failing row contains (ciphertext-secret, google-subject).",
  });

describe("failureOf", () => {
  it("names the stack, the code and the constraint", () => {
    const line = failureOf(refused());
    expect(line).toContain("violates check constraint");
    expect(line).toContain("code=23514 constraint=x_check");
  });

  it("never carries detail", () => {
    const line = failureOf(refused());
    expect(line).not.toContain("ciphertext-secret");
    expect(line).not.toContain("Failing row");
  });

  it("reads the code and constraint from a wrapping error's cause", () => {
    const wrapped = new Error("Failed query", { cause: refused() });
    expect(failureOf(wrapped)).toContain("code=23514 constraint=x_check");
    expect(failureOf(wrapped)).not.toContain("ciphertext-secret");
  });

  it("logs a query wrapper's cause, never the wrapper's message with the query's params", () => {
    // Shaped as drizzle-orm 0.44 and later throw DrizzleQueryError: the SQL
    // and its params in the message and the stack, the driver error as cause.
    class FakeQueryError extends Error {
      constructor(
        public query: string,
        public params: unknown[],
        cause: Error,
      ) {
        super(`Failed query: ${query}\nparams: ${params.join(",")}`, { cause });
      }
    }
    const wrapped = new FakeQueryError(
      "insert into vault_drive_connections values ($1, $2)",
      ["param-secret", "google-subject"],
      refused(),
    );
    const line = failureOf(wrapped);
    expect(line).not.toContain("param-secret");
    expect(line).not.toContain("ciphertext-secret");
    expect(line).toContain("violates check constraint");
    expect(line).toContain("code=23514 constraint=x_check");
  });

  it("says what was thrown when it is not an Error, without printing it", () => {
    expect(failureOf({ detail: "secret" })).toBe("a thrown value that is not an Error");
  });
});
