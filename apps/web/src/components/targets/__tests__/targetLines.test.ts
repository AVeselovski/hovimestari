import type { TargetChange } from "@hovimestari/types";
import { spanOf } from "../targetLines";

const change = (effectiveFrom: string): TargetChange => ({
  effectiveFrom,
  ranges: { energyKcal: { lower: 1800, upper: 2200 }, proteinG: { lower: 120, upper: 160 } },
  updatedAt: "2026-11-01T08:00:00.000Z",
});
const today = "2026-11-16";

describe("spanOf", () => {
  it("names the days from the date to the day before the next change", () => {
    const changes = [change("2026-10-01"), change("2026-11-01"), change("2026-12-01")];
    expect(spanOf(changes, "2026-11-01")).toEqual({
      kind: "between",
      date: "2026-11-01",
      end: "2026-11-30",
      earlier: true,
    });
    expect(spanOf(changes, "2026-11-10")).toEqual({
      kind: "between",
      date: "2026-11-10",
      end: "2026-11-30",
      earlier: true,
    });
  });

  it("names the one day when the next change starts the day after", () => {
    const changes = [change("2026-11-01"), change("2026-11-16")];
    expect(spanOf(changes, "2026-11-15")).toEqual({ kind: "day", date: "2026-11-15", earlier: true });
    // An edit of a change that covers one day.
    expect(spanOf([...changes, change("2026-11-15")], "2026-11-15")).toEqual({
      kind: "day",
      date: "2026-11-15",
      earlier: true,
    });
  });

  it("names every day from the date on when no change follows", () => {
    expect(spanOf([change("2026-11-01")], today)).toEqual({ kind: "from", date: today, earlier: true });
  });

  it("covers only its own days when the change is the first: the days before it have no targets", () => {
    // The first change, edited or removed: to the day before the next, with nothing earlier.
    expect(spanOf([change("2026-11-01"), change("2026-12-01")], "2026-11-01")).toEqual({
      kind: "between",
      date: "2026-11-01",
      end: "2026-11-30",
      earlier: false,
    });
    // The only change: from its date on, with nothing earlier.
    expect(spanOf([change("2026-11-01")], "2026-11-01")).toEqual({ kind: "from", date: "2026-11-01", earlier: false });
    // A new date before every change: up to the day before the first one, never every earlier day.
    expect(spanOf([change("2026-12-01")], "2026-11-20")).toEqual({
      kind: "between",
      date: "2026-11-20",
      end: "2026-11-30",
      earlier: false,
    });
    expect(spanOf([change("2026-11-21")], "2026-11-20")).toEqual({ kind: "day", date: "2026-11-20", earlier: false });
  });

  it("ignores the change on the date itself, in both directions", () => {
    expect(spanOf([change("2026-11-01"), change("2026-12-01")], "2026-12-01")).toEqual({
      kind: "from",
      date: "2026-12-01",
      earlier: true,
    });
    expect(spanOf([change("2026-12-01")], "2026-12-01")).toEqual({ kind: "from", date: "2026-12-01", earlier: false });
  });

  it("names the days for a later date with no change on it too, after the first change", () => {
    expect(spanOf([change("2026-11-01")], "2026-11-17")).toEqual({ kind: "from", date: "2026-11-17", earlier: true });
    expect(spanOf([change("2026-11-01"), change("2026-12-15")], "2026-12-01")).toEqual({
      kind: "between",
      date: "2026-12-01",
      end: "2026-12-14",
      earlier: true,
    });
  });
});
