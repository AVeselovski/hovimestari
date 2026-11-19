import { describe, expect, it } from "@jest/globals";
import { addDays, WEEK_LENGTH, WEEK_START, weekOf } from "../index.js";

describe("addDays", () => {
  it("moves across a month and a year, both ways", () => {
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDays("2026-12-01", -1)).toBe("2026-11-30");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2027-01-01", -1)).toBe("2026-12-31");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-11-19", 0)).toBe("2026-11-19");
  });

  it("moves by whole days across both 2026 daylight-saving switches", () => {
    expect(addDays("2026-03-28", 1)).toBe("2026-03-29");
    expect(addDays("2026-03-29", 1)).toBe("2026-03-30");
    expect(addDays("2026-10-25", 1)).toBe("2026-10-26");
    expect(addDays("2026-10-26", -1)).toBe("2026-10-25");
  });

  it("refuses a string that is not a real date", () => {
    for (const bad of ["nope", "", "2026-02-29", "2026-13-01", "19.11.2026"]) {
      expect(() => addDays(bad, 1)).toThrow(RangeError);
    }
  });
});

describe("weekOf", () => {
  it("is Monday to Sunday, seven days", () => {
    expect(WEEK_START).toBe(1);
    expect(WEEK_LENGTH).toBe(7);
  });

  it("holds every weekday of a week in that Monday-to-Sunday week", () => {
    const week = { from: "2026-11-16", to: "2026-11-22" };
    for (const date of ["16", "17", "18", "19", "20", "21", "22"]) {
      expect(weekOf(`2026-11-${date}`)).toEqual(week);
    }
    expect(weekOf("2026-11-23")).toEqual({ from: "2026-11-23", to: "2026-11-29" });
    expect(weekOf("2026-11-15")).toEqual({ from: "2026-11-09", to: "2026-11-15" });
  });

  it("runs across a month end", () => {
    expect(weekOf("2026-11-30")).toEqual({ from: "2026-11-30", to: "2026-12-06" });
    expect(weekOf("2026-12-02")).toEqual({ from: "2026-11-30", to: "2026-12-06" });
    expect(weekOf("2026-03-01")).toEqual({ from: "2026-02-23", to: "2026-03-01" });
  });

  it("keeps whole weeks across both 2026 daylight-saving switches", () => {
    // Europe moves its clocks on Sunday 29 March and Sunday 25 October 2026.
    for (const date of ["2026-03-23", "2026-03-29"])
      expect(weekOf(date)).toEqual({ from: "2026-03-23", to: "2026-03-29" });
    expect(weekOf("2026-03-30")).toEqual({ from: "2026-03-30", to: "2026-04-05" });
    for (const date of ["2026-10-19", "2026-10-25"])
      expect(weekOf(date)).toEqual({ from: "2026-10-19", to: "2026-10-25" });
    expect(weekOf("2026-10-26")).toEqual({ from: "2026-10-26", to: "2026-11-01" });
  });

  it("runs across the new year", () => {
    expect(weekOf("2026-12-31")).toEqual({ from: "2026-12-28", to: "2027-01-03" });
    expect(weekOf("2027-01-03")).toEqual({ from: "2026-12-28", to: "2027-01-03" });
  });

  it("refuses a string that is not a real date", () => {
    expect(() => weekOf("nope")).toThrow(RangeError);
    expect(() => weekOf("2026-02-30")).toThrow(RangeError);
  });
});
