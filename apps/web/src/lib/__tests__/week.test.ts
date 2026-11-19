import { stepWeek, WEEK_START, weekDates, weekOf } from "../week";

describe("the week", () => {
  // weekOf and WEEK_START are tested where they live, packages/types/src/__tests__/dates.test.ts.
  it("re-exports the shared Monday-to-Sunday week", () => {
    expect(WEEK_START).toBe(1);
    expect(weekOf("2026-11-18")).toEqual({ from: "2026-11-16", to: "2026-11-22" });
  });

  it("steps whole weeks both ways and lists the seven dates in order", () => {
    expect(stepWeek("2026-11-16", 1)).toBe("2026-11-23");
    expect(stepWeek("2026-11-16", -1)).toBe("2026-11-09");
    expect(weekDates("2026-12-28")).toEqual([
      "2026-12-28",
      "2026-12-29",
      "2026-12-30",
      "2026-12-31",
      "2027-01-01",
      "2027-01-02",
      "2027-01-03",
    ]);
  });
});
