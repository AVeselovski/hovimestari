import { describe, expect, it } from "@jest/globals";
import { averageOfDays, summarizeDay, type DayRow, type Figures, type TargetRanges } from "../index.js";

// The week's average on the worked example of the design: the week of
// Monday 16 to Sunday 22 November 2026, with today pinned to Friday 20.
// Every day is built with summarizeDay, so no position here is hand-written.
// Eaten counts the past days with eaten entries. Planned (withPlan) counts
// every day with any entry. An empty day counts toward neither.

const TODAY = "2026-11-20";
const TARGETS: TargetRanges = { energyKcal: { lower: 1900, upper: 2200 }, proteinG: { lower: 130, upper: 170 } };
const LATER: TargetRanges = { energyKcal: { lower: 2000, upper: 2300 }, proteinG: { lower: 140, upper: 180 } };

const figures = (energyKcal: number, proteinG: number): Figures => ({ energyKcal, proteinG, carbsG: 0, fatG: 0 });
const eaten = (kcal: number, protein: number, isEstimate = false): DayRow => ({
  status: "eaten",
  figures: figures(kcal, protein),
  isEstimate,
});
const planned = (kcal: number, protein: number): DayRow => ({
  status: "planned",
  figures: figures(kcal, protein),
  isEstimate: false,
});

const WEEK: Record<string, DayRow[]> = {
  "2026-11-16": [],
  "2026-11-17": [eaten(1200, 80), eaten(850, 62.3)],
  "2026-11-18": [eaten(1000, 70), eaten(980, 65.5, true)],
  "2026-11-19": [eaten(2010, 128.4), planned(300, 20)],
  "2026-11-20": [eaten(900, 60.2), planned(1700, 89.8)],
  "2026-11-21": [planned(2700, 140)],
  "2026-11-22": [],
};
const DATES = Object.keys(WEEK);

/** The week's days, with the targets `targetsOn` gives each date and the rows `rows` holds. */
const week = (
  targetsOn: (date: string) => TargetRanges | null = () => TARGETS,
  rows: Record<string, DayRow[]> = WEEK,
) => DATES.map((date) => summarizeDay(date, TODAY, rows[date], targetsOn(date)));

/** Targets `first` before `from` and `then` from it. */
const changeOn =
  (from: string, then: TargetRanges | null, first: TargetRanges | null = TARGETS) =>
  (date: string) =>
    date < from ? first : then;

const NO_POSITION = { targets: null, energy: null, protein: null };

describe("averageOfDays", () => {
  it("averages the past days with eaten entries for Eaten: Tue 17 to Thu 19, 2013 kcal and 135.4 g", () => {
    const average = averageOfDays(week());
    expect(average.eaten).toEqual({
      dates: ["2026-11-17", "2026-11-18", "2026-11-19"],
      figures: figures(2013, 135.4),
      targets: TARGETS,
      energy: { position: "within", distance: 187 },
      protein: { position: "within", distance: 34.6 },
      includesEstimate: true,
    });
  });

  it("averages every day with any entry for Planned: Tue 17 to Sat 21, 2328 kcal and 143.2 g", () => {
    const average = averageOfDays(week());
    expect(average.withPlan).toEqual({
      dates: ["2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21"],
      figures: figures(2328, 143.2),
      targets: TARGETS,
      energy: { position: "above", distance: 128 },
      protein: { position: "within", distance: 26.8 },
      includesEstimate: true,
    });
  });

  it("never counts the empty Monday as zero, today in Eaten, or the empty days in Planned", () => {
    const average = averageOfDays(week());
    expect(average.eaten.figures?.energyKcal).not.toBe(1510); // 6040 / 4, Monday as zero
    expect(average.eaten.figures?.energyKcal).not.toBe(1735); // (6040 + 900) / 4, today in Eaten
    expect(average.withPlan.figures?.energyKcal).not.toBe(1663); // 11640 / 7, the empty days in Planned
    expect(average.eaten.dates).not.toContain("2026-11-16");
    expect(average.eaten.dates).not.toContain(TODAY);
    expect(average.withPlan.dates).not.toContain("2026-11-22");
  });

  it("counts a past day with only planned entries in Planned and not in Eaten", () => {
    const rows = { ...WEEK, "2026-11-16": [planned(1500, 100)] };
    const average = averageOfDays(week(undefined, rows));
    expect(average.eaten.dates).toEqual(["2026-11-17", "2026-11-18", "2026-11-19"]);
    expect(average.withPlan.dates[0]).toBe("2026-11-16");
    expect(average.withPlan.dates).toHaveLength(6);
  });

  it("says includesEstimate only when a counted day's same reading holds an estimate", () => {
    const rows = { ...WEEK, "2026-11-18": [] };
    const average = averageOfDays(week(undefined, rows));
    expect([average.eaten.includesEstimate, average.withPlan.includesEstimate]).toEqual([false, false]);
  });

  describe("targets in the week", () => {
    it("has no position when a change from Thu 19 splits the counted days, in either reading", () => {
      const average = averageOfDays(week(changeOn("2026-11-19", LATER)));
      expect(average.eaten).toEqual(expect.objectContaining({ ...NO_POSITION, figures: figures(2013, 135.4) }));
      expect(average.withPlan).toEqual(expect.objectContaining({ ...NO_POSITION, figures: figures(2328, 143.2) }));
    });

    it("keeps Eaten's position when a change starts on Sat 21, and Planned, which counts Sat 21, has none", () => {
      const average = averageOfDays(week(changeOn("2026-11-21", LATER)));
      expect(average.eaten.targets).toEqual(TARGETS);
      expect(average.eaten.energy).toEqual({ position: "within", distance: 187 });
      expect(average.eaten.protein).toEqual({ position: "within", distance: 34.6 });
      expect(average.withPlan).toEqual(expect.objectContaining(NO_POSITION));
    });

    it("has no position when a change from Thu 19 moves only the protein upper bound, in either reading", () => {
      const proteinUpper: TargetRanges = { ...TARGETS, proteinG: { lower: 130, upper: 175 } };
      const average = averageOfDays(week(changeOn("2026-11-19", proteinUpper)));
      expect(average.eaten).toEqual(expect.objectContaining({ ...NO_POSITION, figures: figures(2013, 135.4) }));
      expect(average.withPlan).toEqual(expect.objectContaining({ ...NO_POSITION, figures: figures(2328, 143.2) }));
    });

    it("has no position when a counted day comes before the first change: from Wed 18, with Tue 17 logged", () => {
      const average = averageOfDays(week(changeOn("2026-11-18", TARGETS, null)));
      expect(average.eaten).toEqual(expect.objectContaining({ ...NO_POSITION, figures: figures(2013, 135.4) }));
      expect(average.withPlan).toEqual(expect.objectContaining({ ...NO_POSITION, figures: figures(2328, 143.2) }));
    });

    it("is positioned when the days before the first change are empty: from Wed 18, Mon 16 and Tue 17 empty", () => {
      const rows = { ...WEEK, "2026-11-17": [] };
      const average = averageOfDays(week(changeOn("2026-11-18", TARGETS, null), rows));
      // (1980 + 2010) / 2 = 1995, (135.5 + 128.4) / 2 = 131.95, half away from zero 132.0.
      expect(average.eaten).toEqual({
        dates: ["2026-11-18", "2026-11-19"],
        figures: figures(1995, 132),
        targets: TARGETS,
        energy: { position: "within", distance: 205 },
        protein: { position: "within", distance: 38 },
        includesEstimate: true,
      });
      // 9590 / 4 = 2397.5, so 2398. 573.9 / 4 = 143.475, so 143.5.
      expect(average.withPlan).toEqual({
        dates: ["2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21"],
        figures: figures(2398, 143.5),
        targets: TARGETS,
        energy: { position: "above", distance: 198 },
        protein: { position: "within", distance: 26.5 },
        includesEstimate: true,
      });
    });
  });

  it("answers the figures with no targets and no positions for a person with no targets", () => {
    const average = averageOfDays(week(() => null));
    expect(average.eaten).toEqual(expect.objectContaining({ ...NO_POSITION, figures: figures(2013, 135.4) }));
    expect(average.withPlan).toEqual(expect.objectContaining({ ...NO_POSITION, figures: figures(2328, 143.2) }));
    expect(average.withPlan.dates).toHaveLength(5);
  });

  it("counts no day in a week with no entries: no dates, no figures, no targets", () => {
    const empty = Object.fromEntries(DATES.map((date) => [date, []]));
    const nothing = { dates: [], figures: null, ...NO_POSITION, includesEstimate: false };
    expect(averageOfDays(week(undefined, empty))).toEqual({ eaten: nothing, withPlan: nothing });
    expect(averageOfDays([])).toEqual({ eaten: nothing, withPlan: nothing });
  });
});
