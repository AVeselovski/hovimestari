import { describe, expect, it } from "@jest/globals";
import { summarizeDay, type DayRow, type Figures, type TargetRanges } from "../index.js";

// The day summary's one rule, on the worked example of the design: the week
// of Monday 16 to Sunday 22 November 2026, with today pinned to Friday 20.
// A past reading with no entries has no position: nothing was recorded.
// Today and later days keep theirs while empty: what is left to reach the range.

const TODAY = "2026-11-20";
const TARGETS: TargetRanges = { energyKcal: { lower: 1900, upper: 2200 }, proteinG: { lower: 130, upper: 170 } };

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

const day = (date: string, targets: TargetRanges | null = TARGETS) => summarizeDay(date, TODAY, WEEK[date], targets);

describe("summarizeDay", () => {
  it("gives an empty past day no positions in either reading, never below 1900 and below 130, and keeps its targets", () => {
    const monday = day("2026-11-16");
    expect(monday.relation).toBe("past");
    expect(monday.targets).toEqual(TARGETS);
    for (const reading of [monday.eaten, monday.withPlan]) {
      expect(reading).toEqual({ figures: figures(0, 0), energy: null, protein: null, includesEstimate: false });
      expect(reading.energy).not.toEqual({ position: "below", distance: 1900 });
      expect(reading.protein).not.toEqual({ position: "below", distance: 130 });
    }
  });

  it("gives a past day with only planned entries no eaten position and a Planned one", () => {
    const summary = summarizeDay("2026-11-19", TODAY, [planned(2310, 148.4)], TARGETS);
    expect([summary.eaten.energy, summary.eaten.protein]).toEqual([null, null]);
    expect(summary.withPlan.energy).toEqual({ position: "above", distance: 110 });
    expect(summary.withPlan.protein).toEqual({ position: "within", distance: 21.6 });
    expect([summary.entryCount, summary.plannedCount, summary.unmarkedCount]).toEqual([1, 1, 1]);
  });

  it("positions a past day's readings that hold entries: Thursday 19", () => {
    const thursday = day("2026-11-19");
    expect(thursday.eaten.figures).toEqual(figures(2010, 128.4));
    expect(thursday.eaten.energy).toEqual({ position: "within", distance: 190 });
    expect(thursday.eaten.protein).toEqual({ position: "below", distance: 1.6 });
    expect(thursday.withPlan.figures).toEqual(figures(2310, 148.4));
    expect(thursday.withPlan.energy).toEqual({ position: "above", distance: 110 });
    expect(thursday.withPlan.protein).toEqual({ position: "within", distance: 21.6 });
    expect([thursday.entryCount, thursday.plannedCount, thursday.unmarkedCount]).toEqual([2, 1, 1]);
  });

  it("marks an estimate per reading: Wednesday 18", () => {
    const wednesday = day("2026-11-18");
    expect(wednesday.eaten.figures).toEqual(figures(1980, 135.5));
    expect([wednesday.eaten.includesEstimate, wednesday.withPlan.includesEstimate]).toEqual([true, true]);
  });

  it("positions today while it is under way, and counts its planned entries as not yet marked", () => {
    const friday = day("2026-11-20");
    expect(friday.relation).toBe("today");
    expect(friday.eaten.energy).toEqual({ position: "below", distance: 1000 });
    expect(friday.eaten.protein).toEqual({ position: "below", distance: 69.8 });
    expect(friday.withPlan.figures).toEqual(figures(2600, 150));
    expect(friday.unmarkedCount).toBe(0);
  });

  it("keeps an empty today's positions: the gap left to plan", () => {
    const empty = summarizeDay(TODAY, TODAY, [], TARGETS);
    expect(empty.eaten.energy).toEqual({ position: "below", distance: 1900 });
    expect(empty.withPlan.protein).toEqual({ position: "below", distance: 130 });
  });

  it("keeps a future day's positions, empty or with only a plan", () => {
    const saturday = day("2026-11-21");
    expect(saturday.relation).toBe("future");
    expect(saturday.eaten.energy).toEqual({ position: "below", distance: 1900 });
    expect(saturday.withPlan.energy).toEqual({ position: "above", distance: 500 });
    const sunday = day("2026-11-22");
    for (const reading of [sunday.eaten, sunday.withPlan]) {
      expect(reading.energy).toEqual({ position: "below", distance: 1900 });
      expect(reading.protein).toEqual({ position: "below", distance: 130 });
    }
  });

  it("answers null positions on a day without targets, whatever its entries and its date", () => {
    for (const date of Object.keys(WEEK)) {
      const summary = day(date, null);
      expect(summary.targets).toBeNull();
      expect([summary.eaten.energy, summary.eaten.protein, summary.withPlan.energy, summary.withPlan.protein]).toEqual([
        null,
        null,
        null,
        null,
      ]);
    }
    expect(day("2026-11-19", null).withPlan.figures).toEqual(figures(2310, 148.4));
  });
});
