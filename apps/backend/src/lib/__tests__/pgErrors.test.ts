import { describe, expect, it } from "@jest/globals";
import { isCheckViolation, isForeignKeyViolation, isUniqueViolation, pgCodeOf } from "../pgErrors.js";

// node-postgres raises the error itself; drizzle wraps it and keeps it as
// `cause`. Both shapes name the constraint the insert broke.

const INDEX = "users_email_unique";

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

describe("isCheckViolation", () => {
  const CHECK = "users_has_sign_in_method";

  it("is true for a check violation on the named constraint, raw or wrapped", () => {
    const raw = { code: "23514", constraint: CHECK };
    expect(isCheckViolation(raw, CHECK)).toBe(true);
    expect(isCheckViolation(Object.assign(new Error("Failed query"), { cause: raw }), CHECK)).toBe(true);
  });

  it("is false for another constraint, a unique violation, or no database error", () => {
    expect(isCheckViolation({ code: "23514", constraint: "users_email_lower" }, CHECK)).toBe(false);
    expect(isCheckViolation({ code: "23505", constraint: CHECK }, CHECK)).toBe(false);
    expect(isCheckViolation(undefined, CHECK)).toBe(false);
  });
});

describe("isForeignKeyViolation", () => {
  const KEY = "entries_food_id_foods_id_fk";

  it("is true for a foreign-key violation on the named constraint, raw or wrapped", () => {
    const raw = { code: "23503", constraint: KEY };
    expect(isForeignKeyViolation(raw, KEY)).toBe(true);
    expect(isForeignKeyViolation(Object.assign(new Error("Failed query"), { cause: raw }), KEY)).toBe(true);
  });

  it("is false for another constraint, a unique violation, or no database error", () => {
    expect(isForeignKeyViolation({ code: "23503", constraint: "entries_saved_meal_user_fk" }, KEY)).toBe(false);
    expect(isForeignKeyViolation({ code: "23505", constraint: KEY }, KEY)).toBe(false);
    expect(isForeignKeyViolation(undefined, KEY)).toBe(false);
  });
});

describe("pgCodeOf", () => {
  it("answers the SQLSTATE of a Postgres error, raw or wrapped, and undefined for anything else", () => {
    expect(pgCodeOf({ code: "23502" })).toBe("23502");
    expect(pgCodeOf(Object.assign(new Error("Failed query"), { cause: { code: "22P02" } }))).toBe("22P02");
    expect(pgCodeOf(new Error("connection terminated"))).toBeUndefined();
    expect(pgCodeOf(undefined)).toBeUndefined();
  });
});
