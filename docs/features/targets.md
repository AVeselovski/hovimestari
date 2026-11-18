# Targets

A user's daily targets: a calorie range and a protein range, each with a lower and an upper bound, in the user's own numbers. Targets change from a date the user picks, and each day is measured against the change in force on it. The app offers no default and no suggestion.

## In detail

### Setting your targets

Targets are two ranges. Calories run from a lower to an upper number of kcal. Protein runs from a lower to an upper number of grams, and its lower number is the floor. A range needs both bounds. Every bound is a number above zero with at most one decimal. The lower bound may equal the upper one, but never exceed it. Calories go up to 99999.9 and protein up to 9999.9. Those are storage limits and say nothing about what a target should be.

### Changing your targets

A change holds both ranges and starts on a date the user picks, in the past, today or in the future. It stays in force until the next change starts. Saving a change on a date that already has one replaces that change, so a date holds one change at most.

A change covers every day from its date to the day before the next change, or every day from its date on when no change follows. The first change also covers every day before it.

Saving or removing a change rewrites the days it covers, and only those:

- A new change on a future date, after an earlier change, rewrites no day that has passed. Every day before its date keeps its targets.
- A new change on today or a past date rewrites every day it covers, from its date on.
- A new change before every other change becomes the first one. It covers every day before the next change, so it rewrites those days, today and the past included, even when its own date is in the future.
- Editing a change rewrites every day it covers.
- Removing a change hands its days to the change before it, or, for the first change, to the next one.

A change can be removed, except the last one. A user who has targets always keeps a set.

### New targets and edited targets

The targets sheet sets new targets or edits a change the user already has.

New targets start empty. "Change targets" and the first run open with their four fields empty. On "Change targets" they stay empty whatever date is picked, a date that already has a change of its own included. The title then names that change, so the user knows a save replaces it. Save on an empty field shows "Enter a number." under its pair.

An edited change starts with its own targets. A change opened from the list shows its four numbers as stored, in the form the fields read back, such as "142,5" on a Finnish phone. Its date is fixed. The numbers are read once, as the sheet opens, so a save from another device while it is open moves nothing on screen. An edited change opened and left as it was is not a change. It closes without asking, and Save closes it without sending anything.

Under the fields, a line names the days the numbers apply to, from the rule in [Changing your targets](#changing-your-targets):

- From a date with no later change: "These apply from 18 November 2026 on. Earlier days keep their targets."
- From a date with a later change: "These apply from 18 November 2026 to 30 November 2026. Other days keep their targets."
- When the next change starts the day after: "These apply to 30 November 2026 only. Other days keep their targets."
- Before every other change: "These apply to every day before 1 November 2026. Later days keep their targets."
- With no other change: "These are your only targets, so they apply to every day."

The line says which other days keep their targets only where such days have targets of their own. Dates show in the device's language.

### Which targets a day uses

A day uses the change with the latest start on or before that day. A day before the first change uses the first change. So once a user has targets, every day has targets. [Where a day stands](days.md#where-a-day-stands) is measured against them.

"Today" is the calendar date in the user's time zone. The time zone is an account setting, and a new account starts with Helsinki time. A day starts at local midnight in that zone. The web app stores its device's time zone on the account at each start, when the two differ, so "today" follows the device the app last ran on. A refused zone or a failed write is dropped without a word, the stored zone stays, and the next start tries again.

### The first run

A new account has no targets, and no day has targets in force until the first change is saved. Asked for a day's targets, the app then answers that there are none, with no number at all.

Until then the web app shows one page in place of the tabs. It asks for both ranges and saves them as a change starting today. Signing out and deleting the account stay on that page.

### The first-run gate

The web app decides between the first-run page and the tabs on one fact: whether the account has any targets change. It reads that from the targets in force today.

- No answer yet while the read runs: a spinner, and only on the first decision. Once the tabs have shown, a read that starts later keeps them until it answers.
- An answer with no change: the first-run page, in place of the tabs.
- An answer with a change: the tabs, whatever a later read is doing, so a refetch never closes an open sheet.
- No answer because the device is offline or the server failed: the tabs, with the offline line.

Only a definite answer that the account has no targets shows the first-run page, so a person with targets is never asked again because a request failed. An app that starts without a connection has an offline session, and makes no read at all until the session is back. The page has no address of its own, so a deep link survives the gate.

### Not advice

Hovimestari never suggests or computes a target. It holds no default value, offers no calculator, and its error messages name no number to aim for. No target field holds an example. A field starts empty, or with [a change's own targets](#new-targets-and-edited-targets) when the user edits that change. Every target is a number the user entered. It measures days against those numbers and says nothing about what they should be.

## How it works

### The dated change

`target_changes` holds one row per change: the user, `effective_from` and the four bounds. `targetsOn(ctx, date)` in `apps/backend/src/services/reads/targets.ts` reads the row with the latest `effective_from` on or before `date`, and falls back to the user's earliest row. It answers null only for a user with no rows. `targetsOverview` answers that change, every change oldest first, the date asked for and the user's today. The targets sheet edits a change with the numbers of that change in this list. `spanOf` in `apps/web/src/components/targets/targetLines.ts` names the days a save applies to.

`setTargets` in `apps/backend/src/services/writes/targets.ts` inserts the row, or overwrites the one on the same date. An identical save writes nothing. It first takes the user's row `FOR KEY SHARE` through `lockUserForWrite`, so a save never waits behind a session renewal, and one that races an account deletion answers 404 `user_not_found`. `removeTargetChange` runs in a transaction that first locks the user's row in `users`, then refuses a date with no change (404) and the last change (409). The lock makes two removals at once wait for each other, so they cannot both find another change left.

Validation is `SetTargetsBodySchema` in `packages/types/src/targets.ts`, and two CHECKs repeat the range rule in the database.

### Today and the time zone

`contextFor(req)` in `apps/backend/src/lib/requestContext.ts` builds the context every service gets: the user, the database, `now`, the user's `time_zone` and `today`. `calendarDate(now, zone)` in `apps/backend/src/lib/userTime.ts` gives the `YYYY-MM-DD` that `now` falls on in that zone, through `Intl`. A daylight-saving switch moves the hour a date starts at, never which date an instant falls on. A stored zone the runtime no longer knows falls back to `Europe/Helsinki`, with a log line.

The web app follows the server's today.

Every answer that carries a newer today, a targets read, a day read or a write, moves the whole app to it, and the days are read again. Today moves forward only, so a late answer from before midnight cannot take the app back a day. A change of the account's time zone is the exception: the first targets answer after it is taken as it is, earlier or not, because a zone to the west can make today earlier. An entry write still out when the zone changes answers with the old zone's days. Its answer is left out of the cache and those days are read again, so the old zone's today never moves the app forward again.

The app also asks again when the page is shown, when the connection returns and, while the device's own date is ahead of the server's, at most every 5 minutes. Each ask is sent once and ends when the device goes offline, so writes never wait on it for long. While it is out the day on screen stays. The server's date always wins. `TodayProvider` in `apps/web/src/components/targets/` holds it, and the Day tab and Settings both read it.

The zone is written through `PATCH /users/me/settings`. `TimeZoneSchema` in `packages/types/src/dates.ts` stores the zone's canonical IANA name, so `europe/helsinki` becomes `Europe/Helsinki`. It refuses a name `Intl` does not know, an offset-style name such as `+02:00` and a name over 64 characters, each with `invalid_time_zone`.

### API

All under `/api/v1`, all Bearer. A refused request answers `{ message, code }`.

| Method | Path                      | Answers                                                                                                                               |
| ------ | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/targets?date=`          | 200 `{ date, today, inForce, changes }`. Without `date`, the user's today. `inForce` is null only with no targets. 400 `invalid_date` |
| PUT    | `/targets/:effectiveFrom` | 200 with the change, created or overwritten. Takes `{ ranges: { energyKcal: { lower, upper }, proteinG: { lower, upper } } }`         |
| DELETE | `/targets/:effectiveFrom` | 204. 404 `target_change_not_found`. 409 `targets_last_change`                                                                         |

A date in a path or a query is a `YYYY-MM-DD` that exists, or 400 `invalid_date`. A refused range answers `target_required`, `target_value_invalid`, `target_not_positive` or `target_lower_above_upper`. The shapes are in `packages/types/src/targets.ts`.

### Data

- `target_changes`: `user_id` cascading from `users`, `effective_from` a date, `energy_kcal_lower` and `energy_kcal_upper` with one decimal, `protein_g_lower` and `protein_g_upper` with one decimal. The unique index `target_changes_user_date_uq` keeps one change per date and serves the lookup. The CHECKs `target_changes_energy_range` and `target_changes_protein_range` require `0 < lower <= upper`.
- `users.time_zone`: a canonical IANA zone name, `Europe/Helsinki` until the user's settings change it.

### Known gaps

- The note that the app is not a source of nutrition or medical advice shows where targets are set. The rules a connected assistant reads arrive with the assistant step.

Requirements: FR-TGT-01 to FR-TGT-07, NFR-ADV-01, NFR-ADV-02 (requirements 3.1 and 4)

## Where it appears

- [First run](../app/first-run.md): the first targets, before any other part of the app.
- [The Day tab](../app/day.md): the ranges the summary measures each day against, and the day it opens on.
- [Settings](../app/settings.md#targets): the targets in force, later and earlier changes, the targets sheet, empty for new targets and filled for a change being edited, and removing a change.
