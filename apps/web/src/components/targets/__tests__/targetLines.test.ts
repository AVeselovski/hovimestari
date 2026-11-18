import type { TargetChange } from "@hovimestari/types";
import { inForceOn, removalOf, spanOf } from "../targetLines";

const change = (effectiveFrom: string): TargetChange => ({
  effectiveFrom,
  ranges: { energyKcal: { lower: 1800, upper: 2200 }, proteinG: { lower: 120, upper: 160 } },
  updatedAt: "2026-11-01T08:00:00.000Z",
});
const today = "2026-11-16";

describe("spanOf", () => {
  it("names the days from the date to the day before the next change", () => {
    const changes = [change("2026-10-01"), change("2026-11-01"), change("2026-12-01")];
    expect(spanOf(changes, "2026-11-01")).toEqual({ kind: "between", date: "2026-11-01", end: "2026-11-30" });
    expect(spanOf(changes, "2026-11-10")).toEqual({ kind: "between", date: "2026-11-10", end: "2026-11-30" });
  });

  it("names the one day when the next change starts the day after", () => {
    const changes = [change("2026-11-01"), change("2026-11-16")];
    expect(spanOf(changes, "2026-11-15")).toEqual({ kind: "day", date: "2026-11-15" });
    // An edit of a change that covers one day.
    expect(spanOf([...changes, change("2026-11-15")], "2026-11-15")).toEqual({ kind: "day", date: "2026-11-15" });
  });

  it("names every day from the date on when no change follows", () => {
    expect(spanOf([change("2026-11-01")], today)).toEqual({ kind: "from", date: today });
  });

  it("covers every earlier day when the change is the first", () => {
    expect(spanOf([change("2026-11-01"), change("2026-12-01")], "2026-11-01")).toEqual({
      kind: "before",
      next: "2026-12-01",
    });
    expect(spanOf([change("2026-11-01")], "2026-11-01")).toEqual({ kind: "all" });
    // A new date before every change becomes the first, and takes the days before it too.
    expect(spanOf([change("2026-12-01")], "2026-11-20")).toEqual({ kind: "before", next: "2026-12-01" });
  });

  it("names the days for a later date with no change on it too, after the first change", () => {
    expect(spanOf([change("2026-11-01")], "2026-11-17")).toEqual({ kind: "from", date: "2026-11-17" });
    expect(spanOf([change("2026-11-01"), change("2026-12-15")], "2026-12-01")).toEqual({
      kind: "between",
      date: "2026-12-01",
      end: "2026-12-14",
    });
  });

  it("speaks for an edit of a later change too", () => {
    expect(spanOf([change("2026-11-01"), change("2026-12-01")], "2026-12-01")).toEqual({
      kind: "from",
      date: "2026-12-01",
    });
  });
});

describe("inForceOn", () => {
  const changes = [change("2026-12-01"), change("2026-10-01"), change("2026-11-01")];

  it("is the change with the latest start on or before the date", () => {
    expect(inForceOn(changes, "2026-11-01")?.effectiveFrom).toBe("2026-11-01");
    expect(inForceOn(changes, "2026-11-30")?.effectiveFrom).toBe("2026-11-01");
    expect(inForceOn(changes, "2027-01-01")?.effectiveFrom).toBe("2026-12-01");
  });

  it("is the first change for a date before every change", () => {
    expect(inForceOn(changes, "2026-09-01")?.effectiveFrom).toBe("2026-10-01");
  });

  it("is null with no changes", () => {
    expect(inForceOn([], today)).toBeNull();
  });
});

describe("removalOf", () => {
  it("hands the removed days to the earlier targets, or the first change's days to the next", () => {
    const changes = [change("2026-10-01"), change("2026-11-01"), change("2026-12-01")];
    expect(removalOf(changes, "2026-11-01")).toEqual({ kind: "between", date: "2026-11-01", end: "2026-11-30" });
    expect(removalOf(changes, "2026-12-01")).toEqual({ kind: "from", date: "2026-12-01" });
    expect(removalOf(changes, "2026-10-01")).toEqual({ kind: "first", next: "2026-11-01" });
    expect(removalOf([change("2026-10-01")], "2026-10-01")).toBeNull();
  });

  it("names the one day when the removed change covered only one", () => {
    const changes = [change("2026-11-01"), change("2026-11-15"), change("2026-11-16")];
    expect(removalOf(changes, "2026-11-15")).toEqual({ kind: "day", date: "2026-11-15" });
  });
});
