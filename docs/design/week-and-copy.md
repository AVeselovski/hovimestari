# Design: the week and copying entries (PR 3d)

Status: in review (round 2: the design review's findings applied, see "Review round 1, answered" at the end)
Branches: `feat/copy-entries` (backend now, web after the week), `feat/week-and-copy` (this doc, then the week)
Requested by: Artur, through the step 3 plan (`days-and-logging.md`, "Carried to PR 3d")

The last piece of build step 3. It replaces section f's `WeekView`, "Footing for PR 3d" and the PR 3d row of section j in `days-and-logging.md`. Where they disagree, this doc wins. It also replaces the week paragraph of `targets-from-their-date.md` (`:444`) where the two differ (section f, "Days without targets").

Code claims are checked against `origin/master` ca5c6f5, fetched 2026-11-18.

## 0. Product decisions the owner may want to shelve

| #   | Fork                                                                                                                                                                                                              | Recommendation, and why                                                                                                                                                                                                                                                                                      | Cost if flipped                                                                                                                                                |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.1 | The week is **a sheet opened by a Week button**, or **a second view of the Day tab** (`/?view=week`, the earlier doc's 0.9), or a page                                                                            | **A sheet.** The week is a way to read and pick days. As a view it needs the header to change meaning: the launcher has no day to log to, the chevrons step weeks, the date label names a week. A sheet leaves the Day tab's layout, its measured heights and its remembered day untouched                   | A `view` param in `DayTab`, a week bar in `DayHeader`, a hidden or retargeted launcher. `WeekTable` is reused as is                                            |
| 0.2 | The **Week button** sits **on the launcher's row**, after Log food, or **in the date bar row**, after the next-day chevron                                                                                        | **The launcher's row** (section f, "The Week button", with the widths). In the date bar it leaves the date label 128 px at 320, where "Wed 30 Dec 2026" needs 168, and sits 12 px from the next-day chevron, the most repeated press on the tab. The launcher has 100 px or more to spare at every width     | The button moves into `DateBar`. The date label then truncates in late December at 320                                                                         |
| 0.3 | The week runs **Monday to Sunday** holding the day shown, or **from the locale's first day**, or **seven days around the day shown**                                                                              | **Monday to Sunday.** Finland's week, the week a plan is made for, and a week that stays put while the day inside it changes. `Intl.Locale` week info is missing in Firefox                                                                                                                                  | `WEEK_START` in `lib/week.ts`, one constant. A rolling week rewrites `weekOf` and the title                                                                    |
| 0.4 | The two readings are named **"Eaten" and "Planned"** on every surface (the week's heads, the Day summary's spoken names), or **"Eaten" and "With plan"**, as built                                                | **"Eaten" and "Planned"** (orchestrator's call, after Artur's "'Planned' would be better"). One name per reading, one catalog key, used by both surfaces. "Planned" means everything on the day, eaten or still planned. It is stated once in the feature doc                                                | `day.reading.planned` back to "With plan". One string                                                                                                          |
| 0.5 | A copy **arrives planned** on every date, or **keeps its original's state** on today and past dates                                                                                                               | **Planned**, as the server already does (`copyEntries`, `writes/entries.ts:373`). An entry is eaten only when the person says so. A copy onto a past day therefore counts at once as never marked eaten (`unmarkedCount`, `reads/days.ts:49`), and Mark all eaten is one press away                          | A `status` field on the copy body, a state choice in the copy sheet for dates up to today                                                                      |
| 0.6 | Copying is **one sheet with the day's entries as a checklist**, opened by **Copy** in the Entries row, or that plus **Copy to another day** in the entry sheet                                                    | **One sheet, one opener.** Copying one entry and copying a day are one act with a different selection. A button in the entry sheet needs a second sheet over a form that refuses to close while edited (`FormSheet.tsx:210`), or a toast left hidden under it (`zToast` under `zSheet`, `styles.ts:229-231`) | A `Copy to another day` button in an unedited entry sheet that closes it and opens the copy sheet with that entry alone ticked. One prop on `CopyEntriesSheet` |
| 0.7 | Undoing a copy **removes the copies** through a new batch remove, or a copy has **no Undo**                                                                                                                       | **Undo**, with `POST /entries/remove`. Every other action on the Day tab offers Undo, and six entries copied to the wrong date would otherwise take twelve presses to take back. The assistant's remove of several entries uses the same service later                                                       | Drop the route, the service and its tests. The toast has no action                                                                                             |
| 0.8 | Defect found in passing: `afterEntryWrite` refreshes the ranges only after the answered days are in the cache (`lib/invalidation.ts:222-230`), so a cached week can show a day's old figures until its read lands | Fixed here (section e)                                                                                                                                                                                                                                                                                       | Part of this change                                                                                                                                            |

## 1. Requirements validation

Verdict: aligned, with gaps resolved by assumptions. One new wording for Artur, the rest already waiting in `TODO.md`.

| Requirement                              | How this design meets it                                                                                                                                                                                               | Note                                                                       |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| FR-DAY-03                                | Every week row shows both readings for calories and protein                                                                                                                                                            |                                                                            |
| FR-DAY-04, FR-TGT-07                     | A row of a day with targets has a mini gauge per macro, eaten solid and plan tinted, as the Day's. A day without targets has none                                                                                      | FR-DAY-04 wording waits in `TODO.md` ("Approve four requirement wordings") |
| FR-DAY-05                                | Add, edit, remove: built. Move: built, the entry sheet's Date (`EntrySheet.tsx:300-310`, `updateEntry` at `writes/entries.ts:143`). Copy to another day: the copy sheet                                                |                                                                            |
| FR-DAY-07                                | A copy carries its source's basis (`writes/entries.ts:364-376`)                                                                                                                                                        |                                                                            |
| FR-DAY-08                                | The week sheet: seven days, each day's totals and, on days with targets, its gauges                                                                                                                                    | Wording waits in `TODO.md`. No new text                                    |
| FR-DAY-10                                | Copies are planned (0.5)                                                                                                                                                                                               |                                                                            |
| FR-DAY-13                                | A past day's unmarked entries show as Planned above Eaten, and the row's cells say so to a screen reader                                                                                                               | A copy onto a past day is one of them (0.5)                                |
| FR-DAY-15                                | "≈" before each figure of a reading that includes an estimate                                                                                                                                                          |                                                                            |
| FR-AI-06, FR-AI-07, NFR-AI-02, NFR-AI-03 | The week reads `listDaySummaries`, the copy `copyEntries`, its undo `removeEntries`. The step 4 tools wrap the same three, as for every step 3 service (`TODO.md`, "Assistant tools arrive one step after the screen") | FR-AI-07 has no "copy": wording below                                      |
| NFR-ADV-01, NFR-UX-07                    | Positions only, no verdict words, no count of days with or without targets                                                                                                                                             |                                                                            |
| NFR-UX-02, 05, 06                        | Phone first, both overlays are `BottomSheet` and `FormSheet`, the Day tab's header and summary do not move                                                                                                             |                                                                            |

**The problem, stripped of the proposed mechanism.** A person planning or reviewing several days wants to see them side by side: which are planned, which are logged, where each stands against their own ranges, and to go to one. Seven presses on the chevrons show the same days one at a time and never together. And a person who eats the same thing on several days wants to put entries on another day without logging them again. The earlier mechanism for the first, a view of the Day tab, needs a retargeted launcher and a date bar that changes meaning: two workarounds, a stop signal. Its mechanism for the second, a button in the entry sheet, needs a stacked sheet over a form that refuses to close. Both problems stay. Both mechanisms change (0.1, 0.6).

**Changes proposed that were not asked for:** the batch remove (0.7) and the range patch (0.8), both Claude's calls (footer), and the reading rename (0.4), the orchestrator's call, put to Artur in section h.

**Requirements drift, proposed for Artur.** One new wording, added to `TODO.md` by the documentation step.

- **FR-AI-07** lists "add, change, move and remove entries". The screen copies entries, and NFR-AI-03 then requires a tool for it. Proposed: "The system shall let an assistant with a writing key add foods of the user's own, create and edit saved meals and recipes, add, change, move, copy and remove entries of every kind on days, as planned or as eaten, log a recipe as made, mark entries eaten, and change the user's targets."

## a) Overview

Two additions to the Day tab. A **Week** button after Log food opens a sheet with the Monday-to-Sunday week holding the day shown: a table of seven days, each with its Eaten and Planned figures for calories and protein and a mini gauge per macro, buttons to step a week, and each row a press that shows that day. A **Copy** button in the Entries row opens a form sheet with the day's entries as a checklist, all ticked, and a date to copy them to. Copies arrive planned and the toast offers Undo. The backend has the week's read and the copy. It gains one route, a batch remove.

## b) Components and responsibilities

### What exists

| Piece                  | Where                                                                                                          | State                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ---------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /days?from=&to=`  | `routes/days.ts:15-18`, `listDaySummaries` at `services/reads/days.ts:75-90`                                   | Built. Every date of the range as a `DaySummary`, no entries, up to 42 days (`MAX_DAY_RANGE`, `packages/types/src/days.ts:8`, refine at `:44`). One entries query and one targets query. `targets` and positions null on a day without targets (`reads/days.ts:27-28`). `getDay` and the range share `summaryOf`, and `Day` is `DaySummary` plus `entries` (`types/days.ts:20-35`). Pinned by `routes/__tests__/days.db.test.ts:133` |
| Move                   | `PATCH /entries/:id` with `date` (`routes/entries.ts:44-48`, `updateEntry` at `writes/entries.ts:143-178`)     | Built with its screen: the entry sheet's Date moves on Save, toast "Moved Rahka to tomorrow." with Undo (`useEntryActions.ts:298-345`, `dayWord` at `:286`). An eaten entry moved to a future date turns planned (`:157-158`)                                                                                                                                                                                                        |
| Copy                   | `POST /entries/copy` (`routes/entries.ts:38-42`, `copyEntries` at `writes/entries.ts:322-403`)                 | Built, no screen. Client ids. Ids held or in `removed_entries` are skipped (`:329-339`), so a retry after an undo adds nothing. Every column but id and position is copied, so a hidden source copies. Planned (`:373`). Answers only the target day (`:400`)                                                                                                                                                                        |
| Batch remove           |                                                                                                                | Missing. `removeEntry` takes one id (`writes/entries.ts:237-251`)                                                                                                                                                                                                                                                                                                                                                                    |
| Web reads and keys     | `lib/api/days.ts` (`getDay` only), `lib/api/entries.ts` (no copy), `queryKeys.dayRanges()` (`queryKeys.ts:41`) | No range read, no copy call. `afterTargetsChange` refetches inactive ranges too, since they will have a `queryFn` (`invalidation.ts:48-55`). `afterDayChange` and `afterTimeZoneChange` refresh every `["days"]` key                                                                                                                                                                                                                 |
| Gauge                  | `Gauge.tsx`, `gaugeGeometry.ts`                                                                                | One size. `MIN_BAND_PERCENT = 2` (`gaugeGeometry.ts:25`), sized for a 288 px track. Fills ease on any change (`Gauge.tsx:15-17,55`)                                                                                                                                                                                                                                                                                                  |
| Checkbox               |                                                                                                                | None in `apps/web`. `mobile-ui-lessons.md:111` lists finanssi's `Checkbox.tsx` as lift and adapt                                                                                                                                                                                                                                                                                                                                     |
| An entry's amount line | `useMeta()` in `EntryRow.tsx:37`                                                                               | Private to the row                                                                                                                                                                                                                                                                                                                                                                                                                   |

### Changed or new

| Component                                                         | Change         | Owns                                                                                                                                                                                         | Slice     |
| ----------------------------------------------------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| `apps/backend/src/services/writes/entries.ts`                     | modified       | `removeEntries(ctx, ids)`                                                                                                                                                                    | B-backend |
| `apps/backend/src/routes/entries.ts`                              | modified       | `POST /entries/remove`                                                                                                                                                                       | B-backend |
| `packages/types/src/entries.ts`, `results.ts`                     | modified       | `EntryRemoveManyBodySchema`, `EntryRemoveManyResultSchema`                                                                                                                                   | B-backend |
| `apps/web/src/lib/week.ts`                                        | new            | `WEEK_START`, `weekOf(date)` → `{ from, to }`, `stepWeek(from, n)`                                                                                                                           | A         |
| `apps/web/src/lib/localDate.ts`                                   | modified       | `formatWeekRange(from, to, today, locale?)`                                                                                                                                                  | A         |
| `apps/web/src/lib/api/days.ts`, `queryKeys.ts`, `queryOptions.ts` | modified       | `getDaySummaries`, `dayRange(from, to)` = `["days", "range", from, to]`, `dayRangeQuery`                                                                                                     | A         |
| `apps/web/src/lib/invalidation.ts`                                | modified       | `putDaysInRanges`, called inside `afterEntryWrite`                                                                                                                                           | A         |
| `apps/web/src/components/day/WeekSheet.tsx`, `WeekTable.tsx`      | new            | The sheet, the table, its frame                                                                                                                                                              | A         |
| `apps/web/src/components/day/Gauge.tsx`, `gaugeGeometry.ts`       | modified       | `size: "day" \| "mini"`, `minBandPercent` argument                                                                                                                                           | A         |
| `apps/web/src/components/day/DayTab.tsx`                          | modified       | The launcher row (launcher and Week), mounts `WeekSheet` (A), mounts `CopyEntriesSheet` (B-web)                                                                                              | A, B-web  |
| `apps/web/src/components/day/DaySummary.tsx`                      | modified       | Its spoken names read `day.reading.*`                                                                                                                                                        | A         |
| `apps/web/src/components/ui/Checkbox.tsx`                         | new, lifted    | Finanssi's `Checkbox` (`origin/master:apps/web/src/components/ui/Checkbox.tsx`), with `indeterminate`, re-skinned to the token recipes: accent when ticked, `field-rule` border, `focusRing` | B-web     |
| `apps/web/src/components/day/entryMeta.ts`                        | new, extracted | `useMeta` from `EntryRow.tsx`, shared by the row and the checklist                                                                                                                           | B-web     |
| `apps/web/src/components/day/EntryList.tsx`                       | modified       | Copy, grouped with Mark all eaten                                                                                                                                                            | B-web     |
| `apps/web/src/components/entries/CopyEntriesSheet.tsx`            | new            | The copy form, its id map                                                                                                                                                                    | B-web     |
| `apps/web/src/hooks/useCopyActions.ts`                            | new            | `copy(pairs, toDate)`, its Undo, the superseded-id removal. Composed into `useEntryActions` as `useAddActions` is, so that file stays under 500 lines (397 now)                              | B-web     |
| `apps/web/src/hooks/entryActions.ts`                              | modified       | `chunksOf<T>` generic (`:106` takes `string[]`)                                                                                                                                              | B-web     |
| `apps/web/messages/en.json`                                       | modified       | Section f's copy                                                                                                                                                                             | A, B-web  |

## c) Data model

No change. `removeEntries` writes `removed_entries` rows exactly as `removeEntry` does.

## d) API interface

All under `/api/v1`, Bearer, refusals `{ message, code }`.

| Method | Path              | Body                                                           | Answer                                                                                                   |
| ------ | ----------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| GET    | `/days?from=&to=` |                                                                | Unchanged. 200 `{ days: DaySummary[] }`                                                                  |
| POST   | `/entries/copy`   | Unchanged. `{ toDate, entries: [{ sourceId, id }] }`, 1 to 100 | Unchanged. 201 `{ entries, days, outcome }`, 200 `replayed`. 404 `entry_not_found`, 409 `entry_id_taken` |
| POST   | `/entries/remove` | **New.** `{ entryIds: uuid[] }`, 1 to 100, unique              | **New.** 200 `{ removedIds, days }`. 400 `invalid_request`                                               |

```ts
// packages/types/src/entries.ts
/** `POST /entries/remove`: the entries to remove, such as the copies an Undo takes back. */
export const EntryRemoveManyBodySchema = z.object({
  entryIds: z.array(z.uuid()).min(1).max(MAX_ENTRY_BATCH).refine(uniqueIds, { error: "invalid_request" }),
});
export type EntryRemoveManyBody = z.infer<typeof EntryRemoveManyBodySchema>;

// packages/types/src/results.ts
/** What `POST /entries/remove` answers: the entries it removed, in day and position order, and their days. */
export const EntryRemoveManyResultSchema = z.object({ removedIds: z.array(z.uuid()), days: z.array(DaySchema) });
export type EntryRemoveManyResult = z.infer<typeof EntryRemoveManyResultSchema>;
```

**The contract of `POST /entries/remove`:**

- It removes each listed entry that is the user's and still there, whatever happened to it since it was made: edited, marked eaten, moved, by this device, another device or an assistant. Ids that are missing or another user's are skipped, as `POST /entries/status` skips them.
- Each removed entry goes to `removed_entries` and stays restorable for ten minutes by `POST /entries/:id/restore`, as a single removal does. A later copy or add with its id adds nothing (`writes/entries.ts:329-339`).
- A repeat answers 200 `{ removedIds: [], days: [] }`, outcome `unchanged` for `statusOf`. A first call that removed any answers outcome `deleted`, also 200.
- `removedIds` is sorted by date, then by `position` as an integer (`(row->>'position')::bigint`, never the text), then by id.
- `days`: each distinct date it removed from, read by `getDays` (`reads/days.ts:93-95`) after the write, in date order.
- The route is a fixed path among the `/entries` routes. Nothing else answers `POST /entries/:id`, so its order is free.

`removeEntries` is one transaction: `lockUserForWrite`, `purgeExpired`, then `removeEntry`'s statement with `= ANY(ids)` for `=`, returning id, date and position.

**Services, the one contract the screen and the step 4 tools share:**

| Service                                 | REST                   | Step 4 tool                  |
| --------------------------------------- | ---------------------- | ---------------------------- |
| `listDaySummaries(ctx, { from, to })`   | `GET /days`            | The days tool's range read   |
| `updateEntry(ctx, id, { date })`        | `PATCH /entries/:id`   | Move                         |
| `copyEntries(ctx, { toDate, entries })` | `POST /entries/copy`   | Copy. The tool mints the ids |
| `removeEntries(ctx, ids)`               | `POST /entries/remove` | Remove one or several        |

## e) Data flow

**Opening the week.** Week → `WeekSheet` opens with `weekOf(shownDate)` → `useQuery(dayRangeQuery(from, to))`. The Day tab reads the shown week ahead once its day is on screen, beside the neighbour days (`DayTab.tsx:116-120`), so the sheet usually opens with figures. The sheet's buttons set its own week, `stepWeek(from, ±1)`, and it reads the weeks before and after ahead. The day behind does not change until a row is pressed.

**Picking a day.** A row → the sheet closes and `DayTab`'s `go(date)` runs (`DayTab.tsx:137-139`): `router.replace`, so `rememberShownDay` follows and Back still leaves the tab. Focus returns to the Week button.

**Freshness.** `dayRangeQuery` is fresh for 30 seconds (`STALE.live`) and read again on show and reconnect, as `dayQuery` is. Inside `afterEntryWrite`, after its day keys are set (`invalidation.ts:212-213`) and before its `settled` refresh, `putDaysInRanges(client, days, oldZone)`:

1. Cancels every read under `dayRanges()`, so a read that left before the write cannot answer after the patch and write the older week over it. In TanStack Query 5.107 a cancel does not undo the patch: a manual `setQueryData` becomes the state a cancel returns to. The hazard is an _unobserved_ range (the Day tab's week read ahead, the sheet's neighbour prefetches): `invalidateQueries` does not read it again, so its old answer would land over the patch and then count as fresh. An observed range is safe either way, because invalidate refetches it with `cancelRefetch`. Inside `afterEntryWrite`, `refresh` also cancels `dayRanges()`, but only after `putDaysInRanges` returns. The patch's own cancel closes that gap, and keeps `putDaysInRanges` safe when called outside `afterEntryWrite`. Mutations: either cancel alone keeps the unobserved test green, both removed turn it red, and the `AbortSignal` test turns red without the patch's own cancel.
2. Does nothing more when `oldZone` (`:211`): those days belong to the old zone and are read again.
3. Writes each answered day, without `entries`, into every cached range that holds its date, through `setQueriesData({ queryKey: dayRanges() }, updater)`. A range with no data is left alone: the updater returns `undefined`.

The `settled` refresh then reads the ranges again, as today. So a week's row for a day equals that day's summary from the moment a write answers. A range answer moves no "today": `todayOf` reads a top-level `today` (`TodayProvider.tsx:63-67`), and `{ days }` has none. The week labels today from `useToday()`.

> **Assumption:** a change made on another device reaches the week on its own read (show, reconnect, 30 seconds), as it reaches a day. Flip: write each `dayQuery` answer into the ranges too, one call in its `queryFn`.

**Copying.** Copy → `CopyEntriesSheet` opens with the shown day's entries (the day on screen) all ticked, and To set to the day after the shown day, or today when the shown day is in the past. Copy → `useCopyActions.copy` → `counted([toDate], …)` → `POST /entries/copy` with the ticked entries in day order, in chunks of 100 → `afterEntryWrite(days)` → the sheet closes → toast "Copied 3 entries to Wed 18 Nov." with Undo. Undo → `POST /entries/remove` with every id this open of the sheet sent → `afterEntryWrite(days)`. Missing ids are skipped, so Undo is done when it answers.

**The copy's ids belong to the sheet.** They are not `pendingIds`. `pendingIds` lets an id go after 60 seconds (`PENDING_ID_LIFE_MS`, `pendingIds.ts:34`) and whenever a day answer holds it (`forgetSeen`, run by every `dayQuery` read, `queryOptions.ts:107`). The default To is often the day the tab reads ahead (`DayTab.tsx:119`), so a copy that landed but got no answer would lose its ids to that read, and the next press would copy again.

- The sheet keeps a `Map` from `toDate|sourceId` to an id for as long as it is open. It mints an id the first time a pair is sent. A fresh open is a fresh map (`useSheetTarget` keys each open).
- It keeps the set of every id it sent in this open.
- **Copy again after "Could not confirm."**, with nothing changed: the same ids. The server adds what did not land and answers the rest as `replayed`.
- **Copy after changing To or the selection:** the new pairs get new ids. Once that send succeeds, every id sent earlier in this open and not in the final send is removed with `POST /entries/remove`, before the toast shows. So an earlier send that did land, to the old date or for an entry since unticked, leaves nothing behind.
- **That cleanup fails** (offline, a timeout, a fault): the toast still says the copy, since the copy succeeded. The days the stale ids were sent to are read again, so any copy that did land shows on its day. The toast's Undo still removes every id sent in this open, the stale ones included.
- **Cancel after "Could not confirm."**: the sheet closes, and the day its last send went to is read again, so whatever landed shows there.

**States.** Copies are planned on every date. An estimate stays an estimate, with its note. A saved meal entry keeps its count and the figures its source entry stores, also when the meal was edited, archived or deleted since. A food entry keeps its grams and portion. Copies go after the target day's entries, never in place of them.

## f) Frontend architecture

### The Week button

**Placement: on the launcher's row, after Log food.** `[ Log food ............ ] [ Week ]`. `btnSecondary`, which is 48 px tall like the launcher field, label "Week", accessible name the same visible word, "Week" (`aria-haspopup="dialog"`), so a voice user can say what they see (fix batch after review). Measured with the app's own fonts (fontTools on the `woff2` files, at the rendered sizes): "Week" in Instrument Sans 600 at 16 px is 44.6 px, so the button is about 85 px with `px-5`. Gap 12 px.

| Width                      | Page column | Launcher field | "Add to plan" with its icon |
| -------------------------- | ----------- | -------------- | --------------------------- |
| 320                        | 288         | 191            | 131 (14 + 20 + 12 + 84.5)   |
| 375                        | 343         | 246            | 131                         |
| 390                        | 358         | 261            | 131                         |
| from `lg`, a 492 px column | 492         | 395            | 131                         |

The date bar keeps its three parts and its centred label (184 px at 320, where "Wed 30 Dec 2026" in Fraunces 500 at 20 px is 168 px). The other placement, in the date bar row after the next chevron, leaves the label 128 px, so that date truncates, moves the label 28 px off centre, and sits the button 12 px from the next-day chevron, pressed more than anything else on the tab.

Rules it keeps:

- **The header does not change height.** The launcher's row is 48 px with or without the button, so `--day-header-height` (`globals.css:177`, and `:202` from `md`) stays. From `lg` the launcher's row is the header's right column, and it stays 48 px.
- **Across states it never moves and never changes.** Its label is the same on today, past and future days, so beside "Add to plan" it reads the same as beside "Log food". It shows while today is unknown, `aria-disabled`, as the launcher is. Loading, a failure, offline and a new day leave it where it is.
- **Focus.** It is the sheet's `returnFocusTo`, so focus comes back to it when the sheet closes by a row, Escape, the backdrop or a swipe (lesson 9).
- It sits outside the `launcherRef` element, because `focusAfterRowRemoval` falls back to the first button inside it (`DayTab.tsx`, the `EntrySheet` mount).

### The week sheet

`BottomSheet`, `size="auto"`, with a visible title and a footer. Below `md` it holds the height it opened at (`useHeldSheetHeight`) and from `md` its dialog grows downwards only (`useAnchoredPanel`, `BottomSheet.tsx:129-133`), so a line that appears scrolls the body or extends the dialog and never moves the table.

**Title:** the week, from `formatWeekRange`, one line, with `titleClassName="whitespace-nowrap max-md:text-xl"` on top of `sheetTitle` (raised from `text-lg` in the fix batch: the longest title, en-US "Dec 28, 2026 to Jan 3, 2027", measured 257.9 of 280 px at 20 px). `formatWeekRange` formats with `Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: "UTC" })`, plus `year: "numeric"` when either end is not in today's year, through `formatRangeToParts`, and replaces the shared literal that separates the two ends with the catalog's " to ". So it keeps the locale's order and puts no dash on screen. Forms, measured in Fraunces 500 at 18 px against the title's 280 px at 320:

| Week       | en-GB                       | Width | en-US                              |
| ---------- | --------------------------- | ----- | ---------------------------------- |
| One month  | "16 to 22 Nov"              | 105   | "Nov 16 to 22"                     |
| Two months | "30 Nov to 6 Dec"           | 134   | "Nov 30 to Dec 6"                  |
| Two years  | "28 Dec 2026 to 3 Jan 2027" | 225   | "Dec 28, 2026 to Jan 3, 2027", 234 |

**Footer:** "Previous week" and "Next week", two `btnSecondary` side by side, each half the row, with their chevrons. In the footer they are in reach of the thumb and the title gets the full width. Stepping keeps focus on the pressed button.

**Body:** `WeekTable`, a real `<table>` with an `sr-only` caption, the title again. Under it, the targets line when it shows ("Days without targets" below).

| Column   | Head, row 1                        | Head, row 2        | Cell                                                                                                                                                    |
| -------- | ---------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Day      |                                    |                    | Two lines: the weekday short ("Mon", `text-xs`) or "Today", over the day of the month (`text-sm`, semibold). A `<th scope="row">` with the row's button |
| Calories | "Calories" over its two columns    | "Eaten", "Planned" | kcal, `font-mono text-sm`, right-aligned, bare values                                                                                                   |
| Protein  | "Protein (g)" over its two columns | "Eaten", "Planned" | grams with one decimal, the same                                                                                                                        |

Under each macro's two figures, the macro's mini gauge across both columns. The group heads give the noun and the unit, and the inner heads are the same two names for both macros.

**Widths at 320.** The body is 280 px (`--sheet-pad-x: 1.25rem`, `globals.css:190`). Columns size to their content. Measured: "Today" (`text-sm` 600) 41.7, "≈8888" (mono 14 px) 42.0, "Planned" (`text-xs` 600) 46.8, "≈888.8" 50.4, "Eaten" 33.3, "Calories" 46.5, "Protein (g)" 62.3. Gaps: 12 after the day column, 8 inside a group, 12 between groups.

**Column widths (fix batch).** The day column is fixed, `w-12 md:w-20` (48 px, 80 from `md`), wider than "Today" at every size. An auto-width day column moved the figure columns 11 px from `md` between the week holding today and the others. The four figure columns take no width of their own and share the spare width by their content, so the gauges take it: at 390 the gauges are 143 and 159 px, at 320 110 and 122, and the table stays 280 at 320. Measured: heads at the same x across three weeks, and loading to loaded to failed, at 320, 390, 768 and 1280.

| Day  | gap | Cal. Eaten | gap | Cal. Planned | gap | Prot. Eaten | gap | Prot. Planned | Total |
| ---- | --- | ---------- | --- | ------------ | --- | ----------- | --- | ------------- | ----- |
| 41.7 | 12  | 42.0       | 8   | 46.8         | 12  | 50.4        | 8   | 50.4          | 271.3 |

**"Planned" fits its column on one line at 320 at `text-xs`**, so every head is one line and no two-line head is needed. 8.7 px are left. A five-digit kcal figure ("≈10000", 50.4) adds 8.4 to its column and still fits (279.7). From `md` the figures are `text-base` in a `md:max-w-lg` dialog.

> **Fallback, if A3 measures a column over its room:** two columns, Calories and Protein. Each cell stacks Eaten over Planned, each with its head word, and the mini gauge under them, about 120 px per macro, same 44 px row plus one line. Never a type size outside the tokens, a shorter reading name, a sideways scroll or a second layout.

**A row's states.** Every row is 44 px (the two-line day label sets it, and a row is a 44 px target). Figures are ink. Nothing turns a colour past a bound.

| State                         | Figures                                                                                                                                                                                                                                                                                 | Gauge room                                  |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| Targets, entries              | Both readings                                                                                                                                                                                                                                                                           | Two mini gauges                             |
| Targets, no entries           | "No entries", muted, across the four figure columns                                                                                                                                                                                                                                     | Band and ticks, no fill                     |
| A day before the first change | Both readings, or "No entries"                                                                                                                                                                                                                                                          | Empty. The line under the table explains it |
| A user with no targets at all | Both readings, or "No entries"                                                                                                                                                                                                                                                          | None                                        |
| Estimate in a reading         | "≈" before that reading's two figures                                                                                                                                                                                                                                                   |                                             |
| Past, planned never marked    | Planned above Eaten, as stored                                                                                                                                                                                                                                                          | The tinted plan segment                     |
| Today                         | "Today" in place of the weekday                                                                                                                                                                                                                                                         |                                             |
| Future                        | Eaten 0, Planned the plan                                                                                                                                                                                                                                                               |                                             |
| The day shown on the Day tab  | A 3 px accent bar at the row's start, `aria-current="true"` (ARIA's `"date"` means today, and another row is "Today")                                                                                                                                                                   |                                             |
| Loading                       | The frame: day labels, heads, empty figure cells, empty tracks with no band (`GaugeFrame size="mini"`, in `--color-gauge-track-on-surface`, the page colour, because `--color-gauge-track` equals the sheet's surface)                                                                  | Same height                                 |
| Failed or offline             | The frame, and a notice over rows 3 to 5 exactly (`top-33.75 h-33`, `md:top-39.75 md:h-39`: the head's stated height, `h-6.25` + `h-5.5` and `md:h-7.25` + `md:h-6.5` on its two rows, plus two rows): "This week did not load." with **Try again**, or "This week needs a connection." | Same height                                 |

**Days without targets.** One line under the table, the Day's own `day.summary.targetsFrom`, "Targets apply from 18 November 2026.", in `text-xs` muted, shown once when the week holds a day before the first change and the user has changes. Its date is the first change's (`predictedNoTargets`, `noTargets.ts:27-30`). A row whose day answers without targets while the cached changes say otherwise keeps its room empty and adds nothing to the line, as the Day does (`loadedNoTargets`, `:38-41`). The line is 213 px at 320, one line. Its text appears only in the week the targets start in and the weeks before it. For a user with any change, the `<p>` renders in every week, `invisible` and `aria-hidden` where it has nothing to say, with `min-h-4 md:min-h-5`, so the held height always includes it (fix batch: a sheet opened on a week without the line and stepped back hid the line under the footer).

For a user with no targets at all: no gauges, no line, and no **Set targets** in the week. The Day tab's summary carries Set targets in slice 2 (`targets-from-their-date.md`, section f, "A user with no change at all"), one press from the week, and the week's job is reading days. A second Set targets in the week would be a second way into the first run from a surface that is not about targets, and a repeat of an offer the neutrality standard keeps to one place (`targets-from-their-date.md:326`). This reads as intended: the week of such a user is figures only, the same every week. Slice 2 is in progress on `origin/feat/targets-none-allowed`, its web not yet landed. The week uses its "no changes" kind when it lands.

This replaces `targets-from-their-date.md:444` where they differ: the line goes under the table rather than above the rows, so the first figures sit in the same place in every week, and the no-targets user gets no Set targets in the week, for the reason above. Rows keeping the gauge's height, and no range-less gauge, stay as that paragraph planned.

**Accessibility.** The table carries the readings: each figure cell holds its figure and, `sr-only`, the reading's position ("in the range", "below the range", "below the floor" for protein below, "above the range") on days with targets, and "estimated" before an estimate's figure. A past day's Day cell adds, `sr-only`, "2 planned entries never marked eaten." The row's button is named by the date alone ("Monday 16 November", "Today, Wednesday 18 November"), so table navigation reads the cells and the button does not repeat them.

**The row button.** A `<button>` in the Day cell, stretched over the row with `after:absolute after:inset-0` against a `relative` `<tr>`. WebKit has ignored `position: relative` on table rows, so A3 checks the press target covers the whole row in WebKit. Fallback: the stretched element positioned against the table's wrapper with the row's measured top, or a grid with `role="table"` roles.

**Focus and keyboard.** On open, focus goes to the shown day's row button through its `autoFocus`, which Base UI keeps (`BottomSheet.tsx:442-445`: the Popup's `initialFocus` skips a sheet whose focus is already inside). Tab: the seven rows, then Previous week, Next week. Escape and the backdrop close with no change.

**Mini gauge.** `Gauge size="mini"`: track 6 px, ticks 10 px tall, protein's lower tick 2 px. `gaugeGeometry(range, eaten, withPlan, { minBandPercent: 6 })`: 6 % of a 105 px track keeps the two ticks apart, where 2 % would overlap them. The scale still depends on the targets alone, so two rows with the same targets put their ticks at the same x. Each gauge is keyed by its date, so stepping weeks paints new gauges with no motion. The hue classes stay in `Gauge.tsx`, so the hue allowlist test (`components/figures/__tests__/macroHues.test.ts`) needs no new file. The plan's 1.5 px borders leave a 3 px tint in a 6 px track. A3 checks eaten and plan are told apart in both themes. The heads name the readings either way.

**Heights, estimates for A3 to measure.** Below `md`: handle 14, title row 44, body gap 12, heads 36, rows 7 × 44 = 308, end gap 12, footer 81. About 507 at every phone width, and 535 with the targets line. At 320 × 568 the sheet's room is about 520, so with the line the body scrolls by about 15 px and the footer stays. From `md`, rows of 52: about 600 in the dialog.

### Copy in the Entries row

**Copy**, a `btnText`, at the end of the 44 px Entries row (`EntryList.tsx:46`), on any day with entries, future days included. `dayEntriesHead` is `justify-between` (`styles.ts:106`), so Mark all eaten and Copy sit in one `flex gap-4` group at the row's end, Copy last. Mark all eaten leaves when pressed (`EntryList.tsx:31,50`), and Copy stays where it is. At 320: "ENTRIES" (`section-label`) about 70, Mark all eaten 105, gap 16, Copy 40: about 231 of 288. Held while `holding`. Offline, a press opens the sheet, and Copy there says "You are offline. Changes need a connection." in the sheet's line, as every form sheet does.

### The copy sheet

`FormSheet`, title "Copy entries".

1. **To**, a `NativeDateInput`. The day after the shown day, or today when the shown day is in the past: "copy last Tuesday's breakfast" almost always means today. Its line, always: "Each copy is a planned entry."
2. **Entries**: "All entries", a tri-state `Checkbox`, then one row per entry with its `Checkbox`, its name, its amount line (`entryMeta.ts`) and its calories, in the day's order, all ticked at open. Each row is a 44 px `<label>`. A ticked box is the accent. More than six rows scroll inside the body.
3. Footer: Cancel, **Copy**, busy "Copying…" through `StableLabel`.

Refusals: nothing ticked, on Copy: "Choose at least one entry." in the checklist's line, nothing sent. `entry_not_found` (an entry removed on another device): `errors.entry_not_found`, "This entry is no longer there.", in the footer's line, and the shown day is read again so the checklist shows what is left. `dirty` is a changed date or selection, so a changed sheet refuses a swipe, as every form sheet does. Copying to the shown day itself adds the copies after the originals.

Toast: "Copied {count, plural, one {# entry} other {# entries}} to {day}." with Undo, `{day}` from `dayWord`. Undo does not wait for `holding`.

### Copy, every string a catalog entry

| Key                                                                   | Copy                                                                                                                                        |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `day.reading.eaten`, `day.reading.planned`                            | "Eaten", "Planned". Replace `day.summary.eaten` and `day.summary.withPlan`, so the Day's spoken names and the week's heads are one key each |
| `day.reading.energy`                                                  | "Calories". Replaces `day.summary.energy` for both surfaces                                                                                 |
| `day.launcher.week`                                                   | "Week"                                                                                                                                      |
| `day.week.to`                                                         | " to ", the separator `formatWeekRange` puts between the two ends                                                                           |
| `day.week.previous`, `next`                                           | "Previous week", "Next week"                                                                                                                |
| `day.week.protein`                                                    | "Protein (g)"                                                                                                                               |
| `day.week.today`                                                      | "Today"                                                                                                                                     |
| `day.week.empty`                                                      | "No entries"                                                                                                                                |
| `day.week.failed`, `offline`, `retry`                                 | "This week did not load.", "This week needs a connection.", "Try again"                                                                     |
| `day.week.spoken.*`                                                   | The position words, "estimated", the unmarked count, the row's date                                                                         |
| `day.summary.targetsFrom`                                             | Reused as is                                                                                                                                |
| `day.list.copy`                                                       | "Copy"                                                                                                                                      |
| `entries.copy.title`, `to`, `toHint`, `all`, `none`, `submit`, `busy` | "Copy entries", "To", "Each copy is a planned entry.", "All entries", "Choose at least one entry.", "Copy", "Copying…"                      |
| `toast.copied`                                                        | "Copied {count, plural, one {# entry} other {# entries}} to {day}."                                                                         |

The judgement-word test (`days-and-logging.md` section f) covers the new keys.

## g) Constraints and decisions

- Every overlay is `BottomSheet` or `FormSheet`. The week sheet holds no field, so it is not a form sheet.
- A toast sits under every sheet. A copy's toast shows once its sheet has closed.
- The Day tab's header, summary and entries keep every measured height. The two new controls sit in rows of fixed height.
- The web never computes a reading. The range patch only copies a server answer into a second key.
- Native date input for To (owner rule).
- Type sizes come from the existing scale only (`text-xs` is the smallest).

### Rejected alternatives

| Alternative                                               | Why it was rejected                                                                                                                                                                             |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A week view of the Day tab, `/?view=week`                 | The header changes meaning: a launcher with no day, chevrons that step weeks, a label that names a week. Two workarounds                                                                        |
| The Week button in the date bar row                       | The date label drops to 128 px at 320 and truncates "Wed 30 Dec 2026" (168 px) in the week planned across New Year, moves 28 px off centre, and the button sits 12 px from the next-day chevron |
| An icon-only Week button                                  | The week's only way in, with nothing saying what it is, beside a tab bar whose Day icon is already a calendar                                                                                   |
| The week buttons in the title row, `[<] title [>]`        | The title gets 176 px at 320, and "28 Dec 2026 to 3 Jan 2027" is 225 at 18 px                                                                                                                   |
| A week strip of seven cells under the date bar            | 41 px a cell at 288. No totals fit, and every day pays a row                                                                                                                                    |
| A page `/week`                                            | Its own header, scroll memory and way back, for a read that ends in a jump to a day                                                                                                             |
| "Targets apply from" in every row before the first change | Repeats the same fact up to seven times. The held sheet already absorbs one line                                                                                                                |
| Set targets in the week for a user with no targets        | A second offer of the first run, on a surface about days. The Day tab has it, one press away                                                                                                    |
| Cards per day, "Calories 1240 · 1980" on two lines        | About 96 px a day, 672 a week: a scroll on every phone, and no column to read down the week                                                                                                     |
| "Copy to another day" in the entry sheet                  | A sheet over a form that refuses to close while edited, or a toast hidden under it                                                                                                              |
| Copy ids in `pendingIds`                                  | Lost after 60 s and on any read of the target day, so a landed copy could be copied again                                                                                                       |
| Copy re-reads its source's current values                 | Rejected in the step 3 review: a day with a deleted meal fails to copy, and the basis gains a second write point                                                                                |
| Undo by one `DELETE` per copy                             | Up to 100 requests and transactions, with partial failure to report                                                                                                                             |
| Moving several entries at once                            | Not asked for. A day moved is a copy and a removal                                                                                                                                              |
| A week total or average row                               | Not asked for                                                                                                                                                                                   |
| Shrinking the table's type below `text-xs`                | Not a token. The two-column fallback keeps the type                                                                                                                                             |

### Non-questions

- Settled by the targets model: a day before the first change shows figures only, and no-targets copy stays neutral. Where this doc places the line differs from `targets-from-their-date.md:444`, said above.
- Settled by the step 3 review: a copy copies the basis, totals are sums of rounded rows, a gauge's scale depends on targets only.
- Settled by `CLAUDE.md`: no verdict colours, accent for selection, native date input, every string in the catalog.
- The range read needs no change: seven days are one request.

### What it costs, and what is cut

- **The smallest honest version is this one.** Without the mini gauges the week shows totals but not "against the targets", so they stay. Without Undo the copy breaks the one-undo-surface rule. Cut: distances, week totals, actions inside the week.
- **The phone is the risk, not the backend.** One route on the backend. The table at 320 measures 271 of 280 px, with the two-column fallback named.
- **The Day tab pays nothing in height.** Both additions sit in rows of fixed height, and Log food loses about 97 px of width it does not use.
- **A fuller version** would add week totals and averages, copying a whole week, and marking a past day's planned entries from its row. None is asked for.

## h) Open questions and risks

For Artur. Each has the default the build follows.

1. **The week as a sheet, opened by a "Week" button beside Log food** (0.1, 0.2).
   > **Assumption:** as designed. Flip: the button moves into the date bar, or the table becomes a view.
2. **Copies always arrive planned, also on today and past days. A copy onto a past day then shows at once among "planned entries never marked eaten"** (0.5).
   > **Assumption:** planned. Flip: a status in the copy body and a state choice in the sheet.
3. **The second reading's name, on the week and the Day, spoken and shown: "Planned" or "With plan".** Folded into the existing `TODO.md` item "The Day summary's two columns have no visible names" as one question: "The second figure is everything eaten plus everything still planned. 'Planned' on the week's heads and in the Day's spoken names, or 'With plan'?"
   > **Assumption:** "Planned". Flip: one string.
4. **Copying one entry is the copy sheet with "All entries" off and that entry ticked, two presses, with no button in the entry sheet** (0.6). Screenshots show this path.
   > **Assumption:** one opener. Flip: the entry sheet's button, one prop.
5. **FR-AI-07 gains "copy"** (section 1).
   > **Assumption:** the step 4 tools include copy, as NFR-AI-03 requires either way.

> **Assumption, a consequence of 0.4:** "Planned" names a reading that includes what was eaten, while "planned" also names an entry's state. On a day with nothing planned, Planned equals Eaten. The feature doc defines the reading once ("Planned: everything on the day, eaten or still planned"), and every sentence that uses the reading's name is checked against that definition. The API field stays `withPlan`. Flip: one string.

> **Risk:** the targets model's slice 2 web (`origin/feat/targets-none-allowed`) edits `DayTab.tsx`, `DaySummary.tsx`, `DateBar.tsx` (focus on return to the date button) and `noTargets.ts`, and adds the "no changes" kind the week's frame needs. Slice A starts after it merges (section j).

> **Risk:** the table at 320 has 8.7 px to spare. A3 measures it on a production build. The fallback is named above.

> **Risk:** WebKit and the stretched row button (section f). A3 checks it.

## i) Docs

- `docs/features/days.md`: "The two totals" names the readings Eaten and Planned and defines Planned once. "The week" gains what the week shows and the Monday start.
- `docs/features/quick-logging.md`: "Copying entries" gains the screen, Undo by removal and the superseded-id rule. The API table gains `POST /entries/remove` with its contract. Its "Copying entries has no screen" gap goes.
- `docs/app/day.md`: the summary's spoken names (Planned), the Week button on the launcher's row, a new "### The week" (the sheet, the table, its states, focus), Copy in the Entries row, a new "### The copy sheet", the copied toast in Undo, measurements.
- `docs/features.md`: Days, "The week is in the API only." becomes "The week sheet on the Day tab shows seven days side by side." Quick logging, "Copying is in the API only." becomes "Copying entries to another day is on the Day tab."
- Link map: new homes "the week sheet" at `app/day.md#the-week` and "the copy sheet" at `app/day.md#the-copy-sheet`. "the two totals, eaten, with plan" becomes "eaten, planned".
- `apps/backend/README.md`: `POST /entries/remove`.
- `TODO.md`: the FR-AI-07 wording under "Needs a decision from Artur". The Day summary column-name item gains question 3. The "next day's read ahead" item notes the week read ahead has the same 5 minute life.

## j) Implementation plan

Three parts on two branches. Each part names the files it may touch. A file not listed is out of scope for that part.

### B-backend: the batch remove (`feat/copy-entries`, cut from `master` now)

Starts now. Touches nothing the other work touches.

Files: `apps/backend/src/services/writes/entries.ts`, `apps/backend/src/routes/entries.ts`, a new `apps/backend/src/routes/__tests__/entriesRemove.db.test.ts`, `packages/types/src/entries.ts`, `packages/types/src/results.ts`, `packages/types/src/index.ts`, `packages/types/src/__tests__/`, `apps/backend/README.md`, the API table in `docs/features/quick-logging.md`.

| Step | Agent                    | Invoked by       | Exit check                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ---- | ------------------------ | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1   | backend-engineer         | orchestrator     | DB tests: removes only the user's ids and skips another user's and missing ones; removes an entry edited, marked eaten or moved since; writes rows `restoreEntry` restores exactly; answers one day per distinct date in date order and `removedIds` ordered by integer position (positions 9 and 10 on one day); a repeat answers 200 with empty lists; a `POST /entries/copy` retried after its copies were removed answers `replayed` and adds nothing; 101 ids and a repeated id answer 400 |
| B2   | validator, then reviewer | backend-engineer | Pass. No open critical or major                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

It can open its own PR, or wait for B-web on the same branch. The orchestrator decides. Either way it merges before B-web.

### A: the week (`feat/week-and-copy`, after targets slice 2 has merged, rebased on `master`)

Starts when `feat/targets-none-allowed` has merged, because both edit the Day tab's header and its no-targets states.

Files: `apps/web/src/lib/week.ts` (new), `lib/localDate.ts`, `lib/api/days.ts`, `lib/queryKeys.ts`, `lib/queryOptions.ts`, `lib/invalidation.ts`, `components/day/WeekSheet.tsx` and `WeekTable.tsx` (new), `components/day/Gauge.tsx`, `gaugeGeometry.ts`, `components/day/DayTab.tsx` (the launcher row, the `WeekSheet` mount, the week read ahead), `components/day/DaySummary.tsx` (the `day.reading.*` keys only), `messages/en.json`, their `__tests__/`, `docs/app/day.md`, `docs/features/days.md`, `docs/features.md`, `docs/design/link-map.md`, `TODO.md`.

| Step | Agent                    | Invoked by   | Exit check                                                                                                           |
| ---- | ------------------------ | ------------ | -------------------------------------------------------------------------------------------------------------------- |
| A1   | frontend-engineer        | orchestrator | CI green. Tests below                                                                                                |
| A2   | validator                | the engineer | Against section 1. Pass, at most 2 fix cycles                                                                        |
| A3   | ui-validator             | validator    | Production build, Chromium 320×568, 375×667, 390×844, 1280×800, WebKit 390×664 if present, both themes. Checks below |
| A4   | reviewer                 | ui-validator | No open critical or major                                                                                            |
| A5   | documentation-specialist | orchestrator | `pnpm docs:check` zero findings. Screenshots to Artur                                                                |

Tests (A1). Each pins the clock with a spy on `Date.now` and, for formatted dates, the locale. Class-based height assertions match whole tokens, never substrings.

- `weekOf`: 2026-11-18 gives 2026-11-16 to 2026-11-22. A Sunday and a Monday stay in their own weeks. 2026-12-31 gives 2026-12-28 to 2027-01-03.
- `formatWeekRange` in `en-GB` and `en-US`: the three forms in the table above, no "–" or "—" in any, no year in a week of today's year.
- The table's figures for a date equal that date's `DaySummary` from the same fixture, both readings, both macros. Negative: a past day with planned entries never shows Planned under Eaten.
- Two rows with the same targets put their ticks at the same left per cent. A row's band and ticks do not move when its figures change.
- **Range patch:** after `afterEntryWrite` with a day, a cached range holds that day's summary before any read resolves. **With a range read pending** when the write answers, the range still holds the answered day afterwards. Both fail without `putDaysInRanges`. **With an unobserved range read pending** (a `prefetchQuery` still out), the old answer landing after the write does not overwrite the patch. It fails with the cancels in both `putDaysInRanges` and `refresh` removed. A direct test asserts the pending read's `AbortSignal` is aborted by `putDaysInRanges`, and fails without its cancel. With `oldZone`, no range changes. A range with no data stays without data.
- Across states: the table's row count, row height classes and heads are the same loading, loaded, failed and offline, and for two weeks with different data.
- The targets line shows in a week holding a day before the first change and not in the week after. A user with no changes gets no gauge and no line.
- A row press calls `go` with its date, closes the sheet and returns focus to the Week button. The shown day's row has `aria-current="true"` and focus on open.
- Stepping a week renders the new gauges with new keys (no fill motion class runs from old widths).
- `DayTab`: the header's height token is unchanged, and the Week button keeps its label on today, a past day and a future day.

A3 checks:

- The date bar, the launcher and the Week button stay at the same place when the sheet opens, closes or a row is picked (`[data-day-header]` top and height equal in every state). `--day-header-height` measured unchanged at all four widths.
- The Day tab's heights equal those in `docs/app/day.md` at all four widths.
- The sheet's title and first row stay at the same y across loading to loaded and across a same-month, a cross-month and a cross-year week at 320. The title is one line in each.
- At 320 every head is one line and nothing scrolls sideways. Columns fit "≈8888", "≈888.8" and "Planned".
- The row's press target covers the whole row in WebKit.
- Mini gauges: ticks apart at the narrowest fixture range, eaten and plan told apart in both themes.
- No mis-press between Log food and Week on a phone. Screenshots note the button's place for Artur.

### B-web: copying (`feat/copy-entries`, after A has merged, rebased on `master`)

Files: `apps/web/src/lib/api/entries.ts`, `hooks/useCopyActions.ts` (new), `hooks/useEntryActions.ts` (compose it), `hooks/entryActions.ts` (`chunksOf` generic), `components/ui/Checkbox.tsx` (lifted), `components/day/entryMeta.ts` (extracted), `components/day/EntryRow.tsx` (import it), `components/day/EntryList.tsx`, `components/entries/CopyEntriesSheet.tsx` (new), `components/day/DayTab.tsx` (the `CopyEntriesSheet` mount only), `messages/en.json`, their `__tests__/`, `docs/features/quick-logging.md`, `docs/app/day.md`, `docs/features.md`, `docs/design/link-map.md`, `TODO.md`.

| Step | Agent                    | Invoked by   | Exit check                                                                                                                                                                                    |
| ---- | ------------------------ | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B3   | frontend-engineer        | orchestrator | CI green. Tests below                                                                                                                                                                         |
| B4   | validator                | the engineer | Pass, at most 2 fix cycles                                                                                                                                                                    |
| B5   | ui-validator             | validator    | As A3, and M1 to M9 of `mobile-ui-lessons.md` on the copy sheet. Footer rides the keyboard over To. The checklist scrolls, the footer stays. Copy's x is unchanged when Mark all eaten leaves |
| B6   | reviewer                 | ui-validator | No open critical or major                                                                                                                                                                     |
| B7   | documentation-specialist | orchestrator | `pnpm docs:check` zero findings. Screenshots to Artur, the one-entry path among them                                                                                                          |

Tests (B3):

- A copy sends one id per ticked entry in day order and resends the same ids after a timeout.
- **After the target day was read** (a `dayQuery` answer holding the landed copies), Copy again still sends the same ids.
- A changed To after an unconfirmed send gets new ids and, on success, removes the earlier ids before the toast.
- **A selection change after an unconfirmed send** removes the unticked entry's earlier id on success.
- A failed cleanup still shows the copy's toast and reads the stale ids' day again. Undo then removes every id sent in this open.
- Undo sends exactly the ids this open sent.
- Copies arrive planned in the answer and the cache.
- Nothing ticked refuses with its line and sends nothing.
- To defaults to the next day on today and future days, and to today on a past day.
- `CopyEntriesSheet` passes `describeFormSheetContract`.
- `EntryList`: Copy stays at the same x before and after Mark all eaten leaves (DOM order and group).

Each agent logs STARTED and DONE to `logs.txt`.

## Review round 1, answered (2026-11-18)

| Finding                                           | Answer                                                                                                                                                                                          |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Table over 280 px                              | Budgeted against 280 with content-sized columns and measured fonts: 271.3. With "Planned" every head is one line. Fallback is two columns, never a non-token size                               |
| 2. Old range read landing over the patch          | `putDaysInRanges` cancels first, skips on `oldZone`, leaves data-less ranges alone. Test with a read pending                                                                                    |
| 3. Conflict with `targets-from-their-date.md:444` | One line under the table, the Day's key. No-targets user: nothing in the week, with the reason. The override is stated                                                                          |
| 4. Copy ids in `pendingIds`                       | Sheet-owned map for the open, superseded ids removed on success, the cleanup's failure and Cancel stated                                                                                        |
| 5. Title fit and order                            | `formatWeekRange` on `formatRangeToParts`, short months, " to ", one line at 18 px. Week buttons moved to the footer so the title has 280 px                                                    |
| 6. Icon-only button                               | A text "Week" button, moved to the launcher's row (0.2) with measured widths                                                                                                                    |
| 7. Entries row                                    | One group, Copy last, across-state check                                                                                                                                                        |
| 8. Default To and line                            | Today when the shown day is past. "Each copy is a planned entry." The unmarked consequence is in 0.5 and question 2                                                                             |
| 9. Fallback order                                 | Two-column fallback named. The 13 px cut is gone                                                                                                                                                |
| 10. Remove contract                               | Four sentences added in section d                                                                                                                                                               |
| 11. Catalog and size                              | `day.reading.*` shared, `chunksOf<T>`, `useCopyActions`                                                                                                                                         |
| 12. Row button in a table                         | WebKit check and fallback. The button is named by the date, the cells carry the figures                                                                                                         |
| 13. Mini gauge motion                             | Keyed by date. A3 checks the plan tint in both themes                                                                                                                                           |
| 14. Names                                         | "Eaten" and "Planned" on both surfaces, one question folded into `TODO.md`                                                                                                                      |
| 15. Slices                                        | B-backend now, A after targets slice 2, B-web after A, each with its files                                                                                                                      |
| 16. `entry_not_found` copy                        | `errors.entry_not_found`. `useErrorCopy` has no context override (`hooks/useErrorCopy.ts:11-22`)                                                                                                |
| Spot checks                                       | Line numbers corrected, `initialFocus` replaced by the row's `autoFocus`, `formatDay` replaced by `formatWeekRange`, `entryFormat` replaced by the extracted `entryMeta.ts`, the Checkbox named |

## Resolved defaults (architect, 2026-11-18, owner may veto)

- The week is a sheet. Veto cost: a view param and a header variant.
- The Week button is a text button after Log food. Veto cost: it moves into `DateBar`.
- Monday to Sunday, stepped in the sheet's footer without moving the Day. Veto cost: one constant.
- Readings named Eaten and Planned everywhere (orchestrator). Veto cost: one string.
- No distances in the week, positions spoken only. Veto cost: a line per macro per row.
- One targets line under the table, none for a user with no targets. Veto cost: a Set targets button under the table.
- Copies are planned on every date. Veto cost: a status field and a state choice.
- One copy sheet with a checklist, To the next day or today. Veto cost: a second opener, one line for the date.
- Undo through a new `POST /entries/remove`. Veto cost: the route, the service and the toast's action.
- Answered days go into cached ranges at once. Veto cost: one call.
- Three parts: B-backend now, A after targets slice 2, B-web after A. Veto cost: none.

## B-web as built (frontend-engineer, 2026-11-19)

Departures from section f and j, each measured or argued in the engineer's report, as amended by the fix round after ui-validator, validator and reviewer:

- **"Nothing ticked" is the form sheet's footer line.** It was first a line under All entries with no room of its own, which moved the list 26 px down when it showed and 26 px back up under the finger when a tick cleared it, and from `md` grew the dialog and moved Copy under the pointer. It is now `setFormError({ line, cause: null })`, a live region, with `aria-invalid` and focus on All entries, cleared by the next tick. On a phone the footer grows upward and the buttons stay. From `md` the footer keeps two lines of room, so nothing moves.
- **Rows are 53 px, not 44**, and 77 px for a name on two lines. Name over the amount line, calories at the amount line's end. A name takes two lines at most (`line-clamp-2 break-words`, as `EntryRow`).
- **The list's `fieldset` carries `min-w-0`.** A fieldset's `min-inline-size` is `min-content` by default, so one long single-line name made the list as wide as the name, pushed every row's calories off the sheet and scrolled the body sideways. The two other fieldsets in the app (`TargetRangeFields`, `OwnFoodSheet`) already carry it.
- **`describeFormSheetContract` gained `keyboardField`.** The copy sheet holds a date and boxes only, and Base UI raises no keyboard inset for a date input, so the contract's keyboard check could not run. With `keyboardField: null` the contract asserts the form holds no keyboard field. "The footer rides the keyboard over To" therefore does not arise.
- **The sheet reads its day through `dayQuery(fromDate)`**, not a prop, so midnight changing the tab's date cannot swap the list. It ticks the entries once, when the day first arrives. An entry another device adds while the sheet is open appears unticked, and All entries shows a dash.
- **`readDaysAgain`** reads the given days again, and each cached week that holds one of them, inactive ones included (only those with a `queryFn`), so a read-ahead target day or week shows a landed copy at once. A week that holds none of the dates is left alone. `entry_not_found` calls it for the day copied from.
- **Cancel reads every unsure date of the open**, not only the day of the last send. A date is unsure after a send that could not confirm, and after a send of more than 100 whose later request failed once an earlier one had landed (`onLanded` on `CopyRequest`).
- **Leaving the page mid-send.** The copy's `announce` runs once the sheet has slid out, as the sheet unmounts mid-slide, or as the copy answers when the sheet has already left the page. A sheet that leaves the page reads its unsure dates again.
- **`WeekSheet.tsx` gained a comment**, outside the slice's file list.
- **Copy in the Entries row** is `dayEntriesCopyButton`, a 44 by 44 target that grows leftward from its word, in the `dayEntriesActions` group.
- **A refused box borders in the accent**, as every refused field does (`inputClass`). In this app the accent is also the colour of what went wrong (`docs/app/colors.md`).

Measured on a production build in Chromium, both themes, with a day of four entries holding a 60-character name and an unbroken 30-character word:

| Width       | Sheet body scroll width to width | Calories' right edge | Two-line name row | Copy in the Entries row             |
| ----------- | -------------------------------- | -------------------- | ----------------- | ----------------------------------- |
| 320 by 568  | 320 to 320                       | 300                  | 77                | x 260, 44 by 44, word ends at 304   |
| 390 by 844  | 390 to 390                       | 370                  | 77                | x 330, 44 by 44, word ends at 374   |
| 1280 by 800 | 446 to 446 (dialog 416 to 864)   | 839                  | 77                | x 1204, 44 by 44, word ends at 1248 |

- Copy's x is the same on a day with Mark all eaten and on a day where every entry is eaten, at every width. The gap between the two targets is 16.
- The Day tab's header is the same before, during and after the sheet: [16, 0, 288, 128] at 320, [16, 0, 358, 128] at 390, [256, 0, 992, 92] at 1280.
- Across open, all cleared, refused and ticked again, All entries, the first two rows and the Copy button keep the same place at every width. On a phone the footer grows 28 px upward while the refusal shows. From `md` the footer does not change.
- With twelve entries at 390 by 844 the body scrolls 833 in 676 and nothing scrolls sideways.
