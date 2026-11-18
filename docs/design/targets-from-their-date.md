# Design: targets from their own date

Status: in review, round 2 fixes applied (owner answers of 2026-11-18 folded in)
Branch: `feat/targets-from-their-date`
Requested by: Artur, after the first round of feedback on the targets sheet (2026-11-18). Builds on master 1457c20, which holds PR #52 (the targets sheet's titles) and PR #53 (the follow-ups: the Day tab's 24 pixel rest clearance, `summary-stays` at 40rem, the renamed chip row recipe, `docs/app/shell.md`).

**Verdict: build.** The owner's model is simpler than the built one and the code is closer to it than the docs suggest: the server already answers a day without targets, and the first run already stores the user's today. The one thing the read rule cannot carry is "this user has passed the first run", which needs one nullable column.

**Owner answers (Artur, 2026-11-18).** Calls 1 to 4 are agreed and **decided**. On call 3 he added: where the gauge would be, a user with no targets gets a control that opens the first-run screen again, "not aggressive, informative", and "it's also not far fetched that the user will just log, without wanting to set targets for several days, so it needs to be neutral". Logging without targets is a normal way to use the app, not an unfinished setup. He approved the FR-TGT-03 and FR-TGT-07 wordings quoted in section 1.

## The model in one paragraph

A targets change applies from its own date until the day before the next change. A day before the first change has no targets. A user may have no targets at all: by passing the first run without setting any, or by removing every change. Any change can be removed, the only one included. A day without targets shows its two readings as figures only, with no gauge, no range and no distance. Where the gauges would be, a user with no targets at all sees one plain **Set targets** text button, which opens the first-run page again, and a user whose targets start later sees one plain line, "Targets apply from 18 November 2026.", with no control. A new account sees the first-run page once by itself, with a way to go on without targets. Sign out and Delete account live in Settings only. Every write on a date leaves every day before that date as it was, with no exception.

## 0. Product decisions the owner may want to shelve

Rows 0.1 to 0.4 are decided by Artur. The rest are mine and stay reversible.

| #    | Fork                                                                                                                                                                           | Recommendation, and why                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Cost if flipped                                                                                                                  |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| 0.1  | **Decided.** The nudge is one first-run page shown once by itself, then only the Day tab's control and Settings' empty state                                                   | No banner, no recurring prompt, no badge. The page opens again only when the user asks for it (0.7)                                                                                                                                                                                                                                                                                                                                                                                                          | n/a                                                                                                                              |
| 0.2  | **Decided.** Any change can be removed, the only one included                                                                                                                  | A user can reach "no targets" by passing the first run, so refusing it by removal would be inconsistent                                                                                                                                                                                                                                                                                                                                                                                                      | n/a                                                                                                                              |
| 0.3  | **Decided.** A day without targets shows figures only, with no gauge bar, no range and no distance                                                                             | A bar without a range has no scale                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | n/a                                                                                                                              |
| 0.4  | **Decided.** The first run has no date field. Its targets start on the user's today                                                                                            | A new account has no entries on any past day, so there is nothing to measure there at first run. Backdating goes through Change targets                                                                                                                                                                                                                                                                                                                                                                      | n/a                                                                                                                              |
| 0.5  | "Has passed the first run" is **a column on `users`** or **device storage**                                                                                                    | A column. Device storage shows the first run again by itself on every new device and after a cleared browser, which 0.1 rules out                                                                                                                                                                                                                                                                                                                                                                            | Drop the column, the route and `firstRunDue`. The gate shows the first run per device                                            |
| 0.6  | The first run's way out reads **"Continue without targets"**, "Go on without targets", "Not now" or "Skip"                                                                     | "Continue without targets". It says what happens and nothing more. "Skip" says a step was left undone. "Not now" promises a later ask. "Go on without targets" means the same as the pick in a less familiar phrase. The same label serves the page when it is opened again from the Day tab, because there too it means "carry on as before"                                                                                                                                                                | One catalog string                                                                                                               |
| 0.7  | The Day tab's control for a user with **no targets at all**: **"Set targets" alone**, "Ranges show here once you set targets. Set targets", or "No targets. Set targets"       | **"Set targets" alone**, a `btnText` button in ink, where the gauges would be. It names what is available and says nothing about what is missing, so a person who logs without targets for a week reads it as an option, not a reminder. Both sentences in the other two describe an absence, and the first one is conditional advertising for a feature. It opens the first-run page (section f)                                                                                                            | One catalog string. A sentence before the button is one more string and 16 pixels                                                |
| 0.8  | A user **with** targets, on a day before their first change: **a plain line, no control**, the Day tab's Set targets control, or a link that opens Change targets on that date | **A plain line, "Targets apply from 18 November 2026."** The same control would open the first run for someone who already has targets, which is wrong. A Change targets link on that date needs a second mount site for `TargetsSheet` and its removal confirmation, or a date parameter on Settings, for a backdate the owner calls rare. The line states the fact that explains the missing gauge, in the user's own data, and asks nothing. The same line serves today when the only change starts later | A link to `/settings#targets` after the line is one string and one test. A date-prefilled sheet is a design of its own (0.10)    |
| 0.9  | With no change at all, Settings reads **"Days show their figures without ranges." and a "Set targets" button**, which opens the targets sheet titled "Set targets"             | Neutral by the same standard as 0.7: it says what days show, not what the user lacks. The button keeps Settings' one surface for targets, the sheet with its date field, so Settings stays the place for dated changes. The Day tab and Settings both say "Set targets" for the same act, from today by default; the Day tab's path has no date, Settings' path has one                                                                                                                                      | Two catalog strings and one ternary go, and the panel reads PR #52's "Change targets"                                            |
| 0.10 | The sheet's line says **"Earlier days keep their targets." or "Earlier days have no targets."** after each span, or keeps PR #52's per-span suffixes                           | The two earlier-days sentences, after any of three span sentences. Five whole sentences cover all six cases, and the case that is new (nothing earlier) is the one the line must teach. "Other days keep their targets." goes: the span's end date already says where it stops                                                                                                                                                                                                                               | The six combinations become six full strings, with "Other days keep their targets." kept on the two cases with an earlier change |
| 0.11 | **File, not design**: let editing a change move its start date                                                                                                                 | File in `TODO.md`. Covering earlier days today needs a second change with the same numbers. Moving a date is a remove and a put under one confirmation, with a conflict case when the new date has a change. Worth it only if Artur finds the duplicate rows a real nuisance                                                                                                                                                                                                                                 | None for this change                                                                                                             |
| 0.12 | **Found in passing, fixed here**: `DayTab` treats a day whose `targets` is null as a failed load (`DayTab.tsx:88` and `:150`)                                                  | Fixed in slice 1, because the new rule makes such days common. Under the old rule the gate made them unreachable, so it was a correct shortcut, not a defect                                                                                                                                                                                                                                                                                                                                                 | None                                                                                                                             |

## 1. Requirements validation

**The problem, stripped of the proposed mechanism.** Two problems. First, the first change silently covering every earlier day makes "which days does a change rewrite" hard to say: the sheet carries five line forms and a removal carries a special case for it, and FR-TGT-07 needs a caveat. Second, forcing targets before the app opens strands a user who wants to leave, and put Sign out and Delete account on a page where they looked out of place. The owner's mechanism, "a change applies from its own date and a day before the first has none", solves both with no workaround: it deletes branches rather than adding them. It passes the forced-workaround test. The only new machinery is the first-run flag, and it is needed by the second problem, not by the model.

**Where I disagree with the orchestrator.** Nowhere on the five calls, and calls 1 to 4 are now decided. Three refinements:

- Call 5 is half right. The read rule alone carries the server's reads: `targetsOn` loses its fallback query (`reads/targets.ts:31-37`) and `inForceOn` starts from null (`:46`). `readingOf` and `summaryOf` in `reads/days.ts:23-28` already handle null targets, and `DayReadingSchema` and `DaySummarySchema` are already nullable (`packages/types/src/days.ts:14-26`). The first run already stores the user's today: `FirstRunTargets.tsx:73` sends `putTargets(today, …)` with `today` from the server's targets answer, so existing first changes are dated correctly. But two web readers break under the new rule: `DayTab.tsx:88,150` shows "This day did not load." for a day without targets, and `TargetsSection.tsx:53` shows "Your targets show here once Hovimestari can reach the server." for a user whose only change is ahead. And passing the first run needs one stored fact. So: no change to `target_changes`, one nullable column on `users`.
- Call 3 needs one more piece to keep "nothing moves": the loading frame must know whether the date has targets before the day answers, or a day without targets opens with tracks and then shrinks. The web already holds every change (the gate's read). A day without targets for a user with changes is exactly a day before `changes[0]`, so the frame needs only "no changes", "before the first change" or "has targets", and `inForceOn` stays in the backend.
- Call 1, as Artur extended it: the first-run page comes back only when the user opens it from the Day tab, never by itself. Its lead says "They apply from today", at the one moment the new rule matters.

| Requirement      | How this design meets it                                                                                                                              | Note                               |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| FR-TGT-01, 02    | Unchanged                                                                                                                                             |                                    |
| FR-TGT-03        | The first run asks once by itself, lets the user go on without targets, and opens again from the Day tab on request                                   | **Approved.** Wording below        |
| FR-TGT-04, 05    | Unchanged. No field gains an example. A day without targets shows no number in place of a range                                                       |                                    |
| FR-TGT-06        | Unchanged. Any date, today by default                                                                                                                 |                                    |
| FR-TGT-07        | A day uses the latest change on or before it, else none. Every write on a date leaves every earlier day as it was                                     | **Approved.** Wording below        |
| FR-DAY-03        | Both readings on every day, targets or not. "Planned is not eaten" binds the no-targets summary too                                                   |                                    |
| FR-DAY-04        | Positions and gauges on days with targets                                                                                                             | **Changes.** Wording below         |
| FR-DAY-08        | The week (PR 3d) shows positions on days with targets only                                                                                            | **Changes.** Wording below         |
| FR-GAP-01        | The gap exists only on a day with targets                                                                                                             | **Changes.** Wording below         |
| FR-AI-06, 07     | Tools answer `inForce: null`, `targets: null` and null positions as the screen does. Removing the only change is allowed to a writing key             | FR-AI-06 wording below             |
| FR-AUTH-07       | Delete account is reachable in Settings by a user without targets                                                                                     | Now holds without a gate exception |
| NFR-ADV-01 to 03 | No default, no example, no inference of a target from history. "Set targets" and "Targets apply from {date}." state what is available and ask nothing |                                    |

**Changes proposed that were not asked for:** 0.5 to 0.10 (the flag and the copy), and 0.11 filed. Each is an open question in section h or a row above.

**Approved by Artur, 2026-11-18, verbatim.** Nobody edits `docs/requirements.md` ahead of the code. The slice that makes each wording true carries its edit: FR-TGT-07 in slice 1, FR-TGT-03 in slice 2.

- **FR-TGT-03**: "The system shall ask a new user for both ranges when they first open the app, and shall let them go on without setting any."
- **FR-TGT-07**: "The system shall measure each day against the targets in force on that day. Targets apply from their start date until the next change starts. A day before the first start date has no targets and is shown without ranges."

Both hold for this design as written. Two small gaps, raised in section h as questions 1 and 2 with exact text, not reworded here: FR-TGT-03 does not say the page can be opened again, and FR-TGT-07 does not cover a user with no change at all, who has no "first start date".

**Not yet seen by Artur: proposed wording.** These follow from the approved model. The engineer of slice 1 adds them to `TODO.md` under "Needs a decision from Artur", replacing the two items the approved wordings settle. Section h, question 3, asks for them as one.

- **FR-DAY-04**: "The system shall show for each day with targets where both totals stand against the calorie range and the protein range, as figures and as a visual gauge that tells eaten from planned. A day without targets shows both totals with no position."
- **FR-DAY-08**: "The system shall show a week at a glance, with each day's totals, and their position against the targets on the days that have them."
- **FR-GAP-01**: "The system shall show for a day with targets the gap after everything eaten and planned: …" (the rest unchanged).
- **FR-AI-06**: "…the user's targets changes, days with their totals, and on days with targets their positions and gaps, the food catalogue search, …" (the rest unchanged).
- **Overview, user story** (now "set my daily calorie range and protein range before anything else"): "As a user, I want to set my daily calorie range and protein range when I start, and change them from any date, so that every figure the app shows is measured against my own numbers."
- **Overview, principle** "It asks for them first and offers no defaults." Proposed: "It asks for them first, once, and offers no defaults."
- **Scope sentence and product sentence** ("for people who bring their own calorie and protein targets"): keep both. The audience has not changed. A user without targets is a user who has not brought them yet, and the app works as a plain log meanwhile, which the overview already promises ("works as a plain calorie counter on a day when all the user wants is to log a snack fast").

**`TODO.md` items this settles or changes** (read from PR #52's tree):

- "Let a user without targets sign out and delete the account": **settled and deleted**. Settings is reachable, so the first run carries no account controls. Artur approved the FR-TGT-03 wording above in its place.
- "Say which days a targets change rewrites": **settled and deleted**. The exception it describes no longer exists. Artur approved the FR-TGT-07 wording above in its place.
- "Check the first-run page and the targets sheet on a real iPhone": **changed**. The first-run page loses its account block and gains the continue control, so the measured 649 pixel button end changes. The item stays, naming the new page.
- "Assistant tools arrive one step after the screen": unchanged, but section d now fixes what the tools answer without targets.
- "Cap what one user can store": unchanged. Duplicate changes to cover earlier days (0.11) add rows, still far from any cap.
- New item, "Let editing a change move its start date" (0.11), under "Needs a decision from Artur".

## a) Overview

The read rule loses its fallback, the removal loses its last-change refusal, the targets sheet's line and the removal confirmation lose their special case for the first change, and the first run becomes a page a new account sees once and may pass by. The Day tab gains a figures-only summary for a day without targets, Settings gains two states (no targets, and targets that start later), and one column records that the first run is done. Days, entries and the totals are untouched.

## What this costs and where it is worse

**Every reader of "the targets on a day" gains a none case.** From the code:

| Reader                                                                                                                                                                                                   | Today                                                                                                   | After                                                                                                                 |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `targetsOn`, `reads/targets.ts:23`                                                                                                                                                                       | Latest on or before, else the first                                                                     | Latest on or before, else null. One query, not two                                                                    |
| `inForceOn`, `reads/targets.ts:45`                                                                                                                                                                       | Starts from `changesAsc[0]`                                                                             | Starts from null. Stays in the backend: the web's frame needs only `changes[0]` (section f)                           |
| `targetsOverview`, `reads/targets.ts:65`                                                                                                                                                                 | `inForce` null only with `changes: []`                                                                  | `inForce` null with changes ahead is new. Adds `firstRunDue`                                                          |
| `getDay`, `listDaySummaries`, `reads/days.ts:55,88`                                                                                                                                                      | Already pass `?.ranges ?? null`                                                                         | No change                                                                                                             |
| `removeTargetChange`, `writes/targets.ts:60`                                                                                                                                                             | Counts, 409 on the last                                                                                 | No count. Sets the first-run flag                                                                                     |
| `TargetsGate.tsx:57`                                                                                                                                                                                     | First run on `changes.length === 0`                                                                     | First run by itself on `firstRunDue`, or reopened while `history.state.firstRun` is set                               |
| `FirstRunTargets.tsx`                                                                                                                                                                                    | Save, then Sign out and Delete account                                                                  | Save, or Continue without targets                                                                                     |
| `DayTab.tsx:88,150`                                                                                                                                                                                      | Null targets is a failed load                                                                           | Null targets is a day without targets                                                                                 |
| `DaySummary.tsx:128-188`                                                                                                                                                                                 | Without a range: `GaugeFrame` and empty distance rooms                                                  | Without targets: no gauge row, no distance rows, one row with Set targets or the start line. The frame predicts which |
| `TargetsSection.tsx:43-110`                                                                                                                                                                              | Rows only when `inForce`, `currentOnly` for a change ahead, the button inside the branch                | Three states, one button outside them whose label switches (section f)                                                |
| `TargetsSheet.tsx` `:147` (retained changes), `:151` (`replaces`), `:152` (`spanOf`), `:157` (`removalOf`), `:169` (`onError`), `:219` (`canRemove`), `:245` (the footer's Remove), and `targetLines.ts` | Five span kinds, four removal kinds, `canRemove` at two or more                                         | Three kinds and an `earlier` flag, one function for both, `canRemove` whenever editing                                |
| `apps/web/messages/en.json`                                                                                                                                                                              | `appliesBefore`, `appliesAll`, `removeBodyFirst`, `replacesNamed`, `currentOnly`, `targets_last_change` | Those six go. Section f lists what arrives                                                                            |
| The entry sheet and the log sheet                                                                                                                                                                        | Read no targets (`grep` over `components/entries`, `components/log`)                                    | No change                                                                                                             |
| `TodayProvider`                                                                                                                                                                                          | Reads only `today` from the targets answer                                                              | No change                                                                                                             |

Test fixtures that assume "a user always has targets", and that would otherwise keep passing over broken code:

- `apps/web/src/components/targets/__tests__/support.ts:28-31`: `overview()` falls back to `sorted[0]`. It encodes the old rule, so every web suite that uses it would keep showing targets on days that have none. It must change first, in slice 1, or the suites prove nothing.
- `apps/backend/src/routes/__tests__/targets.db.test.ts:96` ("the first change before any"), `:131` (409 on the only change), `:153` (two removals end 204 and 409).
- `apps/backend/src/routes/__tests__/days.db.test.ts:156` asserts `days[0].targets.energyKcal.lower === 1800` for 2026-11-01, before the first change on 2026-11-03 (`:135`). It throws on null under the new rule. It changes to `toBeNull()` for 2026-11-01 and 2026-11-02.
- `apps/backend/src/routes/__tests__/days.db.test.ts:160` pins `inForceOn` to `targetsOn` over dates that include days before the first change. It stays, and now pins null there.
- `apps/web/src/components/day/__tests__/support.ts:88-113`: `dayOf()` hard-codes `targets: RANGES` and positions against them. It gains a `targets: null` option that nulls the positions too.
- `apps/web/src/components/day/__tests__/harness.tsx:350-356`: `seededClient()` seeds one change from 2026-01-01 on its own. It takes the changes as a parameter, so a test of a day without targets seeds changes that agree with that day. Otherwise the test runs the disagreement path of section f without meaning to.
- `TargetsSheet.test.tsx`, `targetLines.test.ts`, `settings/__tests__/targets.test.tsx` (PR #52's `currentOnly` case), `TargetsGate.test.tsx` and `FirstRunTargets.test.tsx`.

**Where it is worse for a person.**

1. **A first-day user who logs yesterday sees no ranges.** This is the reason the old design chose the fallback (`targets-and-foods.md` decision 0.2: "a user logging last week on day one expects a gauge"). The mitigation is that the gap is small in practice: on the first run the account has no entries at all, so a past day without targets is empty unless the user goes back to fill it. The line on that day, "Targets apply from 18 November 2026.", says why there is no gauge.
2. **Covering earlier days takes a second change with the same numbers.** "Change targets" on 8 November with the same ranges as the change from 18 November gives two rows in Settings that read the same. The list grows by one row per backdate, and the two must be edited separately from then on. Filed, not designed (0.11).
3. **Removing the first change now empties its days** instead of handing them to the next change. A user who removes a mistaken early change and expected the next one to take over sees those days go to figures only. The confirmation says so ("Days from 8 November 2026 to 17 November 2026 will have no targets.").
4. **Two summary layouts.** A day with targets and a day without differ in height by 36 to 64 pixels at 390 wide, 52 to 80 at 375 and 68 to 96 at 320, so stepping across the first change's date moves the entries. Within one day nothing moves, and the frame matches what follows. Past days already differ from today by the unmarked line, so a height that follows the kind of day is not new.
5. **One new stored fact and one new way into a page.** "The first run is done" is a column, a route and a field, where the old model needed none. The first-run page, which had no route and one way in, gains a second way in (the Day tab's Set targets) through a flag the gate holds.
6. **Leaving from the first run takes a detour.** Someone signed in with the wrong account passes the first run with "Continue without targets", which marks the first run done for that account, then signs out from Settings. Artur decided this ("no need for it to be visible on targets screen").

**What it deletes.**

- The `before` and `all` span kinds, the `first` removal kind, `removalOf` as a function of its own (a removal's days are the span of a save on that date), and the `named` branch in `lineText`.
- Catalog: `targets.sheet.appliesBefore`, `appliesAll`, `removeBodyFirst`, `replacesNamed`, `settings.targets.currentOnly`, `errors.targets_last_change`.
- `targets_last_change` in `packages/types/src/errors.ts:45` and `apps/backend/src/lib/errors.ts:73`, the count query in `removeTargetChange`, the fallback query in `targetsOn`.
- `DayTab`'s null-targets failure branch.
- The `targets_last_change` branch in `TargetsSheet.tsx:169` (`onError`), the JSDoc that names it in `apps/web/src/lib/api/targets.ts:19`, the 409 mock in `TargetsSheet.test.tsx:561`, and the `removalOf` suite in `targetLines.test.ts:56-67`, with its `toBeNull()` for the only change.
- The first-run page's account block and its `settings.account` reuse.
- Docs: the five rewrite bullets and "except the last one" in `features/targets.md`, the "Current alone" sentence in `app/settings.md`, the "Leaving" section of `app/first-run.md`, and the FR-TGT-07 caveat in `TODO.md`.

**The count.** Deleted: 6 catalog keys, 3 type variants, 1 error code, 2 queries, 2 branches, 1 page section. Added: 12 catalog keys and 4 rewritten (section f), 1 column, 1 route, 1 response field, 1 gate flag, 1 summary layout, 2 Settings states. More strings, fewer rules. The rule a person has to hold goes from "from its date, except the first, which also covers everything before it, and removing it hands its days forward" to "from its date". That trade is the point.

## b) Components and responsibilities

| Component                                                                                        | Change     | Owns                                                                                                                                             |
| ------------------------------------------------------------------------------------------------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/types/src/targets.ts`                                                                  | modified   | `TargetsOverviewSchema` gains `firstRunDue`. Comments for null                                                                                   |
| `packages/types/src/errors.ts`                                                                   | modified   | Drops `targets_last_change`                                                                                                                      |
| `apps/backend/src/services/reads/targets.ts`                                                     | modified   | `targetsOn` without fallback, `inForceOn` from null. `targetsOverview` reads the flag and answers `firstRunDue`                                  |
| `apps/backend/src/services/writes/targets.ts`                                                    | modified   | `removeTargetChange` without the count, setting the flag                                                                                         |
| `apps/backend/src/services/writes/settings.ts`                                                   | modified   | `finishFirstRun(ctx)`                                                                                                                            |
| `apps/backend/src/routes/users.ts`                                                               | modified   | `PUT /users/me/first-run`                                                                                                                        |
| `apps/backend/src/db/schema/users.ts`, `apps/backend/drizzle/migrations/0005_first_run_done.sql` | new column | `first_run_done_at`                                                                                                                              |
| `apps/web/src/components/targets/targetLines.ts`                                                 | modified   | `spanOf` only, with `earlier`                                                                                                                    |
| `apps/web/src/components/targets/TargetsSheet.tsx`                                               | modified   | Line and removal copy from one span, `canRemove` while editing, title "Set targets" when none                                                    |
| `apps/web/src/app/(app)/settings/_components/TargetsSection.tsx`                                 | modified   | Three states, `id="targets"` on the panel                                                                                                        |
| `apps/web/src/components/targets/TargetsGate.tsx`                                                | modified   | Decides on `firstRunDue`, or on `history.state.firstRun` for the reopened page. Provides `useFirstRun()` with `open()` and a one-shot `returned` |
| `apps/web/src/components/targets/FirstRunTargets.tsx`                                            | modified   | Continue without targets. No account block. Takes `onLeave` only when reopened                                                                   |
| `apps/web/src/components/day/DaySummary.tsx`, `DayTab.tsx`, `DateBar.tsx`                        | modified   | The summary without targets, its Set targets button or line, the frame's prediction, focus on return to the date button                          |
| `apps/web/src/lib/api/users.ts` (or the module holding `/users/me` calls)                        | modified   | `finishFirstRun()`                                                                                                                               |

## c) Data model

`target_changes` is unchanged. Existing rows mean the right thing under the new rule: the first run already dated the first change on the user's today. The app is not deployed (`TODO.md`, "The app is not deployed, on purpose"), so the only rows whose meaning moves are local test data, where days before a user's first change lose their targets.

One nullable column:

```ts
// apps/backend/src/db/schema/users.ts, in the users table
// Set once the first run is behind the user: they went on without targets,
// or removed a change. Null on a new account. Never cleared.
firstRunDoneAt: timestamp("first_run_done_at", { withTimezone: true }),
```

Migration `apps/backend/drizzle/migrations/0005_first_run_done.sql` (the journal ends at `0004_days_and_logging`), produced by `pnpm --filter @hovimestari/backend db:generate --name first_run_done` after building the types, as `apps/backend/README.md` describes, and committed with its `meta/` snapshot. Without `--name`, drizzle-kit picks a random name:

```sql
ALTER TABLE "users" ADD COLUMN "first_run_done_at" timestamp with time zone;
```

No backfill. The first run is due only while the user has **no change and no flag**, so every existing user with a change is already past it, and a removal sets the flag before a user can reach zero changes. Rollback is forward only, by a migration that drops the column. The cascade walk is unaffected: no new key.

Who writes it:

- `finishFirstRun(ctx)`: `UPDATE users SET first_run_done_at = ctx.now, updated_at = ctx.now WHERE id = ctx.userId AND first_run_done_at IS NULL`. It bumps `updated_at` as `updateSettings` does, and only when it sets the flag. Zero rows and no user row answers 404 `user_not_found`. Zero rows with the flag already set is success.
- `removeTargetChange`: keeps its `SELECT … FOR NO KEY UPDATE` on the user row (`writes/targets.ts:62`), drops the count and the 409, deletes the change, then runs the same conditional update in the same transaction. The row lock it already holds is the lock the update needs, so a removal waits behind nothing new, and logging a food still does not wait behind it (`targets.db.test.ts`, "does not wait behind a write that only references the user").

Who reads it: `targetsOverview` reads `users.first_run_done_at` by primary key, as a third query in its `Promise.all`. It does not reuse the row `contextFor` loads (`requestContext.ts:24`), because the service context carries no user row and the MCP path builds its own context. `firstRunDue` is computed in the service.

`setTargets` does not touch the flag: a user with a change is past the first run by the rule above, whoever saved it.

## d) API interface

All under `/api/v1`, Bearer.

| Method | Path                             | Change                                                                                              |
| ------ | -------------------------------- | --------------------------------------------------------------------------------------------------- |
| GET    | `/targets?date=`                 | `inForce` is null on a date before the first change. New field `firstRunDue`                        |
| PUT    | `/targets/:effectiveFrom`        | No change                                                                                           |
| DELETE | `/targets/:effectiveFrom`        | 204 for the only change too. 409 `targets_last_change` is gone. 404 `target_change_not_found` stays |
| PUT    | `/users/me/first-run`            | **New.** No body. 204, idempotent. 404 `user_not_found` for a deleted account                       |
| GET    | `/days/:date`, `/days?from=&to=` | No shape change. `targets` and the positions are null on more days                                  |

```ts
// packages/types/src/targets.ts
/**
 * The targets in force on `date`, every change, the user's `today`, and
 * whether the first run is still due. `inForce` is null on a date before the
 * first change, and always for a user with no changes. `firstRunDue` is true
 * only for a user with no changes who has never passed the first run.
 */
export const TargetsOverviewSchema = z.object({
  date: IsoDateSchema,
  today: IsoDateSchema,
  inForce: TargetChangeSchema.nullable(),
  changes: z.array(TargetChangeSchema),
  firstRunDue: z.boolean(),
});
```

The contract between backend and web, stated once:

- `TargetsOverview.firstRunDue: boolean`, required. `inForce` may be null while `changes` is not empty.
- `Day.targets` and each reading's `energy` and `protein` are null on a day without targets, as the schema already allows.
- `PUT /users/me/first-run`: no body, 204, idempotent, 404 `user_not_found`.
- `DELETE /targets/:effectiveFrom`: 204 for the only change too. `targets_last_change` leaves `packages/types/src/errors.ts`, the backend's messages and the web catalog in the same slice.

`DaySummarySchema.targets` and `DayReadingSchema.energy`/`protein` keep their shapes. Their comments change from "null only for a user without targets" to "null on a day without targets".

**What the assistant tools inherit** (built in the connected-AI step, bound now by "the assistant gets what the screen gets"):

- The targets tool answers `{ today, inForce, changes }` from `targetsOverview`. It leaves out `firstRunDue`, which is a screen's routing fact. A user with no targets answers `inForce: null, changes: []`. A date before the first change answers `inForce: null` with the changes listed.
- The day and week tools answer `targets: null` and `energy: null, protein: null` on a day without targets, with the figures as always. No tool fills a null with a nearby change.
- A writing key may remove any change, the only one included, through `removeTargetChange`. The flag it sets keeps the first run from appearing to the user afterwards.
- The app rules an assistant reads say: a day without targets has figures and no position, and the app never infers a target from a user's history.

## e) Data flow

**Owner's worked example, pinned as test invariants** (Helsinki, today 2026-11-18):

1. New account. `GET /targets` answers `inForce: null, changes: [], firstRunDue: true`. The gate shows the first run.
2. Save A on the first run: `PUT /targets/2026-11-18`. Settings shows one row, "Current (from 18 November 2026)". `GET /days/2026-11-17` answers `targets: null` and null positions. **Never A** (the old fallback).
3. Change targets, 8 November, B: `GET /days/2026-11-08` and `2026-11-17` answer B. `2026-11-18` answers A. `2026-11-07` answers null, **never B and never A**.
4. Remove the change from 8 November: `2026-11-08` to `2026-11-17` answer null, **never A**.
5. Remove the change from 18 November: 204. `GET /targets` answers `inForce: null, changes: [], firstRunDue: false`. **Never `firstRunDue: true`** after a removal. The tabs stay.

**Passing the first run.** Continue without targets → `PUT /users/me/first-run` → 204 → `afterTargetsChange(client)` refreshes the targets read → `firstRunDue: false` → the gate renders the shell on the same address → the Day tab shows today, figures only. A failure keeps the page, shows the refusal line above Save and unlocks both controls.

**Opening the first run again from the Day tab.** A user with no targets presses **Set targets** → `useFirstRun().open()`:

1. `open()` does nothing while the page is already open. It refetches the targets read first. If the fresh answer has a change, it stops there, and the Day row follows that answer. This closes the one stale-cache case section f cannot see.
2. Otherwise it pushes one history entry on the same address, `history.pushState({ ...history.state, firstRun: true }, "", location.href)`, keeping Next's own state in the entry.
3. The gate reads `asked` from `history.state?.firstRun === true` on mount and on every `popstate`, setting it as well as clearing it. The entry is the one truth, so a reload while the page is open shows it again and Back still closes it, and Forward opens it again.
4. The gate renders `FirstRunTargets` with `onLeave = () => history.back()` in place of the shell. The shell, `TodayProvider` included, unmounts. Its remount on the way back makes its mount ask: one more targets read, accepted.

Ways out, each to the day the user was on, since the address never changed:

- **Continue without targets**: `onLeave()`. No request, since the flag is already set.
- The browser's or the phone's Back: the `popstate` closes the page.
- **Save targets**: `PUT /targets/<today>`, then `await afterTargetsChange(client)`, then `onLeave()`. It goes back once the PUT succeeds, whatever the refetch does: the reopened page is not gated on the read, and the day is read again as the shell remounts. A refused PUT keeps the page with its refusal line, as on the first run.

The self-shown first run (`firstRunDue`) gets no `onLeave` and never calls `history.back()`, which would leave the app. It leaves by the refetch, as built.

On return, the gate sets the one-shot `returned`, and `DayTab` puts focus on the date button as it mounts, so focus never lands on `<body>`. The tab opens at the top of the page.

**Removing the only change.** Settings → the row → Remove these targets → the confirmation → `DELETE` → 204 → focus moves to the panel's button (`focusAfter`, `TargetsSheet.tsx:171`) while the cache still holds the old answer → the targets and day reads refresh. The gate's new answer has `firstRunDue: false`, so the shell never unmounts and the sheet slides out as today. The panel's button is one element outside its state branches (section f, Settings), so the refetch changes only its label, to "Set targets", and focus stays on it.

## f) Frontend architecture

### State by state

| State                                                  | Day tab, today                                                                        | Settings, Targets panel                                                                                                                     |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| New account, first run due                             | Not shown. The first-run page                                                         | Not shown                                                                                                                                   |
| No targets (first run passed, or every change removed) | Figures only, and **Set targets**, which opens the first-run page                     | "Days show their figures without ranges." Then **Set targets**, which opens the targets sheet titled "Set targets", then the note on advice |
| Only change starts after today                         | Figures only, and "Targets apply from 1 December 2026."                               | No "Current" row. One "From 1 December 2026" row. **Change targets**                                                                        |
| A change in force today                                | As built                                                                              | "Current (from {date})", later rows, Earlier targets. PR #52's "Current" alone is gone, since a change in force has always started          |
| A past day before the first change                     | Figures only, and "Targets apply from 18 November 2026." (0.8)                        | n/a                                                                                                                                         |
| A future day with targets from an earlier change       | As built                                                                              | n/a                                                                                                                                         |
| No targets, a past or future day                       | Figures only, and **Set targets** (its targets start on today, as the first run says) | n/a                                                                                                                                         |
| Targets cannot be read                                 | As built                                                                              | As built ("Your targets show here once …"). Now only when there is no answer, never because `inForce` is null                               |

The Earlier targets disclosure lists the changes before the one in force, as built. With no change in force there is none, so it is absent.

### The targets sheet's line

`spanOf(changes, date)` returns `{ kind: "between", date, end } | { kind: "day", date } | { kind: "from", date }` with `earlier: boolean` (a change starts before `date`). The change on `date` itself is ignored by both comparisons, so the same function names the days a save on `date` covers and the days a removal of the change on `date` empties or hands back.

| Case                                      | Line under the fields                                                                     |
| ----------------------------------------- | ----------------------------------------------------------------------------------------- |
| from, earlier change                      | "These apply from 18 November 2026 on. Earlier days keep their targets."                  |
| from, no earlier change                   | "These apply from 18 November 2026 on. Earlier days have no targets."                     |
| between, earlier change                   | "These apply from 18 November 2026 to 30 November 2026. Earlier days keep their targets." |
| between, no earlier change                | "These apply from 8 November 2026 to 17 November 2026. Earlier days have no targets."     |
| day, earlier change                       | "These apply to 30 November 2026 only. Earlier days keep their targets."                  |
| day, no earlier change                    | "These apply to 17 November 2026 only. Earlier days have no targets."                     |
| any, on Change targets, date has a change | "This date already has targets. Saving replaces them." before the line                    |

The "This date" form now serves every case, because every span names its own date.

| Removal of the change on {date}           | Confirmation body                                                                   |
| ----------------------------------------- | ----------------------------------------------------------------------------------- |
| between, earlier change                   | "Days from {date} to {end} are then measured against your earlier targets." (built) |
| day, earlier change                       | "{date} is then measured against your earlier targets." (built)                     |
| from, earlier change                      | "Days from {date} on are then measured against your earlier targets." (built)       |
| between, no earlier change                | "Days from {date} to {end} will have no targets."                                   |
| day, no earlier change                    | "{date} will have no targets."                                                      |
| from, no earlier change (the only change) | "Days from {date} on will have no targets."                                         |

**Remove these targets** shows on every edited change. Its title, button and focus rules are as built.

### The catalog

Added, 12 keys: `targets.sheet.earlierKeep` "Earlier days keep their targets.", `targets.sheet.earlierNone` "Earlier days have no targets.", `removeBodyBetweenNone`, `removeBodyDayNone`, `removeBodyFromNone` (the table above), `targets.sheet.titleSet` "Set targets", `settings.targets.set` "Set targets", `settings.targets.none` "Days show their figures without ranges.", `targets.firstRun.continue` "Continue without targets", `targets.firstRun.continuing` "Continuing…", `day.summary.setTargets` "Set targets", `day.summary.targetsFrom` "Targets apply from {date}.".

Changed, 4 keys: `targets.sheet.appliesBetween` "These apply from {date} to {end}.", `appliesDay` "These apply to {date} only.", `appliesFrom` "These apply from {date} on." (each without its suffix), and `targets.firstRun.lead` "Enter the ranges you aim for each day. They apply from today, and you can change them in Settings at any time." The lead changes in slice 1, because it becomes true and needed the moment the fallback goes.

Removed: the six in section "What it deletes". The catalog tests (no orphan key, no error code without a line) prove the removal is complete.

### The first run

The wordmark, title, lead, the four fields, the note, the refusal line, **Save targets**, and under it **Continue without targets**, a full-width text button with a 44 pixel target, 16 pixels under Save. While either works, both and the fields are locked, and the pressed one shows its busy label. No rule, no "Signed in as", no account controls. Shown once by itself: the gate never shows it again once `firstRunDue` is false. After that it opens only from the Day tab's **Set targets**, as the same page with the same copy. Its way out reads the same there, "Continue without targets", because it means the same thing: carry on as before. A second label for the second way in would be one more string for no difference in meaning.

Alternatives for the control's wording, rejected in 0.6: "Skip", "Not now", "Go on without targets".

**The neutrality standard** (Artur: a user may log without targets for days). Every surface a user without targets sees states what is available and nothing more. No sentence about what is missing ("You have not set targets yet"), no setup language ("Finish setting up"), no selling ("Get more from…"), no icon, no accent fill, no warning or to-do colour, no count of days, and nothing that grows, repeats or changes as days are logged. Checked against it: the Day tab's **Set targets** (an ink text button, the same every day), Settings' "Days show their figures without ranges." (what days show, not what the user lacks), and the first run's "Continue without targets" (what happens, not a step skipped).

### The gate

The self-shown page: `if (data?.firstRunDue) return <FirstRunTargets today={data.today} />`, with no `onLeave`, leaving by the refetch as built. The reopened page: `if (asked && data) return <FirstRunTargets today={data.today} onLeave={() => history.back()} />`, where `asked` is `history.state?.firstRun === true`, read on mount and on every `popstate` (section e). Every other rule of the gate stands: spinner on the first decision only, tabs on no answer, a definite answer needed to show the first run by itself. The page keeps its one mount site, the gate. `useFirstRun()` is the only new piece, and only the Day tab calls it.

### The Day summary without targets

Per macro block: the head row with the label stays (its range slot empty), then the two figure cells directly. No gauge row, no distance rows. Then, 12 pixels under the protein block, where the gauges were, one row:

- A user with no change at all: **Set targets**, a `btnText` button (ink, underlined, 44 pixel target, no icon). It opens the first-run page. A button, not a link, because it changes what the app shows without changing the address.
- A user with a change that starts after this day: the line "Targets apply from 18 November 2026." in `text-xs`, `md:text-sm`, ink muted, with no control. Its date is the user's first change. The present tense stays true when that date has already passed, and matches the sheet's "These apply from {date} on."

Carbs and fat follow, then the closing lines as built. The row is the same on every such day and never on a day with targets, so it does not move within a day.

`DaySummary` gains `noTargets: null | { kind: "none" } | { kind: "from"; date: string } | { kind: "pending" }`. `DayTab` derives it from the gate's cached targets answer. No new shared rule is needed: a day without targets for a user with changes is exactly a day before `changes[0]`.

The frame, before the day answers:

- No cached answer (offline with nothing cached): targets, as today's frame.
- No changes: `none`.
- The date before `changes[0].effectiveFrom`: `from`, with that date.
- Otherwise: targets.

The loaded day:

- `day.targets` set: no row.
- Null, and the cache has a change after the date: `from`, with the first such date.
- Null, and the cache has no changes: `none`.
- Null otherwise (the cache has a change on or before the date, or no answer): `pending`. `DayTab` invalidates `queryKeys.targets()` once, and the row holds the start line's room, empty, until the answer comes and the rule runs again.

The one case this cannot see is a cache with no changes while another device or an assistant has added one. `open()` refetches before it opens the page, so Set targets never opens the first run for a user who has a change.

Heights, estimates for ui-validator to measure on a production build (built figures from `docs/app/day.md` on master 1457c20). Without targets the two macros lose their gauge rows (28 each) and their distance rows, which keep two lines at 320, one at 390, and two for calories and one for protein at 375. That leaves about 192 at every phone width. The Set targets row adds 56 (12 above, 44 tall) and the start line 28.

| Viewport   | With targets, today and past (built) | Without, Set targets, today and past | Without, start line, today and past | Difference        |
| ---------- | ------------------------------------ | ------------------------------------ | ----------------------------------- | ----------------- |
| 320 × 568  | 316, 332                             | about 248, 264                       | about 220, 236                      | 68 and 96 shorter |
| 375 × 667  | 300, 316                             | about 248, 264                       | about 220, 236                      | 52 and 80 shorter |
| 390 × 844  | 284, 300                             | about 248, 264                       | about 220, 236                      | 36 and 64 shorter |
| 1280 × 800 | measure                              | measure                              | measure                             | about 48 and 76   |

The first entry starts higher by the same differences. The `summary-stays` threshold (`globals.css:15`, now 40rem) is the tallest summary plus the rest, and a summary without targets is shorter than one with them, so the threshold and `DayTab.test.tsx`'s token sum stay as they are.

### Settings

`TargetsSection` renders, in order: the state's content, then one button, then the note on advice.

- No answer: the unavailable line, and no button, as built.
- No changes: "Days show their figures without ranges."
- Otherwise: `inForce` (if any) as "Current (from {date})", the changes after today as "From {date}", and the earlier ones behind the disclosure.

The button sits outside the state branches, rendered whenever there is an answer. It keeps `changeRef`, so `focusAfterRemove` finds it, and only its label switches: "Set targets" with no change, "Change targets" otherwise. A refetch that changes the state never unmounts it, so removing the only change (slice 2) or removing the change in force while later ones remain (slice 1) keeps focus on it. The panel carries `id="targets"`.

`TargetsSheet` takes the title "Set targets" when it opens on new targets and its retained `changes` (`TargetsSheet.tsx:147`, `useRetainedValue`) are empty, else PR #52's titles. Reading the retained list keeps the title fixed while the sheet slides out after its first save.

## g) Constraints and decisions

- **`inForceOn` stays in the backend.** The frame needs only `changes[0]`, so moving it to `packages/types` would be tidying with no caller. `targetsOn` stays a query, pinned to `inForceOn` by the existing test.
- **The gate decides on a server-computed fact.** `firstRunDue = changes.length === 0 && first_run_done_at IS NULL`, answered on the read the gate already makes. The gate's offline and failure rules are untouched.
- **Every write on a date leaves earlier days alone.** This is now true with no exception, and the feature doc says it in one sentence.
- Backend relative imports keep `.js`. Web imports do not.

### Rejected alternatives

| Alternative                                                                                  | Why it was rejected                                                                                                                                                                                         |
| -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Keep the fallback, only add a skip                                                           | Solves the account problem and leaves the five line forms, the first-change removal and the FR-TGT-07 caveat. The owner's point was the simpler rule                                                        |
| The first-run fact in device storage                                                         | Shows the first run again on each new device and after a cleared browser. That is a recurring prompt (0.5)                                                                                                  |
| The flag on `MeSchema`, read from the session's user                                         | The gate would decide on two reads that can disagree, and the session's user can be stale on a second device. The targets read is already the gate's one fact                                               |
| Show the first run only in the session that created the account                              | No column, but the auth flows would have to report "created" through Google's callback and registration, and a user who closes the tab before deciding never sees it                                        |
| No first-run page at all, the Day tab's control as the only invitation                       | Fewest parts, but a new user lands on an empty summary with no word on what targets are or that the app gives none. Approved FR-TGT-03 asks on first open                                                   |
| Set the flag on every `setTargets`                                                           | Same result, but every first save would update the user row. Removal already holds that row's lock                                                                                                          |
| A greyed gauge on a day without targets                                                      | A bar with no range has no scale (0.3)                                                                                                                                                                      |
| The Day tab's Set targets opens the targets sheet, or links to Settings                      | Artur asked for the first-run screen. The sheet would be a second mount site for `TargetsSheet` and its removal confirmation. A link to Settings sends a person who wanted the simple path to the dated one |
| The reopened first run as a route of its own, such as `/targets/start`                       | A route under `(app)` renders inside the shell with the tabs, and one outside it needs its own guard. The gate already mounts the page, and a history entry gives Back the right meaning                    |
| Settings' empty state opens the first-run page too, so both "Set targets" lead to one screen | Settings would then have two targets editors that depend on its state. Inside Settings every targets edit is the sheet (0.9)                                                                                |
| The day answer carries the next change's date, so the Day row needs no cache                 | Closes the stale case at the source, but widens the day's shape and its assistant tool for a cross-device edge that `open()`'s refetch already closes where it matters                                      |
| Move `inForceOn` to `packages/types` for the frame                                           | The frame needs only `changes[0]`. A shared copy with no web caller is tidying, not a need                                                                                                                  |
| A different label for the reopened page's way out, such as "Back to the day"                 | One more string for the same meaning (0.6)                                                                                                                                                                  |
| Prefill Change targets' date from the day the line was tapped on                             | A query parameter, its parsing and a second default for one field, for the rare backdate. Filed with 0.11 if Artur wants it                                                                                 |

### Non-questions

- Settled by the owner: a change applies from its date, and a day before the first has none. Calls 1 to 4 (0.1 to 0.4) and the FR-TGT-03 and FR-TGT-07 wordings.
- Settled by the owner: the Day tab's control for a user with no targets opens the first-run screen, and it is neutral.
- Settled by "Planned is not eaten": a day without targets still shows both readings, with both columns.
- Settled by NFR-ADV-01: nothing fills a day without targets with a nearby change's numbers, on screen or in a tool.
- Settled by PR #52: the sheet's title never changes while it is open, and an edited change's date is fixed.
- Settled by the repo: migrations come from `db:generate`, with the SQL and `meta/` committed together.

## h) Open questions and risks

At most five, for Artur. Each carries the assumption the implementation follows.

1. **FR-TGT-03 does not say the page can be opened again.** The approved wording is true as written, since the requirement is about a new user. Optional addition, exact text: "The system shall ask a new user for both ranges when they first open the app, and shall let them go on without setting any. A user without targets can open that screen again from the day."
   > **Assumption:** the approved wording stands unchanged, and the reopening lives in the page docs. Flip: one sentence in `docs/requirements.md`, carried by slice 2.
2. **FR-TGT-07 does not cover a user with no change at all**, who has no "first start date", nor say what a removal does. Exact text that closes both: "The system shall measure each day against the targets in force on that day. Targets apply from their start date until the next change starts. A day before the first start date, and every day of a user without targets, has no targets and is shown without ranges."
   > **Assumption:** the approved wording, with this reading of it, since a user without targets plainly has no targets on any day. Flip: the sentence above in slice 1.
3. **The four wordings Artur has not seen** (FR-DAY-04, FR-DAY-08, FR-GAP-01, FR-AI-06, quoted in section 1), and the two overview sentences. Each says that a position, a gauge and a gap exist only on a day with targets. The orchestrator has asked him. They stay proposed text until he answers.
   > **Assumption:** they follow from the approved model and go to `TODO.md` for his yes. The code does not wait, and the slice 1 PR body names the FR-DAY-04 contradiction (section h, Risks).
4. **The sheet's line as a span sentence plus "Earlier days keep their targets." or "Earlier days have no targets."** (0.10), dropping "Other days keep their targets."
   > **Assumption:** yes. Flip: six full strings.
5. **Let editing a change move its start date, so a backdate is not a duplicate row?** (0.11)
   > **Assumption:** filed in `TODO.md`, not built. Flip: a design of its own.

The copy choices 0.6 to 0.9 are mine under his neutrality standard and go to him on the screenshots, not as questions.

**Risks.**

> **Risk:** the web fixture `overview()` in `targets/__tests__/support.ts` encodes the old fallback. Changed late, every web suite stays green over a screen that still shows targets on days without them. Slice 1 changes it first. In slice 2 it gains `firstRunDue` as an explicit parameter, default `false`, never derived from `changes.length === 0`, which would bake the old gate rule into every suite. Each new test is run once against the old code, with the new fixtures, and must fail.

> **Risk:** PR #53 (the follow-ups) is on master 1457c20. It edited `globals.css` (`summary-stays` to 40rem, the 24 pixel rest clearance), `DayTab.tsx`, `docs/app/day.md` and `docs/app/shell.md`, all of which this design touches. Section f's figures are read from that master. Re-measure the built heights before comparing, and rebase rather than resolve across files if master moves again.

> **Risk:** FR-TGT-03 and FR-TGT-07 are approved. FR-DAY-04, FR-DAY-08, FR-GAP-01 and FR-AI-06 are not yet. After slice 1, days before the first change show no position while FR-DAY-04 still says "for each day". The slice 1 PR body says it ships against the current FR-DAY-04 text unless Artur has approved the new wording by then. Each slice edits `docs/requirements.md` only with approved wording it makes true.

> **Risk:** the reopened first run replaces the shell and pushes a history entry by hand. Next 16's App Router patches `history.pushState` and copies its own state into the entry, Back to the previous entry restores the same tree with no fetch, and `useSearchParams` stays in step. The entry keeps the same address, so nothing routes. The tests in slice 2 guard Back, Forward and a reload while open.

**Week view (PR 3d, not built).** A week reads `GET /days?from=&to=`, which already answers `targets: null` and null positions per day. A day without targets shows its two readings' figures and no mini gauge, and its row keeps the gauge's height so the rows stay aligned. The week says once, above its rows, when any day in it has no targets ("Targets apply from 18 November 2026.", the Day tab's line), and for a user with no targets at all shows the Day tab's **Set targets** once, above the rows, rather than a line in every row. 3d's `Gauge size="mini"` takes no range-less form. The frame of a week compares each date with `changes[0]`, as the Day tab's does.

## i) Docs

- `docs/features/targets.md`: "Changing your targets" (the rule in one sentence, the five bullets go, any change can be removed), "New targets and edited targets" (the line's forms, the replace sentence), "Which targets a day uses" (none before the first change, the "Current" alone sentence goes), "The first run" (once by itself, opened again from the day, the way out, no account controls), "The first-run gate" (on `firstRunDue`), How it works (`inForceOn` in `packages/types`, the removal, `finishFirstRun`), API (DELETE without 409, `PUT /users/me/first-run`, `firstRunDue`), Data (`users.first_run_done_at`), Requirements line.
- `docs/features/days.md`: "Where a day stands" ("A day without targets gets the figures and no position", replacing "A user without targets…"), "Reads" (`inForceOn` answers null before the first change), the API paragraph's null comment.
- `docs/app/day.md`: "The summary" (a day without targets, Set targets, "Targets apply from {date}."), Layout (the measured heights for each kind), Features on this page.
- `docs/app/settings.md`: Targets (three states, Set targets, the line's forms, the removal confirmation's six bodies, the only change removable), Route and entry ("which the first-run page shares" goes).
- `docs/app/first-run.md`: rewritten: the intro (shown once by itself, opened again from the Day tab), The form (lead, Continue without targets), "Leaving" goes, a section on opening it again (the ways back to the day), Layout (new measurements), Data and refresh (`PUT /users/me/first-run`), Features on this page (Authentication goes).
- `docs/app/shell.md`: the gate sentence ("An account that has not passed the first run").
- `docs/features.md`: Targets ("offered once on a first-run page, which a person may pass by, and changed in Settings from a date the user picks. A change applies from its date, and a day before the first change has none."), Days ("each placed against the user's own targets with a distance, on days that have them"), Pages, First run ("the page that offers a new account its targets, once, before the tabs").
- Link map: no new home. "first run, no targets yet" stays on `features/targets.md#the-first-run`. A day without targets is homed by `features/targets.md#which-targets-a-day-uses`; add "a day without targets" to that row's concepts.
- READMEs: `apps/web/README.md` (`account/` shared by Settings only, `FirstRunTargets.tsx` line), `apps/backend/README.md` (migration 0005 note, `PUT /users/me/first-run` in the route list), `packages/types/README.md` if it lists the shared functions.
- `TODO.md`: section 1's changes.

## j) Implementation plan

Two slices, each a PR that leaves the app consistent.

**Slice 1: the rule and every reader.** One branch, one PR. Backend first (small), then web on the same branch. After it, a day before the first change has no targets everywhere and shows "Targets apply from {date}.". Nothing else changes: the last change is still refused, and the first run has no way out yet, so a user with no changes is still only a new account and the `none` kind is unreachable. The slice edits FR-TGT-07 in `docs/requirements.md` to the approved wording, and its PR body says it ships against the current FR-DAY-04 text unless Artur has approved the new one.

Contract: no shape changes. `TargetsOverview.inForce` and `Day.targets` and the positions are null on a date before the first change. Error codes unchanged.

_Backend_ (backend-engineer):

- `apps/backend/src/services/reads/targets.ts`: `targetsOn` without its second query, `inForceOn` from null, both comments.
- `packages/types/src/targets.ts` and `days.ts`: the null comments only.
- Tests: `targets.db.test.ts:96` becomes the owner's example steps 2 to 4 with their negative assertions (17 November never answers A, 7 November never answers A or B, the removal of 8 November never hands its days to A). `days.db.test.ts:156` asserts null for 2026-11-01 and 2026-11-02. The pin test at `:160` stays.
- Validation: each new assertion fails on the old rule, run once and recorded in the PR. `*.db.test.ts` run, not skipped.

_Web_ (frontend-engineer):

- Fixtures first: `targets/__tests__/support.ts` `overview()` without the fallback, `day/__tests__/support.ts` `dayOf()` with `targets: null`, `day/__tests__/harness.tsx` `seededClient()` taking its changes.
- `DayTab.tsx`: drop the null-targets failure (`:88`, `:150`), derive `noTargets` for the frame and the loaded day by section f's rules (`from` and `pending` only in this slice).
- `DaySummary.tsx`: no gauge and distance rows without targets, the start line.
- `TargetsSection.tsx`: the later-only state, no `currentOnly`, the one button outside the branches.
- `targetLines.ts`, `TargetsSheet.tsx`: `spanOf` with `earlier`, `removalOf` gone, the line and removal copy.
- `en.json`: the span and removal keys, `targets.firstRun.lead`, `currentOnly`, `appliesBefore`, `appliesAll`, `removeBodyFirst` and `replacesNamed` gone.
- Validation, in Jest: the frame and the loaded summary of a day without targets render the same rows. `data-gauge`, `data-distance`, `data-reserved` and the new row's `data-targets-row` are each present in both or absent in both, and the same holds after a mark and after an add. Negative: no gauge, no range text and no distance copy in either reading, and never "This day did not load." for `targets: null`. With cache and day in disagreement, the row is `pending` and the targets read is invalidated once. Settings with only a later change shows one "From" row and no "Current". After removing the change in force with a later one left, `document.activeElement` is the same node before and after the refetch. Each new test fails against the old code.
- ui-validator: the pixel checks. At 320 × 568, 375 × 667, 390 × 844 and 1280 × 800, in both themes, a day with targets and one before the first change, the frame and the loaded day at the same height, the summary heights against section f's table. Real iPhone if reachable.

**Slice 2: a user with no targets.** One branch, one PR, or two (the way out first, removal second) if review wants them smaller. Backend first, then web. The slice edits FR-TGT-03 in `docs/requirements.md` to the approved wording, and makes the `TODO.md` changes in section 1.

Contract: `TargetsOverview.firstRunDue: boolean`, required. `PUT /users/me/first-run`: no body, 204, idempotent, 404 `user_not_found`. `DELETE /targets/:effectiveFrom`: 204 for the only change. `targets_last_change` leaves the error codes, the backend messages and the catalog.

_Backend_ (backend-engineer):

- `apps/backend/src/db/schema/users.ts` and `drizzle/migrations/0005_first_run_done.sql` with its snapshot (section c).
- `apps/backend/src/services/writes/settings.ts`: `finishFirstRun`. `apps/backend/src/routes/users.ts`: the route.
- `apps/backend/src/services/reads/targets.ts`: the flag read, `firstRunDue`.
- `apps/backend/src/services/writes/targets.ts`: no count, the flag set under the lock it holds. `lib/errors.ts`, `packages/types/src/errors.ts` and `targets.ts`.
- Tests: example steps 1 and 5. `targets.db.test.ts:131` becomes "removes the only change". `:153` becomes "two concurrent removals of a user's two changes answer 204 and 204 and leave none". The route twice answers 204, and `updated_at` moves once. Removal still does not wait behind logging a food.
- Validation: `db:generate` leaves `apps/backend/drizzle` clean. `firstRunDue` is never true after a removal (negative).

_Web_ (frontend-engineer):

- `TargetsGate.tsx`: `firstRunDue`, the reopened page from `history.state`, `useFirstRun()` with `open()` and `returned`.
- `FirstRunTargets.tsx`: Continue without targets, `onLeave` when reopened, no account block.
- `DayTab.tsx`, `DaySummary.tsx`, `DateBar.tsx`: the `none` kind and Set targets, focus on the date button on return.
- `TargetsSection.tsx`, `TargetsSheet.tsx`: the empty state, the button's label, the title from the retained changes, `canRemove` while editing, the `targets_last_change` branch gone.
- `lib/api/targets.ts` JSDoc, the API call for the route, `en.json`.
- Fixtures: `overview()` takes `firstRunDue`, default `false`.
- Docs: `docs/app/settings.md`, the Edit sheet paragraph ("Opened from a row, the sheet edits that change", line 20 after slice 1), still names the refusal for removing the last change ("You need at least one set of targets."). That sentence goes with `targets_last_change`.
- Validation, in Jest: removing the only change keeps the shell mounted through the refetch (no first run, no spinner), and `document.activeElement` is the same node and reads "Set targets". Continue without targets on the self-shown page sends the route and never calls `history.back()`. Opened from 10 November, Continue, Back and Save each return to 10 November at the same address, with focus on the date button. A reload with `history.state.firstRun` set shows the page, and Forward after Back shows it again. Set targets on a stale cache whose refetch answers a change opens nothing. The Set targets row is identical on a day with no entries and one with ten, and on today and a past day. Negative: no Sign out or Delete account on the first run, no accent class, icon or count in the row, Set targets never shown to a user with a change. Each new test fails against the old code.
- ui-validator: the first run at 320, 375 and 390, self-shown and reopened, the Set targets row in both themes and read for neutrality, Settings' three states, the removal of the only change. Real iPhone for Back from the reopened page if reachable.

The validator, ui-validator and reviewer follow each engineer as CLAUDE.md sets out. Then the orchestrator invokes `documentation-specialist`, squashes and opens each PR. Each agent step is logged in `logs.txt`.

## Resolved defaults (orchestrator, 2026-11-18, owner may veto)

Decided by Artur on 2026-11-18, not vetoable here: calls 1 to 4, the Day tab control that opens the first-run screen, its neutrality, and the FR-TGT-03 and FR-TGT-07 wordings.

- "First run done" is a column, set by Continue without targets and by any removal. Veto cost: device storage, shown per device.
- The first run's way out reads "Continue without targets", on both ways in. Veto cost: one string, or two for a second label.
- The Day tab's control is "Set targets" alone, an ink text button. Veto cost: one string, or two with a sentence before it.
- A user with targets, on a day before them, sees "Targets apply from {date}." and no control. Veto cost: one string and one test for a link after it.
- The reopened first run is one history entry whose state the gate reads, not a route. Veto cost: a route and its guard.
- `inForceOn` stays in the backend, and the web's frame compares with `changes[0]`. Veto cost: a move to `packages/types`.
- A loaded day whose answer disagrees with the cached changes holds its row empty and refetches the targets. Veto cost: a `targetsFrom` field on the day.
- `finishFirstRun` and the removal bump `users.updated_at` when they set the flag. Veto cost: one column in two updates.
- Settings with no targets reads "Days show their figures without ranges." and "Set targets", which opens the sheet. Veto cost: two strings and a ternary.
- The sheet's line is a span sentence plus an earlier-days sentence. Veto cost: six strings.
- Moving a change's start date is filed, not built. Veto cost: a design.
- The scope and product sentences stay as written. Veto cost: none here.
