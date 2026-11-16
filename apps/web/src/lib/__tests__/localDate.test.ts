import { addDays, dayBefore, dayLabel, formatDay, formatDayShort, isIsoDate } from "../localDate";

describe("localDate", () => {
  it("knows a real date from a malformed or impossible one", () => {
    expect(isIsoDate("2026-11-16")).toBe(true);
    expect(isIsoDate("2028-02-29")).toBe(true);
    expect(isIsoDate("2026-02-29")).toBe(false);
    expect(isIsoDate("2026-13-01")).toBe(false);
    expect(isIsoDate("")).toBe(false);
    expect(isIsoDate("16.11.2026")).toBe(false);
  });

  it("moves across months, years and both 2026 daylight-saving switches by whole days", () => {
    expect(dayBefore("2026-12-01")).toBe("2026-11-30");
    expect(dayBefore("2027-01-01")).toBe("2026-12-31");
    expect(addDays("2026-03-28", 1)).toBe("2026-03-29");
    expect(addDays("2026-03-29", 1)).toBe("2026-03-30");
    expect(addDays("2026-10-25", 1)).toBe("2026-10-26");
    expect(dayBefore("2026-10-26")).toBe("2026-10-25");
    expect(() => addDays("nope", 1)).toThrow(RangeError);
  });

  it("formats a date in the given language, on the calendar day it names whatever the device's zone", () => {
    expect(formatDay("2026-11-16", "en-GB")).toBe("16 November 2026");
    expect(formatDay("2026-11-16", "en-US")).toBe("November 16, 2026");
    expect(formatDay("2026-01-01", "fi-FI")).toBe("1. tammikuuta 2026");
  });
});

describe("today and its neighbours", () => {
  it("names a date's relation to today in a word, or null further away", () => {
    expect(dayLabel("2026-11-16", "2026-11-16")).toBe("today");
    expect(dayLabel("2026-11-15", "2026-11-16")).toBe("yesterday");
    expect(dayLabel("2026-11-17", "2026-11-16")).toBe("tomorrow");
    expect(dayLabel("2027-01-01", "2026-12-31")).toBe("tomorrow");
    expect(dayLabel("2026-11-18", "2026-11-16")).toBeNull();
  });

  it("formats a date short in the given language, with the year only when it is not today's", () => {
    expect(formatDayShort("2026-11-17", "en-GB", "2026-11-16")).toBe("Tue 17 Nov");
    expect(formatDayShort("2025-11-17", "en-GB", "2026-11-16")).toBe("Mon 17 Nov 2025");
  });
});
