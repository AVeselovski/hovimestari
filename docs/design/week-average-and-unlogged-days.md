# Design: the week's average and days with no entries

Status: approved. PR 1 built on `feat/week-average-unlogged-days` (frontend through 96526ef, then the check fixes), see "PR 1 as built". PR 2 built on `feat/week-average` (through 856ac03, then the check fixes through 7382ab2), see "PR 2 as built" at the end
Branches: `feat/week-average-unlogged-days` (this doc, then PR 1), `feat/week-average` (PR 2, cut from `master` after PR 1 merges)
Requested by: Artur, 2026-11-20, taking up two suggestions his connected assistant made: "Yes on assistant's suggestions, I planned the same at some point. Details are open to you."

Code claims are checked against `origin/master` 9e8e17a, fetched 2026-11-20 (docs only past 6661db9, where the first draft was checked). This doc replaces the "A week total or average row: Not asked for" line of `week-and-copy.md` (section g, rejected alternatives). The average is asked for now.

## 0. Product decisions the owner may want to shelve

Each row is reversible. The rest of the doc assumes the recommendation.

| #    | Fork                                                                                                                                                                                                | Recommendation, and why                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Cost if flipped                                                                                                                                                                    |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.1  | Which empty readings lose their position: **past days only**, or **every empty day** (the assistant's literal wording), or none                                                                     | **Past days only.** On a past day an empty reading is a record of nothing: nobody logged, which is not the same as eating nothing. On today and later days the same zero is what is left, the gap a person plans from (FR-GAP-01, FR-GAP-07: planning from zero is the same action as planning around fixed meals). "Below by 1,900" is true on an empty tomorrow and false on last Monday                                                                                         | One condition in `summarizeDay` (`packages/types`): drop `relation === "past"`. Today's and tomorrow's summaries then say "No entries" while empty, and the app rules text changes |
| 0.2  | The rule applies **per reading**, or **per day**                                                                                                                                                    | **Per reading.** A past day holding only planned entries never marked eaten has an eaten reading with nothing in it: the same "nothing recorded" as an empty day. Its Planned reading holds entries and keeps its position. The Day summary says "Nothing marked eaten" where the eaten distance was (0.10)                                                                                                                                                                        | The condition counts the day's entries instead of the reading's. That past day's Eaten then says "1,900 kcal below the range" again                                                |
| 0.3  | The eaten average counts **past days with eaten entries**, or **those and today**                                                                                                                   | **Past days only.** Today is still being eaten. At noon on Friday, Friday's breakfast would pull the eaten average down by a few hundred kcal and push it back up by night: a figure that moves for no reason but the clock. Today counts in the Planned average, the reading that includes what is still to come. The counted line says "before today", so the person can check the count against the rows (0.8)                                                                  | One predicate in `averageOfDays`, and the counted line's "before today" form goes                                                                                                  |
| 0.4  | The Planned average counts **every day with any entry**, past, today and future, or **all seven days**, or **days up to today**                                                                     | **Every day with any entry.** It reads "where the week lands with the plan as it stands": logged days as they are, today with its plan, and the days with something planned. An unlogged Monday or an unplanned Sunday counts as nothing, rather than as zero, by the same reasoning as 0.1. A day counts whole however little is on it, which the app rules and the feature doc say (h)                                                                                           | One predicate                                                                                                                                                                      |
| 0.5  | **An average only**, or **a total beside it**                                                                                                                                                       | **The average only**, on screen and in the API. Targets are daily ranges, so a daily average is the figure the person's plan is judged by, as their assistant put it. A total over a varying number of days compares with nothing the person set, and two more figures per macro do not fit the table at 320 wide                                                                                                                                                                  | A `total` field on each average reading (the sum is already computed) and a line under the table                                                                                   |
| 0.6  | An average is placed against the targets **only when every day it counts has the same targets**, or **against the mean of the days' bounds**                                                        | **Only when every counted day has the same targets.** That is every week of a person who has not changed targets mid-week. The mean of the bounds of differing days is a number the person never set (FR-TGT-04 offers no computed value for a target), and a day before the first change has no bounds to average                                                                                                                                                                 | `sharedTargets` in `packages/types` becomes a mean. The shape does not change                                                                                                      |
| 0.7  | The average is **an eighth row of the week table**, its gauge **a mark per reading** on the band, or a fill gauge as on the day rows, or a block under the table                                    | **An eighth row, with marks.** Same columns, same heads, one mount site. A day's gauge fills Planned on from Eaten, because a day's Planned is Eaten plus the plan. Two averages over different days do not stack: Planned can be lower than Eaten (light days planned ahead), and a fill would then draw nothing for it. A mark is a pure position: a solid dot for Eaten inside a ringed dot for Planned, in the macro's hue, on the same band, under the same ticks as the rows | A fill is drawable only when Planned is at least Eaten. A block under the table repeats the heads and costs about 120 px more at 320                                               |
| 0.8  | The number of days each average counts is said **once, in a line under the table**, or **under each figure**                                                                                        | **Once**, in words a person can check against the rows: "Eaten: 3 days before today. Planned: 5 days." Eaten counts the rows before Today that show eaten figures, Planned counts the rows that do not say "No entries". The figure cells carry bare values, as every row does. A screen reader hears the count in each average cell, so table navigation stays self-contained                                                                                                     | Four small lines under the figures, and the row grows by one line. The spoken count repeats in all four cells of a row read either way                                             |
| 0.9  | Not asked for: a week in which **a later targets change starts** after its Monday gets the line "New targets apply from 19 November 2026.", in the room the "Targets apply from" line already keeps | **Add it.** The rows' bands shift mid-week under the reader's eye in such a week, and nothing says why. The line states the date they shift on. It also accounts for an average row without a gauge in most such weeks, but that is a side effect, not its trigger. The room exists for every person with a targets change, and only such a person can have a second change. No decision from Artur is needed                                                                      | The line stays empty in those weeks. One catalog key and one branch in `noTargets.ts` go                                                                                           |
| 0.10 | On the Day tab, the distance slot of a past reading with nothing recorded **says what is there**, or **stays blank**                                                                                | **It says so, muted:** "No entries" when the day has no entries, the words the week row already uses, and "Nothing marked eaten" under Eaten on a past day that holds only planned entries. A blank under "0 kcal" reads as a half-loaded summary. The slot keeps its room already, so nothing moves                                                                                                                                                                               | The slot stays blank. Two catalog keys and one branch in `DaySummary.tsx` go                                                                                                       |

Out-of-scope defects found: none. The empty list's "Nothing logged yet." on a past day was considered and left. A past day can still take entries, so "yet" holds.

## 1. Requirements validation

Verdict: **aligned, with gaps resolved by assumptions.** Both problems sit inside FR-DAY-04, FR-DAY-08 and NFR-ADV-01. The average is new behaviour, so it gets a proposed requirement of its own. Nothing here conflicts with the requirements.

**The problems, stripped of the proposed mechanism.**

1. A person who judges intake over a week, with some days planned higher than others, cannot read where the week lands. The week sheet shows seven positions, each against a daily range the person does not expect every day to meet. The assistant's mechanism, "a week view with an average", is mostly right: the week view exists, and what is missing is one figure per reading that the screen and the assistant read the same way. Testing that mechanism turned up two traps. An average that counts empty days as zero repeats problem 2 at the week's scale. A fill gauge cannot draw two averages over different days (0.7).
2. An empty past day is positioned as if the person ate nothing. The screen half-knows this: a week row says "No entries", but the Day tab's summary still says "1,900 kcal below the range" and the assistant's `get_day` hands over `{ position: "below", distance: 1900 }`. The assistant's mechanism, "a day with no entries shouldn't be positioned at all", is too wide: on today and future days that distance is the gap (0.1).

| Requirement           | How this design meets it                                                                                                                                                                                      | Note                                                  |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| FR-DAY-03             | Both readings stay on every day. The average exists in both readings                                                                                                                                          |                                                       |
| FR-DAY-04, FR-TGT-07  | A day with targets keeps its positions, except a past reading with no entries, which says "No entries" or "Nothing marked eaten" in place of a distance. Its gauge keeps the band and ticks with no fill      | Wording below, on top of the one waiting in `TODO.md` |
| FR-DAY-08             | The week sheet gains the average row                                                                                                                                                                          | Wording below                                         |
| FR-DAY-13             | A past day's unmarked entries count in the Planned average and never in the Eaten average                                                                                                                     |                                                       |
| FR-DAY-15             | An average whose counted days hold an estimate starts with "≈", and a screen reader hears "estimated"                                                                                                         |                                                       |
| FR-GAP-01, FR-GAP-07  | Today and future days keep their positions while empty, so planning from zero and planning around fixed meals stay the same action. Only a past day loses the gap, and a past day is not where a plan is made | Wording for FR-GAP-01 below                           |
| FR-TGT-04             | No computed bound: an average is placed only against targets every counted day shares (0.6)                                                                                                                   |                                                       |
| FR-AI-06, FR-AI-13    | `get_days` answers the average, and `get_day` and `get_days` answer the null positions. The app rules say how to read both                                                                                    |                                                       |
| NFR-AI-02, NFR-AI-03  | The average is computed once, by `averageOfDays` in `packages/types`, called by the service that `GET /days` and `get_days` both call. The screen ships with the tool, in one pull request (PR 2)             |                                                       |
| NFR-ADV-01, NFR-UX-07 | Positions only. No word judges a week or a day, nothing turns a colour, and there is no count of days within the range                                                                                        | The judgement-word test covers the new keys           |
| NFR-UX-02, NFR-UX-04  | Phone first, measured at 320, 390 and 1280. Every colour is an existing token both themes define                                                                                                              |                                                       |

**Changes proposed that were not asked for:** the "New targets apply from" line (0.9) and the words in the Day summary's empty slot (0.10). Both in section h.

**Requirements drift, proposed for Artur.** The documentation step adds these to `TODO.md`, folded into the waiting item "Approve six requirement wordings and four overview sentences for days without targets", whose FR-DAY-04, FR-DAY-08 and FR-GAP-01 wordings they extend.

- **FR-DAY-04**, extending the waiting wording: "The system shall show for each day with targets where both totals stand against the calorie range and the protein range, as figures and as a visual gauge that tells eaten from planned. A day without targets shows both totals with no position. So does a past day's total that counts no entries, because nothing was recorded."
- **FR-DAY-08**, extending the waiting wording: "The system shall show a week at a glance, with each day's totals and their position against the targets on the days that have them, and the week's average day in both readings."
- **FR-DAY-16**, new: "The system shall show for a week, and give a connected assistant for any range of days, the average day in both readings: what was eaten, averaged over the past days with eaten entries, and what the days come to with the plan, averaged over the days with any entries. It shall say how many days each average counts, and show where each stands against the targets when every day it counts has the same targets."
- **FR-GAP-01**, extending the waiting wording: "The system shall show for a day with targets, other than a past day with nothing on it, the gap after everything eaten and planned: …" with the rest unchanged.

"Different targets by weekday" stays a later item and is not designed here. **Room left for it:** each average reading carries its own `targets`, nullable, filled by one function (`sharedTargets`). Weekday targets make every week's days differ, so that step decides what fills it, the mean of the days' bounds or a total against the sum of them, and changes that one function. The shape stays.

## a) Overview

Two changes to how a day is read, and one new figure.

A past day's reading that holds no entries no longer has a position. The service answers `null` for its energy and protein positions, the Day tab says "No entries" or "Nothing marked eaten" where the distance was, and the assistant reads the same null with a rule that says what it means. Today and later days keep their positions while empty. The rule moves into the shared package as `summarizeDay`, which the service and the web's test fake both call.

The week sheet gains an eighth row, **Average**, under Sunday: the average day in both readings, for calories and protein, with a mini gauge that marks each average on the band. A line under the table says how many days each average counts. The figure is computed once, in the shared package, and `GET /days` and `get_days` answer it with every range.

## b) Components and responsibilities

### What exists

| Piece                                                   | Where                                                                                                                                          | State                                                                                                                                                                                                                                                                                |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A day's readings                                        | `readingOf` and `summaryOf` in `apps/backend/src/services/reads/days.ts:23-50`                                                                 | `readingOf(rows, targets)` positions every reading of a day with targets, empty or not. `summaryOf` knows `relation`                                                                                                                                                                 |
| The web's server fake                                   | `dayOf` in `apps/web/src/components/day/__tests__/support.ts:97-126`, used by `FakeDays.day()` and `FakeDays.range()` in `harness.tsx:105-115` | A second copy of `summaryOf`, "computed as the server computes them". Every harness-driven web test builds its days through it                                                                                                                                                       |
| The range read                                          | `listDaySummaries` (`reads/days.ts:81-95`), `GET /days` (`routes/days.ts:15-18`)                                                               | Answers `{ days }`. `get_days` (`mcp/tools/days.ts:89-97`) answers the same                                                                                                                                                                                                          |
| Readers of `GET /days` and `get_days` beyond the screen | `scripts/mcpSmoke/index.ts:179-186`, `mcp/__tests__/readTools.db.test.ts:178-191`                                                              | The smoke check compares `get_days` with `GET /days` by deep equality. The read-tools test scans every number of a `get_days` answer for a nearby change's bounds                                                                                                                    |
| Figure arithmetic                                       | `packages/types/src/figures.ts`                                                                                                                | `totalOf` sums in integer tenths, `positionOf` compares in tenths, `divRound` rounds halves away from zero and is private                                                                                                                                                            |
| Shapes                                                  | `packages/types/src/days.ts`                                                                                                                   | `DayReadingSchema`, `DaySummarySchema` (`entryCount`, `plannedCount`, `relation`, `targets`), `DaySummaryListSchema = { days }`                                                                                                                                                      |
| The Day summary                                         | `DaySummary.tsx:150-185`                                                                                                                       | A null position renders an empty `Reserved` slot that keeps the room of the longest distance                                                                                                                                                                                         |
| The week sheet                                          | `WeekSheet.tsx`, `WeekTable.tsx` in `apps/web/src/components/day/`                                                                             | A `<table>` in automatic layout (`w-full border-collapse`), one `<tbody>` per day, figures over a mini gauge. Empty day: `day.week.empty`, "No entries", across the four figure columns. One line under the table, "Targets apply from …", keeping its room for anyone with a change |
| The gauge                                               | `Gauge.tsx`, `gaugeGeometry.ts`                                                                                                                | A fill: eaten from 0, the plan from eaten on, ticks drawn last. Hue classes live only in `Gauge.tsx` and `MacroDot.tsx` (`components/figures/__tests__/macroHues.test.ts`)                                                                                                           |
| The range cache patch                                   | `putDaysInRanges` in `apps/web/src/lib/invalidation.ts:306-315`                                                                                | Writes each answered day into every cached range, so a week row equals its day at once                                                                                                                                                                                               |
| Fonts                                                   | `app/layout.tsx:15-27`                                                                                                                         | `display: "swap"`: the first paint uses the size-adjusted fallback face                                                                                                                                                                                                              |
| The app rules                                           | `apps/backend/src/mcp/appRules.ts`, section 3                                                                                                  | Says a day with targets has positions on each reading. `APP_RULES` is about 5 100 characters against the 12 000 bound (`appRules.test.ts:68`)                                                                                                                                        |

### Changed or new

| Component                                           | Change   | Owns                                                                                                                                                                                                                                                           | PR   |
| --------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| `packages/types/src/days.ts`                        | modified | `summarizeDay(date, today, rows, targets)`, the one day summary, with the empty-past-reading rule, and the comments on `energy` and `protein` (PR 1). `AverageReadingSchema`, `DaysAverageSchema`, `average` on `DaySummaryListSchema`, `averageOfDays` (PR 2) | 1, 2 |
| `apps/backend/src/services/reads/days.ts`           | modified | `readingOf` and `summaryOf` go: `getDay` and the range call `summarizeDay` (PR 1). `getDayRange(ctx, range)`, and `listDaySummaries` becomes module-private (PR 2)                                                                                             | 1, 2 |
| `apps/web/src/components/day/__tests__/support.ts`  | modified | `dayOf` calls `summarizeDay`, so no second copy of the rule exists                                                                                                                                                                                             | 1    |
| `apps/web/src/components/day/DaySummary.tsx`        | modified | The empty slot's words (0.10)                                                                                                                                                                                                                                  | 1    |
| `apps/web/src/components/day/WeekTable.tsx`         | modified | Reads `day.reading.noEntries` for an empty row (PR 1). The `<tfoot>` average row (PR 2)                                                                                                                                                                        | 1, 2 |
| `apps/web/messages/en.json`                         | modified | `day.reading.noEntries`, `day.reading.noneEaten`, and `day.week.empty` removed (PR 1). `day.week.average.*`, `day.week.targetsNew` (PR 2)                                                                                                                      | 1, 2 |
| `packages/types/src/figures.ts`                     | modified | `averageOf(totals)`: the integer average of day totals                                                                                                                                                                                                         | 2    |
| `apps/backend/src/routes/days.ts`                   | modified | `GET /days` calls `getDayRange`                                                                                                                                                                                                                                | 2    |
| `apps/backend/src/mcp/tools/days.ts`                | modified | `get_day` and `get_days` descriptions (PR 1). `get_days` calls `getDayRange` (PR 2)                                                                                                                                                                            | 1, 2 |
| `apps/backend/src/mcp/appRules.ts`                  | modified | Section 3 text and the `days.md` and `connected-ai.md` stamps                                                                                                                                                                                                  | 1, 2 |
| `apps/web/src/lib/api/days.ts`                      | modified | `getDaySummaries` answers `average ?? averageOfDays(days)`, so a web build ahead of its backend still reads a week (h, deploy order)                                                                                                                           | 2    |
| `apps/web/src/lib/invalidation.ts`                  | modified | `putDaysInRanges` writes `average: averageOfDays(days)` with the patched days                                                                                                                                                                                  | 2    |
| `apps/web/src/components/day/gaugeGeometry.ts`      | modified | `averageMarks(range, eaten, withPlan, options)`                                                                                                                                                                                                                | 2    |
| `apps/web/src/components/day/Gauge.tsx`             | modified | `AverageGauge`, the mini track with two marks under the ticks. Its hue classes stay in this file                                                                                                                                                               | 2    |
| `apps/web/src/components/day/WeekSheet.tsx`         | modified | The counted-days line, and the targets line's second kind                                                                                                                                                                                                      | 2    |
| `apps/web/src/components/day/noTargets.ts`          | modified | `weekTargetsLine(from, to, overview)`: the first change's start, or a later change's start inside the week                                                                                                                                                     | 2    |
| `apps/web/src/components/day/__tests__/harness.tsx` | modified | `FakeDays.range()` answers `{ days, average: averageOfDays(days) }`                                                                                                                                                                                            | 2    |

## c) Data model

No change. Nothing is stored. Both changes are read-time computation over the entries and the target changes.

## d) API interface

All under `/api/v1`, Bearer.

| Method | Path              | Change                                                                                                                 |
| ------ | ----------------- | ---------------------------------------------------------------------------------------------------------------------- |
| GET    | `/days/:date`     | PR 1. Same shape. A past day's reading with no entries answers `energy: null, protein: null`, with `targets` as it was |
| GET    | `/days?from=&to=` | PR 1, the same rule on every day. PR 2: answers `{ days, average }`. The same refusals                                 |

Every write that answers `days` (the entry writes) follows PR 1's rule, since they answer through `getDays`.

### PR 1: one day summary, shared

```ts
// packages/types/src/days.ts

/** Where a day falls against the user's today. */
export type DayRelation = DaySummary["relation"];

/**
 * A day's summary from its entries, in position order, and the targets in
 * force on it. The one computation: the days service answers every day
 * through it, and the web's test fake builds its days with it.
 *
 * A reading's energy and protein positions are null on a day without
 * targets, and on a past day when the reading holds no entries: nothing was
 * recorded, which is not the same as nothing eaten. On today and later days
 * an empty reading keeps its position: what is left to reach the range.
 */
export function summarizeDay(
  date: string,
  today: string,
  rows: readonly Pick<Entry, "status" | "figures" | "isEstimate">[],
  targets: TargetRanges | null,
): DaySummary;
```

`DayReadingSchema`'s `energy` and `protein` comments say the same two meanings of null. `targets` stays the day's targets, so a client tells "no targets" (`targets === null`) from "nothing recorded" (`targets !== null`, position `null`) without counting anything.

### PR 2: the average

```ts
// packages/types/src/days.ts

/** One reading's average day over the days it counts. */
export const AverageReadingSchema = z.object({
  /** The days this average counts, in date order. */
  dates: z.array(IsoDateSchema),
  /**
   * The average day: the counted days' totals summed in integer tenths and
   * divided by their number, kcal to a whole number and grams to one
   * decimal, halves away from zero. Null when no day counts.
   */
  figures: FiguresSchema.nullable(),
  /**
   * The targets every counted day shares. Null when no day counts, when a
   * counted day has no targets, or when two counted days have different ones.
   */
  targets: TargetRangesSchema.nullable(),
  /** The rounded average against `targets`. Null exactly when `targets` is. */
  energy: RangePositionSchema.nullable(),
  protein: RangePositionSchema.nullable(),
  /** A counted day's reading includes an estimate. */
  includesEstimate: z.boolean(),
});

/**
 * The average day of a range. `eaten` counts the past days with at least one
 * eaten entry. `withPlan` counts every day with at least one entry, whatever
 * its date, each day whole however little is on it. A day with no entries
 * counts toward neither. The two count different days, so withPlan can be
 * below eaten.
 */
export const DaysAverageSchema = z.object({ eaten: AverageReadingSchema, withPlan: AverageReadingSchema });

export const DaySummaryListSchema = z.object({ days: z.array(DaySummarySchema), average: DaysAverageSchema });

export type AverageReading = z.infer<typeof AverageReadingSchema>;
export type DaysAverage = z.infer<typeof DaysAverageSchema>;

/** The average day of `days`, one range's summaries in date order. The one computation: the server answers it and the web's cache patch recomputes it. */
export function averageOfDays(days: readonly DaySummary[]): DaysAverage;
```

```ts
// packages/types/src/figures.ts

/**
 * The average of day totals: summed in integer tenths, divided by their
 * number, kcal rounded to whole, grams to one decimal, halves away from zero.
 * At least one total.
 */
export function averageOf(totals: readonly Figures[]): Figures;
```

```ts
// apps/backend/src/services/reads/days.ts

/** Every day from `from` to `to`, without entries, and their average day. `GET /days` and `get_days` call it. */
export async function getDayRange(ctx: ReadContext, range: { from: string; to: string }): Promise<DaySummaryList>;
```

`listDaySummaries` loses its `export`: once the route and the tool call `getDayRange`, it has that one caller. `getDayRange` returns `{ days, average: averageOfDays(days) }`.

## e) Data flow and the computation

### A reading's position (PR 1)

`summarizeDay` builds each reading from its rows. A reading's `energy` and `protein` are `null` when `targets` is null, or when the day is past and the reading's rows are empty. Otherwise as now. The eaten reading's rows are the eaten entries, so a past day with only planned entries has a null eaten position and a positioned Planned reading.

`getDay` and `listDaySummaries` call `summarizeDay(date, ctx.today, rows, targets)`. `ctx.today` is the person's today in their zone, so at local midnight today's empty readings lose their positions, as yesterday's did. The web's `dayOf` calls the same function with its fixture's `today`. A test pins the fake to the service only through the function they share, and the db tests pin the function's behaviour on real rows.

### The average (PR 2)

`averageOfDays(days)`:

1. **Eaten** counts `d.relation === "past" && d.entryCount - d.plannedCount > 0`. **Planned** (`withPlan`) counts `d.entryCount > 0`.
2. For each reading: `dates` are the counted days' dates. `figures` is `averageOf(counted.map(d => d[reading].figures))`, or null when none counts.
3. `targets`: the first counted day's targets when every counted day's `targets` is non-null and equal to it, bound for bound. Otherwise null.
4. `energy` and `protein`: `positionOf(figures.energyKcal, targets.energyKcal)` and `positionOf(figures.proteinG, targets.proteinG)`, on the rounded average, as a day's position is on its rounded total. Null when `targets` is.
5. `includesEstimate`: some counted day's same reading has `includesEstimate`.

`averageOf(totals)`: each key summed as integer tenths (`scaled(v, 1)`, as `totalOf` does). kcal: `divRound(sumTenths, 10 × n)`. Grams: `divRound(sumTenths, n) / 10`. One rounding, halves away from zero. With at most 42 days of at most 10⁶ kcal each, the sums are far below 2⁵³.

Eaten's counted days are always among Planned's, so when both have targets they are the same targets.

### Worked example (the pinned fixture)

The week of Monday 16 to Sunday 22 November 2026, with today Friday 20 November. Targets from 1 November: 1900 to 2200 kcal and 130 to 170 g protein.

| Day    | Relation | Entries                                   | Eaten         | Planned       |
| ------ | -------- | ----------------------------------------- | ------------- | ------------- |
| Mon 16 | past     | none                                      | 0, 0.0        | 0, 0.0        |
| Tue 17 | past     | all eaten                                 | 2050, 142.3   | 2050, 142.3   |
| Wed 18 | past     | all eaten, one an estimate                | ≈1980, ≈135.5 | ≈1980, ≈135.5 |
| Thu 19 | past     | eaten, and one planned never marked eaten | 2010, 128.4   | 2310, 148.4   |
| Fri 20 | today    | eaten, and planned                        | 900, 60.2     | 2600, 150.0   |
| Sat 21 | future   | planned                                   | 0, 0.0        | 2700, 140.0   |
| Sun 22 | future   | none                                      | 0, 0.0        | 0, 0.0        |

**Positions a test asserts (PR 1):**

- Mon 16: eaten and Planned `energy: null, protein: null`, with `targets` the day's. **Never** `{ position: "below", distance: 1900 }` or `{ position: "below", distance: 130 }`.
- Thu 19: eaten energy `within 190`, eaten protein `below 1.6`, Planned energy `above 110`, Planned protein `within 21.6`.
- Fri 20, today: eaten energy `below 1000`, eaten protein `below 69.8`. Positioned while the day is under way.
- Sat 21: eaten energy `below 1900`. Sun 22: both readings `below 1900` and `below 130`. Future days keep their gap.
- A past day holding one planned entry and nothing eaten: eaten positions null, Planned positioned.

**The average a test asserts (PR 2):**

- Eaten: `dates` Tue 17, Wed 18, Thu 19. kcal (2050 + 1980 + 2010) / 3 = 2013.33, so **2013**. Protein 406.2 / 3 = **135.4**. Energy `within 187`, protein `within 34.6`. `includesEstimate: true`.
- Planned: `dates` Tue 17 to Sat 21. kcal 11640 / 5 = **2328**. Protein 716.2 / 5 = 143.24, so **143.2**. Energy `above 128`, protein `within 26.8`. `includesEstimate: true`.
- **Never** 1510 (6040 / 4, counting Monday as zero), 1735 ((6040 + 900) / 4, counting today in Eaten), or 1663 (11640 / 7, counting the empty days in Planned).
- The counted line for this week: "Eaten: 3 days before today. Planned: 5 days." A person counts three rows before Today with eaten figures (Tue, Wed, Thu, since Mon says "No entries") and five rows without "No entries" (Tue to Sat). **Never** "4 days" for Eaten (the rows with eaten figures, today included) or "7 days" for Planned.

**Rounding pins for `averageOf`:** 2001 and 2002 kcal give 2002, never 2001 (2001.5, half away from zero). 100.0 and 100.1 g give 100.1 (100.05). 2000, 2000 and 2001 give 2000 (2000.33). 2.3 and 2.4 g give 2.4 (2.35), where floats get it wrong: `(2.3 + 2.4) / 2` is 2.3499999999999996, which rounds to 2.3 (checked in Node). The test pins 2.4 and names the float value in its title.

**Targets in the week (PR 2):**

- A change to 2000 to 2300 kcal and 140 to 180 g from Thu 19: eaten counts Tue 17 to Thu 19 under two targets, so `targets`, `energy` and `protein` are null. Planned likewise. The sheet's line says "New targets apply from 19 November 2026."
- The same change from Sat 21: eaten counts only days under the first targets and keeps its positions, `within 187` and `within 34.6`. Planned counts Sat 21 and has none.
- A first change from Wed 18, with Tue 17 logged: Tue 17 has no targets, so both averages have none. The existing line says "Targets apply from 18 November 2026."
- The same first change, with Mon 16 and Tue 17 empty: no counted day lacks targets, so both averages are positioned.
- A person with no targets at all: the figures as above, every `targets` and position null.
- A week with no entries at all: both averages `dates: []`, `figures: null`, `targets: null`.

### Reading a week (PR 2)

1. The week sheet's `dayRangeQuery(from, to)` reads `GET /days`. The route calls `getDayRange`, which reads the days and answers `{ days, average }`.
2. An entry write answers its days. `afterEntryWrite` puts them in the day cache, then `putDaysInRanges` writes each into every cached range that holds its date and recomputes that range's `average` with `averageOfDays` over the patched days. So the average row equals the rows from the moment the write answers, as the rows equal their days. The range is then read again, as now.
3. Across midnight, `afterDayChange` reads every `["days"]` key again, so a range's `relation`s and its average follow the new today.

## f) Frontend architecture

### The Day tab (PR 1)

On a day with targets, a reading whose position is null fills its distance slot with muted words, `text-ink-muted`, in the slot's own size, in place of the distance:

- **"No entries"** (`day.reading.noEntries`) in all four slots of a past day with no entries. The week row says the same of that day.
- **"Nothing marked eaten"** (`day.reading.noneEaten`) in the two Eaten slots of a past day that holds only planned entries. Its Planned slots keep their distances, and "2 planned entries were never marked eaten." still closes the summary.

The figure above stays, "0 kcal", the sum of no rows. The gauge keeps its band and ticks with no fill. The slot keeps the room of its macro's longest distance, as now, and its reserved forms include both phrases, so the summary's height does not change and nothing moves between a day with distances and one with words. "Nothing marked eaten" is about 124 px in `text-xs` and the slot is 138 at 320: one line.

What a screen reader hears, in each cell: "Eaten, 0 kcal, No entries", or "Eaten, 0 kcal, Nothing marked eaten". The words are shown and spoken alike, so they sit in the slot without the `aria-hidden` and `sr-only` pair a distance uses. A day without targets has no slot and does not change.

`DaySummary.tsx` picks the words from the day: `day.entryCount === 0` gives "No entries", otherwise "Nothing marked eaten". Only the eaten reading can be the second case. Only a past day can reach either, since the server answers a position on every other day with targets.

### The week rows (PR 1)

`WeekTable` reads its empty row's words from `day.reading.noEntries`, and `day.week.empty` goes, so the Day summary and the week say "No entries" through one key. A past row with only planned entries shows its figures as now, and its eaten cells are spoken with no position, since `positionWord` reads `null` as nothing.

### The average row (PR 2)

A `<tfoot>` after Sunday's `<tbody>`, one `<tr>` of figures over one `<tr aria-hidden>` of gauges, the same shape and heights as a day: 44 px on a phone and 52 from `md`. Its first row has a top border in `border-rule`, so the average reads apart from the days. It is not a button and has no hover: there is no day to pick. Tab order does not change: the seven rows, then Previous and Next.

| Cell             | Content                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Day column       | `<th scope="row" class="relative">` holding two things. A spacer, `block min-h-11 md:min-h-13 w-0`, which gives the row its height as a day's button does and adds no width. And the label "Average", `absolute inset-y-0 left-0 flex items-center whitespace-nowrap`, `text-xs font-semibold text-ink md:text-sm`. Out of flow, the label adds nothing to the column's min-content width, so no font, fallback face or later wording can widen the day column. Measured in Instrument Sans at weight 600: 47.8 px at 12 px, and about 56 at 14 px in the 80 px column from `md`. Wider text runs into the 12 px gap before the first figure column, whose figures are right-aligned, and moves nothing |
| Four figures     | As a day's cells: `font-mono`, right-aligned, "≈" before a reading that includes an estimate. An average with no counted days leaves its two cells empty. When Planned counts no day, the four cells hold "No entries" (`day.reading.noEntries`), muted, as an empty day's row does                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Gauge, per macro | `AverageGauge size="mini"` across the macro's two columns, when one of the two readings has `targets`. Its band and ticks are that reading's targets (both are the same when both have them)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

**The row's states.** Every state keeps the row's height and both lines' room.

| State                                   | Figures                                                | Gauge room                                                                                                                                                                                                                 | Counted line             |
| --------------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| Loading (the frame)                     | The label, empty cells                                 | `GaugeFrame size="mini"` for a person with any targets change or with no cached targets answer. Empty for a person the cached answer says has no change. The counted days are unknown, so the frame never predicts a range | Invisible, `aria-hidden` |
| Failed or offline                       | As loading. The notice keeps covering rows 3 to 5 only | As loading                                                                                                                                                                                                                 | Invisible                |
| Loaded, no entries in the week          | "No entries" across                                    | Empty, since no reading has `targets`                                                                                                                                                                                      | Invisible                |
| Loaded, Planned counts days, Eaten none | Planned's two figures, Eaten's cells empty             | The ring only                                                                                                                                                                                                              | Shown                    |
| Loaded, both count days                 | Four figures                                           | Ring and dot where each has a position                                                                                                                                                                                     | Shown                    |
| Loaded, no average has `targets`        | Figures                                                | Empty                                                                                                                                                                                                                      | Shown                    |

**`AverageGauge`.** The mini track and band as `Gauge size="mini"` draws them, from `averageMarks`, which shares `scaleOf`, `percentOf` and the band rule with `gaugeGeometry`, so a week's band and ticks line up in every row with the same targets. The paint order is: the track, the band, the two marks, then the two ticks, so a tick stays on top of a mark as it does over the day gauge's fill, and its 1 px edge in `border-surface` sets it apart. The marks, centred on their values:

- Planned: a 10 px circle, `bg-<macro>-plan` with a 1.5 px `border-<macro>`, drawn first.
- Eaten: a 6 px solid circle, `bg-<macro>`, with a 1 px edge in `border-surface`, drawn on top of the ring.

When the two are equal the eaten dot sits inside the planned ring and both show. A mark whose reading has no position is not drawn. A value past the track's end sits at the end, as the day gauge's cap does. A mark's centre is clamped to its radius from each end, so it never leaves the track. The marks do not ease: the row paints new marks with the week, keyed by the week's Monday. The hue classes stay in `Gauge.tsx`, so `macroHues.test.ts` needs no new file.

Both themes: every colour is an existing token (`--color-energy`, `--color-energy-plan`, `--color-protein`, `--color-protein-plan`, `--color-surface`, `--color-gauge-track-on-surface`, `--color-rule`). `ui-validator` checks the ring and the dot apart, and a tick over a ring, in both themes at 320, as week-and-copy's A3 checked the fill and tint.

### Under the table (PR 2)

Two lines, in this order, each `mt-3`, `text-xs leading-4 text-ink-muted md:text-sm md:leading-5`, each keeping its room so the sheet's held height includes it:

1. **The counted days**, always rendered, in words a person can check against the rows. Its form follows the week, read from the answer's `relation`s:
   - A week holding today: "Eaten: 3 days before today. Planned: 5 days."
   - A past week: "Eaten: 7 days. Planned: 7 days."
   - A future week: "Planned: 2 days."
     Zero eaten days in a week holding today reads "Eaten: no days before today. Planned: 2 days.", and in a past week "Eaten: no days. Planned: 2 days.". The line is invisible and `aria-hidden` while the week loads, fails or is offline, and when Planned counts no day, since the row then says "No entries". It is `aria-hidden` always, because each average cell speaks its own count. The longest form, "Eaten: no days before today. Planned: 7 days.", is 247 px of the 280 at 320: one line.
2. **The targets line**, as now for a person with any change, now with two kinds from `weekTargetsLine(from, to, overview)`: "Targets apply from 18 November 2026." when the week holds a day before the first change, as built, or else "New targets apply from 19 November 2026." when a later change starts after the week's Monday and on or before its Sunday. With several, the first in the week. About 237 px at 320: one line.

### Screen reader (PR 2)

The row header is "Average". Each average figure cell reads, in order: "estimated" when it includes an estimate, the figure, its count, and the position word the day cells use ("in the range", "below the range", "below the floor", "above the range") when it has one. The count is "average of 3 days before today" for Eaten in a week holding today, and "average of 3 days" otherwise. A cell with no counted days reads "no days counted". So table navigation down the Calories Eaten column ends with "Average, 2013, average of 3 days before today, in the range". A whole-row read repeats the count in each of the four cells, which is the price of each cell standing alone.

### Heights (PR 2, estimates for `ui-validator` to measure)

The average adds about 73 px below `md` (1 px rule, a 44 px row, 12 px and the 16 px count line) and about 85 from `md`.

| Viewport | Sheet now, with the targets line | With the average | Room                  | Result                                                                                           |
| -------- | -------------------------------- | ---------------- | --------------------- | ------------------------------------------------------------------------------------------------ |
| 320×568  | about 535                        | about 608        | about 544             | The body scrolls about 64 px, the footer stays. The average row is under the fold until a scroll |
| 390×844  | about 535                        | about 608        | about 820             | Whole                                                                                            |
| 1280×800 | about 600                        | about 685        | 768 (`100dvh - 2rem`) | Whole                                                                                            |

At 375×667 the room is about 643, so the sheet shows whole. The sheet holds the height it opened at (`useHeldSheetHeight`), and every week renders the row and both lines' room, so stepping weeks moves nothing.

### Copy, every string a catalog entry

| Key                                  | Copy                                                                                                                                    | PR  |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- | --- |
| `day.reading.noEntries`              | "No entries". Replaces `day.week.empty`                                                                                                 | 1   |
| `day.reading.noneEaten`              | "Nothing marked eaten"                                                                                                                  | 1   |
| `day.week.average.label`             | "Average"                                                                                                                               | 2   |
| `day.week.average.countedThisWeek`   | "Eaten: {eaten, plural, =0 {no days} one {# day} other {# days}} before today. Planned: {planned, plural, one {# day} other {# days}}." | 2   |
| `day.week.average.countedPast`       | "Eaten: {eaten, plural, =0 {no days} one {# day} other {# days}}. Planned: {planned, plural, one {# day} other {# days}}."              | 2   |
| `day.week.average.countedFuture`     | "Planned: {planned, plural, one {# day} other {# days}}."                                                                               | 2   |
| `day.week.average.spokenBeforeToday` | "average of {count, plural, one {# day} other {# days}} before today"                                                                   | 2   |
| `day.week.average.spokenDays`        | "average of {count, plural, one {# day} other {# days}}"                                                                                | 2   |
| `day.week.average.spokenNone`        | "no days counted"                                                                                                                       | 2   |
| `day.week.targetsNew`                | "New targets apply from {date}."                                                                                                        | 2   |

`day.week.spoken.*`, `day.summary.approx`, `day.summary.estimated` and `day.summary.targetsFrom` are reused. The judgement-word test (`days-and-logging.md` section f) covers the new keys, and the catalog tests cover their plurals. The three counted forms never meet a Planned count of zero on screen, since the line is hidden then. Each still carries `other`, which the catalog test requires.

## The assistant

### Tools

| Tool       | PR 1                                                                                                  | PR 2                                                                                                                                                                                                                |
| ---------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `get_day`  | Same input and answer. The description gains: "A past day's reading with no entries has no position." | Unchanged                                                                                                                                                                                                           |
| `get_days` | The same sentence in its description                                                                  | Calls `getDayRange` and answers `{ days, average }`. Same input: a range of up to 42 days, or `weekOf`. The description gains: "and the average day over them in both readings, with the days each average counts." |

An average of an arbitrary range means the same as a week's: over the days of that range that count, by the same two rules. A tool computes nothing: it answers what `getDayRange` answers.

### The app rules, exact text

PR 1 replaces section 3's sentence "On a day without targets the positions are null and the figures stand alone." with (about 470 characters added):

> On a day without targets the positions are null and the figures stand alone. On a past day, a reading that holds no entries has no position either, and targets is still given: nothing was recorded, which is not the same as eating nothing. Say that the day has no entries, or that nothing on it was marked eaten, and never quote its zero as what the person ate. On today and later days an empty reading keeps its position, which is what is left to reach the range.

PR 2 replaces section 3's last sentence, "get_days reads up to 42 days, or the Monday-to-Sunday week holding a date.", with (about 780 characters added):

> get_days reads up to 42 days, or the Monday-to-Sunday week holding a date, and answers the average day over them. average.eaten counts the past days that have eaten entries, and average.withPlan every day that has any entry, today and planned days included, so today counts toward eaten only once it is over. A day counts whole however little is on it, and a day with no entries counts toward neither. The two count different days, so withPlan may be lower than eaten. dates lists the days each average counts, and figures is null when it counts none. An average has a position only when every day it counts has the same targets, and targets then names them. Quote an average with the number of days it counts. Never average or add up days yourself.

With R1a's section 9 (about 1 340 characters), `APP_RULES` lands near 7 700 characters against its 12 000 bound. `WRITE_RULES` does not change. Each PR re-stamps `days.md` and `connected-ai.md` in `APP_RULES_SOURCES`, since each changes both docs.

## g) Constraints and decisions

- **One computation for a day, one for an average.** `summarizeDay`, `averageOfDays` and `averageOf` live in `packages/types`, as `entryFigures` does. The server answers through them. The web's test fake builds its days through `summarizeDay`, and the web's cache patch and its API fallback compute the average through `averageOfDays`, so no second copy of either rule exists anywhere. A web test that hand-writes a day's positions or an average is a second copy and is refused in review.
- **`src/mcp/` computes nothing and runs no SQL** (`project_connected_ai_design`). `get_days` swaps one service call for another.
- **No new overlay.** The average is a table row in the existing `BottomSheet`.
- **No column moves.** The table keeps automatic layout. Nothing in the day column is in flow except what sets the row's height with no width.
- **Positions only.** No colour past a bound, no count of days within the range, no word for a week.
- Backend imports end in `.js`. Web imports do not.

### Rejected alternatives

| Alternative                                                          | Why not                                                                                                                                                                         |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No position on every empty day, as the assistant worded it           | Removes the gap from an empty today or tomorrow, which is what a person plans from (0.1, FR-GAP-07)                                                                             |
| A new `recorded` or `logged` boolean on each reading                 | `targets !== null` with a null position already says it, and a boolean that is false on an empty today with a position would need its own rule. The app rules carry the meaning |
| The empty-past rule kept in `readingOf` and copied into the web fake | Two copies of one rule, one of which only tests read. The fake drifted once already: it encodes the rule this change removes                                                    |
| The average computed in the web from the rows                        | The assistant would not get the same figure (NFR-AI-02), and the rule would live in two places                                                                                  |
| A new route, `GET /weeks/:date`                                      | `GET /days` and `get_days` already read a week or any range. One answer, one cache key, one patch                                                                               |
| Counting every day of the week, empty ones as zero                   | Problem 2 at the week's scale: an unlogged Monday pulls the average 500 kcal down                                                                                               |
| Mean of the counted days' bounds as the average's range              | A bound the person never set (FR-TGT-04). Kept as the likely answer for weekday targets, which is that step's decision                                                          |
| A fill gauge on the average row                                      | It cannot draw a Planned average below the Eaten one (0.7)                                                                                                                      |
| No gauge on the average row                                          | The position would be heard and not seen. Every other row shows it                                                                                                              |
| "Average" in flow at `font-normal` and muted, about 3 px narrower    | Narrower is still a margin, not a guarantee. The fallback face or a wider word would widen the column again                                                                     |
| `table-fixed` on the week table                                      | It changes how the four figure columns share the spare width, which `week-and-copy.md` measured and pinned                                                                      |
| "Averages over 3 days eaten, 5 days planned."                        | The person sees eaten figures on four rows (today included) and planned entries on two. Neither count can be checked against the rows                                           |
| The average above Monday, so it shows without a scroll at 320×568    | A summary row above the rows it summarises reads as a header. Only the smallest phone scrolls, by about 64 px                                                                   |
| The average on the Day tab                                           | A second mount site for a week figure on a one-day page. The week sheet is one press away                                                                                       |
| A total beside the average                                           | 0.5                                                                                                                                                                             |
| The backend deploys first, stated as a rule                          | Vercel and Fly deploy on their own triggers and nothing orders them. A rule nobody enforces fails on the first race (h)                                                         |

### Non-questions

- **The week runs Monday to Sunday** (`week-and-copy.md` 0.3). The average is of that week on screen. `get_days` averages whatever range it reads.
- **"Planned" is everything on the day, eaten or still planned** (`week-and-copy.md` 0.4). The Planned average is of that reading.
- **A day's total is the sum of its rounded rows**, and an average is of those totals. It is never recomputed from the entries.
- **A position compares in integer tenths**, here on the rounded average, as a day's compares on its rounded total.
- **The gauge's scale depends on the targets alone**, so the average row's band sits exactly under the rows' bands of the same targets.

## h) Open questions and risks

- **The words in the Day summary's empty slot (0.10) and the "New targets apply from" line (0.9) were not asked for.** > **Assumption:** both ship, 0.10 in PR 1 and 0.9 in PR 2. The screenshots of PR 1 put 0.10 in front of Artur, with the blank slot as the alternative.
- **A day on which a person ate nothing.** With no entries it now reads as unrecorded. > **Assumption:** that is rare, and such a day is recorded with an estimate, since an estimate's energy may be 0 (`days.md`, "Estimates"). It then counts in both averages, with "≈". If Artur wants a plain "Ate nothing" mark on a day, that is a new entry kind and a later change.
- **A day logged or planned only in part counts whole.** A past day with only breakfast logged counts in the Eaten average, and today with only dinner planned, or a Saturday with only breakfast planned, counts in the Planned average, each as a whole day. The app cannot tell a light day from a part-filled one. > **Assumption:** the rows show it, and the counted line says how many days stand behind each figure. No heuristic guesses. The app rules tell an assistant "A day counts whole however little is on it", and the feature doc says the same.
- **The gap step (FR-GAP-02 to FR-GAP-11) is not built.** It will read positions. > **Assumption:** it offers suggestions on today and later days only, so a past day's null position never reaches it. The FR-GAP-01 wording above says so.
- **Deploy order.** Vercel builds the web and Fly deploys the backend, each on its own trigger, so a web build reading `average` can meet a backend that does not answer it yet. `getDaySummaries` is typed, not parsed. > **Decision:** the web tolerates it. `getDaySummaries` answers `{ days, average: data.average ?? averageOfDays(data.days) }`. That is the function the cache patch already runs on the same days, so the figure is the one the backend would answer, and no second rule exists. The fallback stays: it costs one line and guards every later skew. The other skew, an old web and a new backend, ignores the extra field. PR 1 changes no shape, so it has no skew.
- **Readers of `get_days` beyond the screen.** The smoke check (`scripts/mcpSmoke/index.ts:179-186`) compares `get_days` with `GET /days` by deep equality. It keeps passing and now covers `average` too. Nobody edits it. The read-tools test "never answers a nearby change's numbers for a day before the first change" (`readTools.db.test.ts:178-191`) scans every number of a `get_days` answer. PR 2 adds the average's figures to that scan. Its fixture's days have no targets, so the average's targets and positions are null, and its figures are averages of the fixture's 89 kcal day. > **Assumption:** none equals a nearby bound. The backend engineer checks the scanned numbers once and names this test in PR 2's list.
- > **Risk:** at 320×568 the average row is under the fold when the sheet opens. Mitigation: the body scrolls by about 64 px with the footer kept. `ui-validator` measures it. If Artur finds it hidden on his phone, the row can move above Monday with no other change.
- > **Risk:** a ring centred on a range's bound. The ticks are painted after the marks, so a tick stays visible over a ring, with its 1 px surface-coloured edge. `Gauge.test.tsx` pins the DOM order. `ui-validator` checks it in both themes.
- > **Risk:** a column moving after all. Mitigation: the label is out of flow (f). `ui-validator` proves it: in a real browser at 320 and 1280, it records the x of every figure head and every average figure cell in three weeks and in the loading, loaded, failed and offline states, once with the web fonts and once with every `.woff2` request aborted so the fallback face renders. All x values are equal across the runs, and equal to those of the same week with the `<tfoot>` removed in DevTools.

### Where this meets recipes (R1a, R1b, R3a) and other branches

`docs/design/recipes.md`, sections b and j.

| File                                                                                                                       | This design                                                                        | Recipes                                                                                                                                                            | Conflict                                                                                                                                                                                                               |
| -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/types/src/figures.ts`                                                                                            | `averageOf` (PR 2)                                                                 | R1a: `Scale` gains `serving`                                                                                                                                       | Different functions. Textual only if adjacent                                                                                                                                                                          |
| `packages/types/src/index.ts`                                                                                              | unchanged: it re-exports `days.js` and `figures.js` with `export *`                | R1a: the recipe exports                                                                                                                                            | none                                                                                                                                                                                                                   |
| `packages/types/src/days.ts`                                                                                               | `summarizeDay` (PR 1), the average (PR 2)                                          | none                                                                                                                                                               | none                                                                                                                                                                                                                   |
| `services/reads/days.ts`                                                                                                   | `summarizeDay` replaces `readingOf` and `summaryOf` (PR 1), `getDayRange` (PR 2)   | R3a: the batched `differs` query of d.2                                                                                                                            | R3a works on the entries, before the summary. It rebases over PR 1 and calls `summarizeDay` as it stands                                                                                                               |
| `mcp/tools/days.ts`                                                                                                        | two descriptions (PR 1), `get_days` run (PR 2)                                     | R1b: entry fields in descriptions                                                                                                                                  | Small textual. The second to land rebases                                                                                                                                                                              |
| `mcp/appRules.ts`                                                                                                          | section 3, two stamps (both PRs)                                                   | R1a: a new section 9, the old 9 renumbered 10 and its sentence on recipes rewritten, section 11's opening sentence. R1b, R3a: more of the same and the same stamps | Section 3 keeps its number. Both edit one template literal, and the `days.md` and `connected-ai.md` stamp lines always conflict. The second to land re-stamps after its rebase, and `appRules.test.ts` prints the hash |
| `routes/__tests__/days.db.test.ts`                                                                                         | new cases (PR 1, PR 2)                                                             | R1b lists it as "unchanged and green, not edited"                                                                                                                  | No textual conflict. R1b's pin list reads it as edited by PR 1 and still green                                                                                                                                         |
| `components/day/__tests__/support.ts`, `harness.tsx`                                                                       | `dayOf` calls `summarizeDay` (PR 1), `FakeDays.range()` answers the average (PR 2) | R1b may add recipe entry fixtures                                                                                                                                  | Different functions. The second to land rebases                                                                                                                                                                        |
| `components/day/DaySummary.tsx`, `WeekTable.tsx`                                                                           | PR 1, PR 2                                                                         | none in R1b (its Day work is the entry rows and the entry sheet)                                                                                                   | none                                                                                                                                                                                                                   |
| `messages/en.json`                                                                                                         | `day.reading.*`, `day.week.empty` removed (PR 1), `day.week.*` (PR 2)              | entry and recipe keys                                                                                                                                              | Different keys, likely separate hunks                                                                                                                                                                                  |
| `features/days.md`, `connected-ai.md`, `app/day.md`                                                                        | Where a day stands, The week's average, the week sheet, the tools                  | recipe entries and tools                                                                                                                                           | Different sections, and every merge re-stamps                                                                                                                                                                          |
| `figures.ts` tests, `WeekSheet.tsx`, `Gauge.tsx`, `gaugeGeometry.ts`, `noTargets.ts`, `invalidation.ts`, `lib/api/days.ts` | PR 2                                                                               | none                                                                                                                                                               | none                                                                                                                                                                                                                   |

Recommended order: **PR 1 before R1b**, since it is small and fixes what the assistant reported. PR 2 in either order. No file needs a cross-branch refactor.

## i) Docs

| Doc                                | PR 1                                                                                                                                                                                                                         | PR 2                                                                                                                                                                                                                                                                                                                              |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/features/days.md`            | "Where a day stands": a past day's reading with no entries has no position, and why today's and later days keep theirs. "Reads": `summarizeDay` in `packages/types`, which the service calls. "API": the null's two meanings | New `### The week's average` under "The week": which days each reading counts, each day whole, the rounding, when it has a position. "Reads": `getDayRange`, `averageOfDays`. "API": `GET /days` answers `{ days, average }`                                                                                                      |
| `docs/features/connected-ai.md`    | "What an assistant reads": the null position on a past empty reading                                                                                                                                                         | "What an assistant reads" and the "Tools" table under How it works: `get_days` answers the average. "The smoke check": it compares the whole `get_days` answer, average included                                                                                                                                                  |
| `docs/app/day.md`                  | "The summary": a past day with nothing recorded says "No entries", or "Nothing marked eaten" under Eaten, where the distance was. "The week": an empty row's words come from the same place                                  | "The week": the average row, its marks, the two lines under the table, the spoken cells. "The gauge": the marks under the ticks. "Layout": the heights, and the day column's label laid out of flow, so no word in it moves a column. "Data and refresh": `putDaysInRanges` recomputes the week's average with the days it writes |
| `docs/app/colors.md`               |                                                                                                                                                                                                                              | "The gauge": the ring and the dot use the plan tint, its border and the macro hue                                                                                                                                                                                                                                                 |
| `docs/features.md`                 | The Days line: "… each placed against the user's own targets with a distance on days that have them, except a past day's reading with nothing in it."                                                                        | The Days line: "… and its week sheet the seven days of a week side by side with their average day."                                                                                                                                                                                                                               |
| `docs/design/link-map.md`          | The "position, distance, where a day stands" row gains "nothing recorded"                                                                                                                                                    | New row: "the week's average, average day, counted days" → `features/days.md#the-weeks-average`, `### The week's average`                                                                                                                                                                                                         |
| `apps/backend/src/mcp/appRules.ts` | Section 3, stamps for `days.md` and `connected-ai.md`                                                                                                                                                                        | Section 3, the same stamps                                                                                                                                                                                                                                                                                                        |
| `TODO.md`                          | The FR-DAY-04 and FR-GAP-01 wordings, folded into the waiting item                                                                                                                                                           | The FR-DAY-08 and FR-DAY-16 wordings, the same item                                                                                                                                                                                                                                                                               |

`pnpm docs:check` on every doc changed. No new doc, so no template is needed.

## j) Implementation plan

Two pull requests, one per problem, each reviewable alone. Both are user-visible. Every agent step is logged in `logs.txt`.

### PR 1: a past day with nothing recorded (`feat/week-average-unlogged-days`)

`backend-engineer` (shared package, service, tools, rules), then `frontend-engineer` (fake, summary, week key, copy). `validator` after each. `ui-validator` after the frontend passes, at 320×568 and 390×844, light and dark, on an empty past day, a planned-only past day and an empty today, keyboard and screen reader. It judges whether "No entries" and "Nothing marked eaten" read as statements and not as a glitch, and measures that the summary's height is the same as on a day with distances. Then `reviewer`, then `documentation-specialist`, then the `ui-preview` screenshots to Artur before merge.

Files: `packages/types/src/days.ts` (`summarizeDay`, comments), `apps/backend/src/services/reads/days.ts`, `apps/backend/src/mcp/tools/days.ts` (descriptions), `apps/backend/src/mcp/appRules.ts`, `apps/web/src/components/day/__tests__/support.ts`, `apps/web/src/components/day/DaySummary.tsx`, `apps/web/src/components/day/WeekTable.tsx`, `apps/web/messages/en.json`, the docs in section i, `TODO.md`.

Tests. The change's real coverage is tests 1, 2, 4, 5, 6, 7 and 8, each written first and failing on master. Test 3 is a pin that passes on master and must keep passing. The db tests date "yesterday" and "tomorrow" from the suite's own Helsinki today (`helsinkiToday()`), as the suite already does, never from a fixed date. Only the `packages/types` fixtures pin `today` to a date.

1. `routes/__tests__/days.db.test.ts`, "a past day with no entries has no positions, and keeps its targets": a user with targets, `GET /days/<yesterday>` with no entries answers `energy: null, protein: null` in both readings and `targets` set. On master it answers `below 1900`.
2. Same file, "a past day with only planned entries has no eaten position, and a Planned one".
3. Pin, same file, "today and a future day keep their positions while empty": `below` with the lower bound as distance.
4. Same file, "the week": a new case, "equals getDay on an empty past day, an empty today and an empty future day", reading yesterday to tomorrow from `helsinkiToday()`. The existing fixed-date pin stays as it is, since its relations follow the real date.
5. `mcp/__tests__/readTools.db.test.ts`: `get_day` on an empty past day answers null positions with targets.
6. `packages/types/src/__tests__/summarizeDay.test.ts` with `today` pinned to 2026-11-20: the worked example's per-day positions and the negative values, and a day without targets answering null positions whatever its entries.
7. `apps/web/src/components/day/__tests__/DaySummary.test.tsx`, through `dayOf`: a past day with targets and no entries shows "No entries" in all four slots, speaks "Eaten, 0 kcal, No entries", and has the same summary height as a day with distances (the reserved room). A planned-only past day shows "Nothing marked eaten" under Eaten only. An empty today shows its distances. Fails on master: the fake answers a position and the words do not exist.
8. `WeekSheet.test.tsx`, through `FakeDays`: a past row with only planned entries speaks no position for its eaten cells. Fails on master, where the fake positions it.

`appRules.test.ts` fails until the two stamps are set. `catalog.test.ts` and `orphanKeys.test.ts` cover the moved key.

### PR 2: the week's average (`feat/week-average`, cut from `master` after PR 1 merges)

`backend-engineer` first (shared package, service, route, tool, rules), then `frontend-engineer` (API fallback, invalidation, gauge, table, sheet, copy, fakes). `validator` after each. `ui-validator` after the frontend passes, at 320×568, 375×667, 390×844 and 1280×800, light and dark, keyboard and screen reader, with the column proof of section h, on a real phone when one is at hand. Then `reviewer`, then `documentation-specialist`, then the `ui-preview` screenshots.

Backend files: `packages/types/src/figures.ts`, `packages/types/src/days.ts`, `apps/backend/src/services/reads/days.ts`, `apps/backend/src/routes/days.ts`, `apps/backend/src/mcp/tools/days.ts`, `apps/backend/src/mcp/appRules.ts`.

Backend tests, written first:

1. `packages/types/src/__tests__/figures.test.ts`: the `averageOf` rounding pins from section e, among them 2.3 and 2.4 g giving 2.4, which a float average gets wrong.
2. `packages/types/src/__tests__/dayAverage.test.ts`, on days built with `summarizeDay` and `today` pinned to 2026-11-20: the worked example's averages, dates and positions, and the three negative values. The four targets cases. No targets. An empty week.
3. `routes/__tests__/days.db.test.ts`: `GET /days` answers `average` equal to `averageOfDays(days)`, and an empty past day is outside both `dates`.
4. `mcp/__tests__/readTools.db.test.ts`: `get_days` answers exactly what `GET /days` answers, average included, for a week and for a range. The existing number scan (`:178-191`) stays green with the average in the answer.

Frontend files: `apps/web/src/lib/api/days.ts`, `apps/web/src/lib/invalidation.ts`, `apps/web/src/components/day/gaugeGeometry.ts`, `Gauge.tsx`, `WeekTable.tsx`, `WeekSheet.tsx`, `noTargets.ts`, `apps/web/messages/en.json`, and the range fakes: `FakeDays.range()` in `components/day/__tests__/harness.tsx`, the private fakes in `WeekSheet.test.tsx`, `emptyWeek()` in `lib/__tests__/invalidation.ranges.test.ts`, the ranges in `lib/__tests__/invalidation.days.test.ts`, and the week prefetches in `DayTab.copy.test.tsx` and `DayTab.test.tsx`. Each answers its `average` through `averageOfDays` over its own days. None writes an average by hand.

Frontend tests, written first:

1. `lib/__tests__/invalidation.ranges.test.ts`: after a write patches a day into a cached week, the week's `average` equals `averageOfDays` of its patched days, and differs from the average before the patch. Run against the unpatched function to see it fail.
2. `lib/__tests__/` for `getDaySummaries`: an answer without `average` comes back with `averageOfDays` of its days, and an answer with one comes back unchanged.
3. `gaugeGeometry.test.ts`: `averageMarks` puts each mark at its value's share of the scale, clamps past the end, and gives the same band and ticks as `gaugeGeometry` for the same targets.
4. `Gauge.test.tsx`: `AverageGauge` draws the ring and the dot, only the ring when eaten has no position, and nothing but the track when neither has. The ticks come after the marks in the DOM.
5. `WeekSheet.test.tsx`: the average row's four figures and "≈". "No entries" when Planned counts none. The counted line's three forms and its zero form, its `aria-hidden`, and the pinned week's line against the rows: "Eaten: 3 days before today. Planned: 5 days.", never 4 or 7. Each average cell's spoken text, its count and the position word. The "New targets apply from" line in a week holding a later change, and the existing line winning in a week holding the first change. The label is out of flow (`absolute`). Across states: the sheet's body height is the same loading, loaded, failed, offline, in an empty week and in a week with the targets line (assert between states, not within each).

## Resolved defaults (architect, 2026-11-20, owner may veto)

- Past days only lose an empty reading's position (0.1).
- The rule is per reading, so an unmarked-only past day has no eaten position (0.2).
- The Eaten average leaves today out until it is over (0.3).
- The Planned average counts every day with any entry, whatever its date, each day whole (0.4).
- No total, on screen or in the API (0.5).
- An average is placed only against targets every counted day shares (0.6).
- The average is a table row with a ring and a dot under the ticks, not a fill (0.7).
- The counted days are said once, under the table, in words a person can check against the rows (0.8).
- "New targets apply from …" joins the targets line (0.9).
- The Day summary says "No entries" or "Nothing marked eaten" where a past reading's distance was (0.10).
- The day summary's rule lives in `packages/types` as `summarizeDay`, called by the service and the web fake.
- The API carries `dates` per average, not a count, so an assistant can name the days without working them out.
- `GET /days` changes its answer rather than a new route, and `listDaySummaries` becomes module-private.
- `averageOfDays` lives in `packages/types` so the cache patch and the API fallback compute the same figure.
- The web tolerates a backend without `average`, rather than a deploy order.
- Two pull requests, one per problem, PR 1 first. Both go through `ui-validator` and screenshots.

## Review round 1, answered (architect, 2026-11-20)

The reviewer's round 1, approve after fixes. Every finding was checked against the code at 9e8e17a. The orchestrator's steer on the majors is followed.

| #   | Finding                                                                                                           | Answer                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| --- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1  | major: `dayOf` in the web test support positions every reading the old way, so the fake encodes what PR 1 removes | Accepted, and taken further. The rule moves into `packages/types` as `summarizeDay`, the whole day summary. The service's `readingOf` and `summaryOf` go, and `dayOf` calls the same function, so no second copy exists (b, d, e, g). PR 1 lists `support.ts`. PR 2 names every range fake (`FakeDays.range()`, the `WeekSheet.test.tsx` fakes, `emptyWeek()`, the `invalidation.days.test.ts` ranges, the DayTab prefetches), each answering through `averageOfDays`. g says a hand-written position or average in a test is refused |
| M2  | major: "Average" at 47.8 px in a 48 px automatic-layout column widens it on any wider render                      | Accepted. The claim in h was wrong: in automatic layout a nowrap cell widens its column. The label is now `absolute` in a `relative` row header, with a zero-width spacer setting the row's height, so no font, fallback or wording adds to the column's min-content (f). `table-fixed` and a narrower in-flow label are rejected with reasons (g). `ui-validator` proves it with every `.woff2` aborted, comparing column x values across weeks and states with and without the `<tfoot>` (h)                                        |
| M3  | major: "Averages over 3 days eaten, 5 days planned." contradicts the rows                                         | Accepted. Three forms by week: "Eaten: 3 days before today. Planned: 5 days.", "Eaten: 7 days. Planned: 7 days." and "Planned: 2 days.", each with a zero form and plurals (f, copy). "Before today" rather than "to yesterday", since a person counts rows above the one marked Today. The spoken counts match. A test pins the pinned week's line against the rows a person counts, and the wrong counts 4 and 7 (e, j)                                                                                                             |
| M4  | major: PR 1 is user-visible and skips `ui-validator` and the screenshots                                          | Accepted. PR 1 now runs frontend-engineer, `ui-validator` at 320 and 390 in both themes, and `ui-preview` (j). The blank slot is replaced (new 0.10): "No entries" on a past day with no entries, the week row's words through one key, and "Nothing marked eaten" under Eaten on a planned-only past day. Copy, place, screen reader text and both cases are in f. PR 1 gains `DaySummary.tsx`, `WeekTable.tsx`, `en.json`, `support.ts` and tests 7 and 8                                                                           |
| m1  | minor: a ring painted over a tick hides it                                                                        | Accepted. The marks paint before the ticks, `Gauge.test.tsx` pins the order, and the risk line is corrected (f, h)                                                                                                                                                                                                                                                                                                                                                                                                                    |
| m2  | minor: a partly planned day counts whole and nothing says so                                                      | Accepted. h names it with its assumption, 0.4 restates what the Planned average reads, the app rules gain "A day counts whole however little is on it", and the feature doc says it (i)                                                                                                                                                                                                                                                                                                                                               |
| m3  | minor: the app rules need "targets is still given" and "withPlan may be lower than eaten"                         | Accepted, with m2's clause too. PR 1 adds about 470 characters and PR 2 about 780. With R1a's section 9, `APP_RULES` is near 7 700 against 12 000                                                                                                                                                                                                                                                                                                                                                                                     |
| m4  | minor: unnamed readers of `get_days`, and deploy skew                                                             | Accepted. The smoke check and the number scan are named, and the number scan joins PR 2's test list (h, j). Deploy order: the web tolerates a backend without `average`, through `averageOfDays` in `getDaySummaries`, the function the cache patch already runs. A stated "backend first" is rejected, because Vercel and Fly deploy on their own triggers and nothing enforces it (g, h)                                                                                                                                            |
| m5  | minor: PR 1's "each failing on master" is untrue for several tests                                                | Accepted. Pins are labelled. The real coverage is named. Tests 7 and 8 now go through the shared fake and do fail on master (j)                                                                                                                                                                                                                                                                                                                                                                                                       |
| m6  | minor: the average row's loading, failed and offline states are unspecified                                       | Accepted. A state table in f: the frame track unless the cached answer says the person has no change, empty cells, the counted line invisible. PR 2's height test covers all states (j)                                                                                                                                                                                                                                                                                                                                               |
| m7  | minor: the overlap with recipes is incomplete                                                                     | Accepted. The table names R1a's `figures.ts`, `index.ts` and the app rules renumbering, R3a's `reads/days.ts`, R1b's `days.db.test.ts` pin list and the test fakes (h). The order stands                                                                                                                                                                                                                                                                                                                                              |
| m8  | minor: the docs plan misses three sections                                                                        | Accepted. `app/day.md` "Data and refresh" and "Layout", and `connected-ai.md` "Tools" and "The smoke check", are in i                                                                                                                                                                                                                                                                                                                                                                                                                 |
| m9  | minor: 0.9's stated reason does not match its trigger                                                             | Accepted. 0.9 now states the reason it serves, the rows' bands shifting on a date, and that it needs no decision from Artur. It stays                                                                                                                                                                                                                                                                                                                                                                                                 |
| n1  | nit: line references                                                                                              | Fixed: `get_days` at `mcp/tools/days.ts:89-97`, `listDaySummaries` from `:81`, master 9e8e17a                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| n2  | nit: `listDaySummaries` keeps one caller                                                                          | Accepted. It becomes module-private in PR 2 (b, d)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| n3  | nit: FR-DAY-04 wording under the per-reading rule                                                                 | Accepted: "So does a past day's total that counts no entries, because nothing was recorded."                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| n4  | nit: the spoken count repeats on a row read                                                                       | Accepted, stated in 0.8 and f                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| n5  | nit: the db tests use the real Helsinki today                                                                     | Accepted, stated in j: relative to `helsinkiToday()`, never a fixed "yesterday". Only the `packages/types` fixtures pin a date                                                                                                                                                                                                                                                                                                                                                                                                        |

## PR 1 as built

Where the build departs from the text above, and what PR 2 should know.

- **Test 6 is real coverage.** `summarizeDay.test.ts` was red on master, since the export did not exist. Two mutations of the rule each turn two of its cases red: the rule removed fails the empty-past and planned-only-past cases, the rule widened to every day (0.1 flipped) fails the empty-today and future cases.
- **Test 4 is a new case**, relative to `helsinkiToday()`. The existing fixed-date pin in "the week" is unedited.
- **One test beyond the list:** `days.db.test.ts` "an empty day loses its positions at the person's midnight", through `contextAt` at 2026-03-28T21:59:59Z and 22:00:00Z.
- **The tool sentence is pinned in `router.test.ts`** through `listTools`, beside the barcode tool's description pin. The app rules sentences are pinned in `appRules.test.ts`.
- **`DayRow`** is exported from `packages/types` beside `summarizeDay`: the fields it reads of an entry. PR 2's fixtures build rows with it. The private reading builder there is `readingFrom`.
- **The Day summary's reserved forms include both phrases** (f), so the words never make a slot taller, at any width or font.
- **No web test hand-writes a position.** `DayTab.test.tsx` ("follows a targets edit") and `DaySummary.test.tsx` (the 959.5 kcal distance) build their days through `dayOf` with their own targets.
- **The two wordings for the average** (the FR-DAY-08 extension and FR-DAY-16) sit in their own `TODO.md` item, to be approved when PR 2 lands. The FR-DAY-04 and FR-GAP-01 wordings are in the waiting requirements item.
- **For PR 2's design (ui-validator N2):** a week row of an empty today or future day says "No entries", through `day.reading.noEntries`, while the Day tab for that day shows its distances ("1900 kcal below the range"). On an empty past day the same words mean "no position". One phrase now carries two meanings. PR 2 touches the week rows, so it decides whether a non-past empty row keeps "No entries" or shows its distances or other words.

## PR 2 as built

Where the build departs from the text above, after the three checks at 856ac03 and their fixes.

- **Two new files.** `WeekAverageRow.tsx` is the `<tfoot>`. `weekCells.ts` is the one home for what the day rows and the average row share: `MACROS`, `READINGS`, `gapBefore`, `FIGURE_TYPE`, `FIGURE_CELL`, `EMPTY_CELL`, `GAUGE_CELL`, `positionKey`, and `weekKind`. They keep `WeekTable.tsx` under 300 lines, and neither row imports the other's internals.
- **`weekKind(from, to, today)`** picks the counted line's form and the spoken count, never the answer's `relation`s (review nit 3). `WeekSheet` works it out once and passes `kind` and `to` to `WeekTable`, so the line and the cells come from one value. An unknown today reads as past, the form that claims nothing about today. The sheet opens only once today is known, so this only satisfies the type.
- **The loading frame** of the average row is predicted from Sunday through `predictedNoTargets` (review nit 2).
- **`RangeAnswer`** in `lib/api/days.ts` is `Omit<DaySummaryList, "average"> & { average?: DaysAverage }`, so the fallback to `averageOfDays` is reachable while the shared schema keeps `average` required. Its test is `lib/api/__tests__/days.test.ts`.
- **The empty row's marker** is `data-week-average-empty`, so `[data-week-empty]` keeps meaning a day row.
- **The spoken text has the design's pauses.** The first build joined the `sr-only` parts with spaces, as the day cells do, and "average of 5 days in the range" could be heard as five days in the range (ui-validator m1). Each part after the figure now goes through `day.week.average.spokenPause` (", {part}"), so a cell reads "estimated 2013, average of 3 days before today, in the range". A cell with no figure reads "no days counted", with no leading pause. The day cells keep their space join: "2050 in the range" holds no count to misread.
- **The paint order is track, band, ring, ticks, dot.** The design drew both marks under the ticks. On a bound that left 1 to 1.5 pixels of the dot's hue each side of the tick, and at 320 the calories band (about 10.7 pixels) is barely wider than the ring, so nearly every in-range calories dot met a tick (ui-validator M1). Measured after the change, on persons whose Eaten average sits exactly on each bound: 18 to 24 pixels of the dot's hue show at every size and theme, against 2 to 8 in the old order, emulated in the same page. The ring stays under the ticks, so a bound shows through it and lines up with the seven rows above. The tick under the dot keeps 1 pixel above and below the dot, and the dot's 1 pixel surface edge sets it apart. Its centre is the bound, and the tick in Sunday's row sits straight above, so no extra edge was added. `Band` and `Ticks` in `Gauge.tsx` are drawn by both gauges (review m1), and a test compares their markup for the same range.
- **`markLeft` clamps a mark's centre to its radius.** The ring's radius is 5 pixels and the dot's 4 with its edge. Each sits beside the size classes that set it, in `MARK` in `Gauge.tsx` (review n1).
- **The average figures are semibold.** The row then reads as the week's summary. JetBrains Mono keeps one advance at every weight, and the column check below holds with it.
- **The targets line skips a change equal to the one before it** (ui-validator m2). `sameTargets` in `packages/types` is the one bound-for-bound comparison, used by `sharedTargets` and by `weekTargetsLine`. A change with the same four bounds as the previous change moves no band, so the line said something a person could not see.
- **Tests beyond the plan.** The new tests live in `WeekSheet.average.test.tsx`, beside the 537-line `WeekSheet.test.tsx`, whose old frame test counts the day rows' 14 frames. The frame test compares display classes too (`hidden`, `block`, `inline`, `flex`, `grid`, `contents`, `table-*`, `absolute`, `relative`), since a counted line switched to `hidden` passed a height-only comparison. Also: the `router.test.ts` description pin, the five `appRules.test.ts` sentence pins, the smoke check's `average` keys, the planned-only-past and no-estimate cases, `averageOfDays([])`, `averageOf([])` throwing, and a change that moves only the protein upper bound. Red runs: 13 of 14 sheet tests against the commit before the row (the first change's line was a pin). In the fixes, the DOM-order pin, the spoken pauses (5 tests), the targets line (3 tests) and the one-bound case (against a comparison that skips that bound) were each seen red first. The first build's mutations: the label in flow (1 red), `weekKind` never past (2), no "new" branch (2), the frame always drawn (1), the counted line `hidden` (2).
- **Measured on a production build.** The column check runs person a's current week, four weeks back and eight on, loading, failed, offline, persons with first targets mid-week, with no targets and with averages on the bounds, the `<tfoot>` removed from the DOM, and the label forced to "Average of every counted day" at 20 pixels: 276 pixels wide with the web fonts and 290 with the fallback face. It runs at 320 by 568, 375 by 667, 390 by 844 and 1280 by 800 with the web fonts, and at 320, 390 and 1280 with every `.woff2` request refused. Every head and every figure cell has the same x in all 23 states of each run. The first build's control, the forced label set `position: static`, moved every column, so the forced run tells the two apart. The sheet is 544 pixels tall at 320 by 568, 628 at 375 by 667 and 390 by 844, and 711 at 1280 by 800, with every row at the same y in every state, for a person with any targets change. A person with no targets has no targets line and a sheet 28 pixels shorter at 375 and 390, 32 at 1280.
- **At 320 by 568 the body scrolls 84 pixels**, against the 64 estimated above. The row's figures show above the footer as the sheet opens, and its gauges sit 12 pixels under it, cut at the footer's rule (ui-validator m3). The scroll is short and the cut marks read as content continuing, so it is left as it is.
- **`APP_RULES` is 6124 characters** of its 12 000, not the 7 700 estimated in "The app rules, exact text", which counted R1a's section 9. Whichever of R1a and this PR lands second sees the real figure through the test and re-stamps. Stamps are made after the formatter has run, since the formatter can rewrap a doc and change its hash.
- **Handed to Artur in `TODO.md`:** "No entries" means two things in the week. A week row of an empty today or future day says "No entries" while its Day tab shows distances, and an empty past row says the same words for "no position". "PR 1 as built" asked PR 2 to decide it. PR 2 left the rows as they are and filed the choice with its options, since it is a wording and product call.
- **Filed as ready to pick up:** the app rules sentence whose "so" does not follow, and the calories dot at 2.2 to 1 on the band in light.
