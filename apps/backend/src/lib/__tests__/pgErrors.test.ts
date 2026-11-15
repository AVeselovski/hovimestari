import { describe, expect, it } from "@jest/globals";
import { isUniqueViolation } from "../pgErrors.js";

// node-postgres raises the error itself; drizzle wraps it and keeps it as
// `cause`. Both shapes name the constraint the insert broke.

const INDEX = "transaction_files_request_key";

describe("isUniqueViolation", () => {
  it("is true for a unique violation on the named constraint, raw or wrapped", () => {
    const raw = { code: "23505", constraint: INDEX };
    expect(isUniqueViolation(raw, INDEX)).toBe(true);
    expect(isUniqueViolation(Object.assign(new Error("Failed query"), { cause: raw }), INDEX)).toBe(true);
  });

  it("is false for another constraint, another error code, or no database error at all", () => {
    expect(isUniqueViolation({ code: "23505", constraint: "some_other_key" }, INDEX)).toBe(false);
    expect(isUniqueViolation({ code: "23503", constraint: INDEX }, INDEX)).toBe(false);
    expect(isUniqueViolation(new Error("connection terminated"), INDEX)).toBe(false);
    expect(isUniqueViolation(undefined, INDEX)).toBe(false);
    expect(isUniqueViolation(null, INDEX)).toBe(false);
  });
});
