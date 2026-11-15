import { afterAll, describe, expect, it, jest } from "@jest/globals";

// contextForUser is pure: the same row and instant give the same context on
// every path that builds one. Importing it builds the pool, which connects
// to nothing until a query runs, and is ended at the end.
const { contextForUser } = await import("../requestContext.js");
const { pool } = await import("../../db/index.js");

afterAll(async () => {
  await pool.end();
});

describe("contextForUser", () => {
  const id = "00000000-0000-4000-8000-000000000001";

  it("reads today in the user's zone at the given instant", () => {
    const now = new Date("2026-11-15T02:00:00Z");
    expect(contextForUser({ id, timeZone: "America/New_York" }, now)).toMatchObject({
      userId: id,
      now,
      timeZone: "America/New_York",
      today: "2026-11-14",
      actor: { userId: id },
    });
  });

  it("falls back to Helsinki for a stored zone the runtime does not know", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const ctx = contextForUser({ id, timeZone: "Mars/Olympus" }, new Date("2026-11-14T22:30:00Z"));
    warn.mockRestore();
    expect(ctx).toMatchObject({ timeZone: "Europe/Helsinki", today: "2026-11-15" });
  });
});
