import { describe, expect, it } from "@jest/globals";
import { DayDate, DayRange } from "../inputs.js";

// The inputs parse what the REST routes parse.

describe("DayDate", () => {
  it.each(["today", "2026-11-19"])("takes %s", (value) => {
    expect(DayDate.parse(value)).toBe(value);
  });

  it.each(["yesterday", "2026-02-30", "19.11.2026", ""])("refuses %j", (value) => {
    expect(DayDate.safeParse(value).success).toBe(false);
  });

  it("tells the model what to send", () => {
    expect(DayDate.description).toContain("YYYY-MM-DD, or today");
  });
});

describe("DayRange", () => {
  it("takes a run of up to 42 days", () => {
    expect(DayRange.parse({ from: "2026-11-01", to: "2026-12-12" })).toEqual({ from: "2026-11-01", to: "2026-12-12" });
  });

  it.each([
    [{ from: "2026-11-01", to: "2026-12-13" }, "43 days"],
    [{ from: "2026-11-02", to: "2026-11-01" }, "to before from"],
    [{ from: "2026-11-01" }, "no to"],
  ])("refuses %j (%s)", (value, _why) => {
    expect(DayRange.safeParse(value).success).toBe(false);
  });
});
