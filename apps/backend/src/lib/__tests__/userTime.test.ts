import { describe, expect, it, jest } from "@jest/globals";
import { calendarDate, FALLBACK_TIME_ZONE, usableTimeZone } from "../userTime.js";

describe("calendarDate", () => {
  // Each pair straddles a local midnight next to a 2026 Helsinki daylight-saving switch.
  it.each([
    ["2026-03-28T21:59:59Z", "2026-03-28"],
    ["2026-03-28T22:00:00Z", "2026-03-29"],
    ["2026-03-29T20:59:59Z", "2026-03-29"],
    ["2026-03-29T21:00:00Z", "2026-03-30"],
    ["2026-10-24T20:59:59Z", "2026-10-24"],
    ["2026-10-24T21:00:00Z", "2026-10-25"],
    ["2026-10-25T21:59:59Z", "2026-10-25"],
    ["2026-10-25T22:00:00Z", "2026-10-26"],
  ])("puts %s on %s in Helsinki", (instant, date) => {
    expect(calendarDate(new Date(instant), "Europe/Helsinki")).toBe(date);
  });

  it.each([
    ["Pacific/Kiritimati", "2026-11-14T09:59:59Z", "2026-11-14"],
    ["Pacific/Kiritimati", "2026-11-14T10:00:00Z", "2026-11-15"],
    ["Pacific/Pago_Pago", "2026-11-15T10:59:59Z", "2026-11-14"],
    ["Pacific/Pago_Pago", "2026-11-15T11:00:00Z", "2026-11-15"],
  ])("puts an instant on the right side of the date line in %s", (zone, instant, date) => {
    expect(calendarDate(new Date(instant), zone)).toBe(date);
  });

  it("never depends on a locale's date pattern", () => {
    // Some ICU versions format en-CA as "11/15/2026". A date built from the parts cannot change with it.
    const proto = Intl.DateTimeFormat.prototype;
    const original = Object.getOwnPropertyDescriptor(proto, "format")!;
    Object.defineProperty(proto, "format", { configurable: true, get: () => () => "11/15/2026" });
    try {
      expect(new Intl.DateTimeFormat("en-CA").format(new Date())).toBe("11/15/2026");
      expect(calendarDate(new Date("2026-11-15T12:00:00Z"), "Europe/Helsinki")).toBe("2026-11-15");
    } finally {
      Object.defineProperty(proto, "format", original);
    }
  });

  it("gives a zone west of UTC an earlier date than UTC for the same instant", () => {
    const instant = new Date("2026-11-15T02:00:00Z");
    expect(calendarDate(instant, "UTC")).toBe("2026-11-15");
    expect(calendarDate(instant, "America/New_York")).toBe("2026-11-14");
  });
});

describe("usableTimeZone", () => {
  it("keeps a zone the runtime knows", () => {
    expect(usableTimeZone("America/New_York")).toBe("America/New_York");
  });

  it("falls back to Helsinki, with a log line, for a zone the runtime does not know", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(usableTimeZone("Mars/Olympus")).toBe(FALLBACK_TIME_ZONE);
    expect(FALLBACK_TIME_ZONE).toBe("Europe/Helsinki");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("Mars/Olympus"));
    warn.mockRestore();
  });
});
