import { stepWeek, WEEK_START, weekDates, weekOf } from "../week";

describe("the week", () => {
  it("starts on Monday", () => {
    expect(WEEK_START).toBe(1);
    expect(new Date(`${weekOf("2026-11-18").from}T00:00:00Z`).getUTCDay()).toBe(1);
  });

  it("holds a Wednesday in the Monday to Sunday around it", () => {
    expect(weekOf("2026-11-18")).toEqual({ from: "2026-11-16", to: "2026-11-22" });
  });

  it("keeps a Monday and a Sunday in their own weeks", () => {
    expect(weekOf("2026-11-16")).toEqual({ from: "2026-11-16", to: "2026-11-22" });
    expect(weekOf("2026-11-22")).toEqual({ from: "2026-11-16", to: "2026-11-22" });
    expect(weekOf("2026-11-23")).toEqual({ from: "2026-11-23", to: "2026-11-29" });
  });

  it("runs across the new year", () => {
    expect(weekOf("2026-12-31")).toEqual({ from: "2026-12-28", to: "2027-01-03" });
    expect(weekOf("2027-01-03")).toEqual({ from: "2026-12-28", to: "2027-01-03" });
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

  it("refuses a string that is not a date", () => {
    expect(() => weekOf("nope")).toThrow(RangeError);
  });
});
