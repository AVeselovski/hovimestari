import { change, overview } from "@/components/targets/__tests__/support";
import { weekTargetsLine } from "../noTargets";

// The line under the week table about targets, for the week of Monday 16 to
// Sunday 22 November 2026. Pure: the dates are fixtures, no clock is read.

const MONDAY = "2026-11-16";
const SUNDAY = "2026-11-22";
const TODAY = "2026-11-20";
const FIRST = change("2026-11-01", [1900, 2200], [130, 170]);

const line = (...changes: ReturnType<typeof change>[]) =>
  weekTargetsLine(MONDAY, SUNDAY, overview(changes, TODAY, TODAY));

describe("weekTargetsLine", () => {
  it("names a later change that starts after Monday and by Sunday", () => {
    expect(line(FIRST, change("2026-11-19", [2000, 2300], [140, 180]))).toEqual({ kind: "new", date: "2026-11-19" });
  });

  it("says nothing for a change equal in every bound to the one before it, since no band moves", () => {
    expect(line(FIRST, change("2026-11-19", [1900, 2200], [130, 170]))).toBeNull();
  });

  it("names a change that moves one bound only", () => {
    expect(line(FIRST, change("2026-11-19", [1900, 2200], [130, 175]))).toEqual({ kind: "new", date: "2026-11-19" });
  });

  it("skips an equal change in the week and names the next one that moves a band", () => {
    const same = change("2026-11-18", [1900, 2200], [130, 170]);
    const moved = change("2026-11-21", [2000, 2300], [140, 180]);
    expect(line(FIRST, same, moved)).toEqual({ kind: "new", date: "2026-11-21" });
  });

  it("compares a change with the one just before it, not with the first", () => {
    // 1 Nov, then 10 Nov moves the bands, then 19 Nov puts back the first targets: the bands move on 19 Nov.
    const moved = change("2026-11-10", [2000, 2300], [140, 180]);
    const back = change("2026-11-19", [1900, 2200], [130, 170]);
    expect(line(FIRST, moved, back)).toEqual({ kind: "new", date: "2026-11-19" });
  });

  it("keeps the first change's line when the week holds the first change", () => {
    expect(line(change("2026-11-18", [1900, 2200], [130, 170]))).toEqual({ kind: "first", date: "2026-11-18" });
  });

  it("says nothing with no changes in the week, or with no overview", () => {
    expect(line(FIRST)).toBeNull();
    expect(weekTargetsLine(MONDAY, SUNDAY, undefined)).toBeNull();
  });
});
