import { setTestLocale } from "@/__tests__/helpers/locale";
import {
  addDays,
  dayBefore,
  dayLabel,
  formatDay,
  formatDayShort,
  formatWeekRange,
  formatWeekRowDate,
  isIsoDate,
} from "../localDate";

describe("localDate", () => {
  it("knows a real date from a malformed or impossible one", () => {
    expect(isIsoDate("2026-11-16")).toBe(true);
    expect(isIsoDate("2028-02-29")).toBe(true);
    expect(isIsoDate("2026-02-29")).toBe(false);
    expect(isIsoDate("2026-13-01")).toBe(false);
    expect(isIsoDate("")).toBe(false);
    expect(isIsoDate("16.11.2026")).toBe(false);
  });

  it("re-exports the shared addDays, which packages/types tests", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("steps back a day across a month, a year and a daylight-saving switch", () => {
    expect(dayBefore("2026-12-01")).toBe("2026-11-30");
    expect(dayBefore("2027-01-01")).toBe("2026-12-31");
    expect(dayBefore("2026-10-26")).toBe("2026-10-25");
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

  describe("formatWeekRange", () => {
    const TO = " to ";
    const DASHES = /[\u2010-\u2015\u2212]/u;
    const cases = [
      ["one month", "2026-11-16", "2026-11-22", "16 to 22 Nov", "Nov 16 to 22"],
      ["two months", "2026-11-30", "2026-12-06", "30 Nov to 6 Dec", "Nov 30 to Dec 6"],
      ["two years", "2026-12-28", "2027-01-03", "28 Dec 2026 to 3 Jan 2027", "Dec 28, 2026 to Jan 3, 2027"],
    ] as const;

    it.each(cases)(
      "names a week across %s in the locale's own order, with the catalog's word and no dash",
      (_n, from, to, gb, us) => {
        expect(formatWeekRange(from, to, "2026-11-18", TO, "en-GB")).toBe(gb);
        expect(formatWeekRange(from, to, "2026-11-18", TO, "en-US")).toBe(us);
        expect(formatWeekRange(from, to, "2026-11-18", TO, "en-GB")).not.toMatch(DASHES);
        expect(formatWeekRange(from, to, "2026-11-18", TO, "en-US")).not.toMatch(DASHES);
      },
    );

    it("leaves the year out of a week in today's year and shows it once on a week wholly in another year", () => {
      expect(formatWeekRange("2026-11-16", "2026-11-22", "2026-11-18", TO, "en-GB")).not.toMatch(/2026/);
      expect(formatWeekRange("2027-01-04", "2027-01-10", "2026-11-18", TO, "en-GB")).toBe("4 to 10 Jan 2027");
    });

    it("replaces only a tilde between the ends, so the marks around it stay", () => {
      expect(formatWeekRange("2026-11-16", "2026-11-22", "2026-11-18", TO, "ko-KR")).toBe("11월 16일 to 22일");
      expect(formatWeekRange("2026-11-16", "2026-11-22", "2026-11-18", TO, "ja-JP")).toBe("11/16 to 11/22");
    });

    it("keeps the locale's own word between the ends when it puts no dash or tilde there", () => {
      const persian = formatWeekRange("2026-11-16", "2026-11-22", "2026-11-18", TO, "fa-IR");
      expect(persian).toContain(" تا ");
      expect(persian).not.toContain(TO);
    });

    it("formats in the device's language when no locale is named", () => {
      setTestLocale("en-GB");
      expect(formatWeekRange("2026-11-30", "2026-12-06", "2026-11-18", TO)).toBe("30 Nov to 6 Dec");
    });

    it("keeps a locale's own marks around its dash", () => {
      expect(formatWeekRange("2026-11-16", "2026-11-22", "2026-11-18", TO, "fi-FI")).toBe("16. to 22.11.");
    });
  });

  it("names a week row's date short for the eye and whole for a screen reader", () => {
    expect(formatWeekRowDate("2026-11-16", "en-GB")).toEqual({
      weekday: "Mon",
      day: "16",
      spoken: "Monday 16 November",
    });
    expect(formatWeekRowDate("2026-11-16", "en-US").spoken).toBe("Monday, November 16");
  });
});
