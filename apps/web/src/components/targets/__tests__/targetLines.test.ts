import type { TargetChange } from "@hovimestari/types";
import { removalOf, rewriteOf } from "../targetLines";

const change = (effectiveFrom: string): TargetChange => ({
  effectiveFrom,
  ranges: { energyKcal: { lower: 1800, upper: 2200 }, proteinG: { lower: 120, upper: 160 } },
  updatedAt: "2026-11-01T08:00:00.000Z",
});
const today = "2026-11-16";

describe("rewriteOf", () => {
  it("names the days from the date to the day before the next change", () => {
    const changes = [change("2026-10-01"), change("2026-11-01"), change("2026-12-01")];
    expect(rewriteOf(changes, "2026-11-01", today)).toEqual({ kind: "between", date: "2026-11-01", end: "2026-11-30" });
    expect(rewriteOf(changes, "2026-11-10", today)).toEqual({ kind: "between", date: "2026-11-10", end: "2026-11-30" });
  });

  it("names the one day when the next change starts the day after", () => {
    const changes = [change("2026-11-01"), change("2026-11-16")];
    expect(rewriteOf(changes, "2026-11-15", today)).toEqual({ kind: "day", date: "2026-11-15" });
    // An edit of a change that covers one day.
    expect(rewriteOf([...changes, change("2026-11-15")], "2026-11-15", today)).toEqual({
      kind: "day",
      date: "2026-11-15",
    });
  });

  it("names every day from the date on when no change follows", () => {
    expect(rewriteOf([change("2026-11-01")], today, today)).toEqual({ kind: "from", date: today });
  });

  it("covers every earlier day when the change is the first", () => {
    expect(rewriteOf([change("2026-11-01"), change("2026-12-01")], "2026-11-01", today)).toEqual({
      kind: "before",
      next: "2026-12-01",
    });
    expect(rewriteOf([change("2026-11-01")], "2026-11-01", today)).toEqual({ kind: "all" });
    // A new date before every change becomes the first, and takes the days before it too.
    expect(rewriteOf([change("2026-12-01")], "2026-11-20", today)).toEqual({ kind: "before", next: "2026-12-01" });
  });

  it("says nothing for a later date with no change on it, after the first change", () => {
    expect(rewriteOf([change("2026-11-01")], "2026-11-17", today)).toBeNull();
    expect(rewriteOf([change("2026-11-01"), change("2026-12-15")], "2026-12-01", today)).toBeNull();
  });

  it("speaks for an edit of a later change too", () => {
    expect(rewriteOf([change("2026-11-01"), change("2026-12-01")], "2026-12-01", today)).toEqual({
      kind: "from",
      date: "2026-12-01",
    });
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
