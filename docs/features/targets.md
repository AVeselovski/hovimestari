# Targets

A user's daily targets: a calorie range and a protein range, each with a lower and an upper bound, in the user's own numbers. Targets change from a date the user picks, and each day is measured against the change in force on it. The app offers no default and no suggestion.

## In detail

### Setting your targets

Targets are two ranges. Calories run from a lower to an upper number of kcal. Protein runs from a lower to an upper number of grams, and its lower number is the floor. A range needs both bounds. Every bound is a number above zero with at most one decimal. The lower bound may equal the upper one, but never exceed it. Calories go up to 99999.9 and protein up to 9999.9. Those are storage limits and say nothing about what a target should be.

### Changing your targets

A change holds both ranges and starts on a date the user picks, in the past, today or in the future. It stays in force until the next change starts. Saving a change on a date that already has one replaces that change, so a date holds one change at most.

A change covers every day from its date to the day before the next change, or every day from its date on when no change follows. A day before the first change has no targets.

Saving, editing or removing a change rewrites the days it covers, and only those. Every day before its date stays as it was. Removing a change hands its days to the change before it. Removing the first change leaves its days with no targets.

Any change can be removed, the only one included. A user who removes every change has no targets, and every day then shows its figures without ranges.

### New targets and edited targets

The targets sheet sets new targets or edits a change the user already has.

New targets start empty. "Change targets", "Set targets" and the first run open with their four fields empty. In the sheet they stay empty whatever date is picked, a date that already has a change of its own included. The line under the fields then says first that a save replaces that change. Save on an empty field shows "Enter a number." under its pair.

An edited change starts with its own targets. A change opened from the list is titled "Edit targets", with "Starting on 17 November 2026" under the title. It shows its four numbers as stored, in the form the fields read back, such as "142,5" on a Finnish phone. Its date is fixed. The numbers are read once, as the sheet opens, so a save from another device while it is open moves nothing on screen. An edited change opened and left as it was is not a change. It closes without asking, and Save closes it without sending anything.

Under the fields, a line names the days the numbers apply to, from the rule in [Changing your targets](#changing-your-targets). It has one sentence for the days the numbers cover:

- From a date with no later change: "These apply from 18 November 2026 on."
- From a date with a later change: "These apply from 18 November 2026 to 30 November 2026."
- When the next change starts the day after: "These apply to 30 November 2026 only."

A second sentence says what the days before that date have. "Earlier days keep their targets." follows when a change starts before the date. "Earlier days have no targets." follows when none does, such as for the first change or a date before every change. Dates show in the device's language.

For new targets, a picked date that already has a change of its own puts two sentences before the line: "This date already has targets. Saving replaces them." An edited change keeps its own date, so its line has no such sentences.

Removing a change asks first. The confirmation names the days the change covered, by the same rule, and says what they then have. With an earlier change they go back to it, as in "Days from 1 December 2026 to 31 December 2026 are then measured against your earlier targets." With none, they have no targets, as in "Days from 1 December 2026 to 31 December 2026 will have no targets." or "15 November 2026 will have no targets." for a change that covers one day.

Once a change is saved or removed, the web app reads again every day it holds, also those not on screen. A day opened once that read has answered shows the new targets at once.

### Which targets a day uses

A day uses the change with the latest start on or before that day. A day before the first change has no targets, and neither has any day of a user with no change. Asked for such a day, the app answers that there are none, with no number at all. [Where a day stands](days.md#where-a-day-stands) is measured against the targets a day has.

"Today" is the calendar date in the user's time zone. The time zone is an account setting, and a new account starts with Helsinki time. A day starts at local midnight in that zone. The web app stores its device's time zone on the account at each start, when the two differ, so "today" follows the device the app last ran on. A refused zone or a failed write is dropped without a word, the stored zone stays, and the next start tries again.

### The first run

A new account has no targets, and no day has targets in force until the first change is saved. Asked for a day's targets, the app then answers that there are none, with no number at all.

The first run is due for an account that has no change and has never passed it. Going on without targets passes it, and so does removing any change. Once passed it is never due again, so a user who removes every change is not sent back to it. Saving targets does not pass it, but an account with a change has no first run due.

While it is due, the web app shows one page in place of the tabs. It asks for both ranges and saves them as a change starting today, or lets the person go on without targets. Either way the tabs follow. Logging without targets is a normal way to use the app. Signing out and deleting the account are in Settings.

A user with no targets can open the same page again from any day, through the Day tab's Set targets. It never opens by itself again. Going on without targets there, the browser's Back and a save each return to the day it was opened on.

### The first-run gate

The web app decides between the first-run page and the tabs on the targets read, which says whether the first run is due.

- No answer yet while the read runs: a spinner, and only on the first decision. Once the tabs have shown, a read that starts later keeps them until it answers.
- An answer with the first run due: the first-run page, in place of the tabs.
- Any other answer: the tabs, whatever a later read is doing, so a refetch never closes an open sheet. Removing the only change keeps the tabs.
- No answer because the device is offline or the server failed: the tabs, with the offline line.

Only a definite answer shows the first-run page by itself, so a person is never asked again because a request failed. An app that starts without a connection has an offline session, and makes no read at all until the session is back. The page has no address of its own, so a deep link survives the gate.

Opened again from a day, the page is one entry in the browser's history on the same address. The gate shows it while that entry is the current one, so a reload keeps it, Back closes it and Forward opens it again. It opens at the press. While the device is online, the targets are read again behind it, and when they turn out to have a change, saved on another device, the page goes Back as Continue does. Offline nothing is read, so the page never opens or closes later by itself. An entry marked open for a user who has a change shows the tabs and loses its mark.

A save on the page opened again goes back to the day once that day has read its new answer, after 2 seconds at most and at once while offline. Online, a day still without its answer then opens on its loading frame, laid out from the saved targets. Offline, it keeps the entries it holds, with the row the saved change sets, until the connection returns. Offline, Save and the self-shown page's Continue keep the page and say "You are offline. Changes need a connection.", as every form does.

Arriving on the tabs from the first-run page, by leaving the page opened again or by passing the self-shown one, puts focus on the Day tab's date button.

### Not advice

Hovimestari never suggests or computes a target. It holds no default value, offers no calculator, and its error messages name no number to aim for. No target field holds an example. A field starts empty, or with [a change's own targets](#new-targets-and-edited-targets) when the user edits that change. Every target is a number the user entered. It measures days against those numbers and says nothing about what they should be. Where targets are set, a note says "Hovimestari is not a source of nutrition or medical advice. It measures your days against the numbers you enter." The rules a [connected assistant](connected-ai.md#the-app-rules) reads say the same.

## How it works

### The dated change

`target_changes` holds one row per change: the user, `effective_from` and the four bounds. `targetsOn(ctx, date)` in `apps/backend/src/services/reads/targets.ts` reads the row with the latest `effective_from` on or before `date`. It answers null when there is none: on a date before the user's first change, and on every date for a user with no rows. `targetsOverview` answers that change, every change oldest first, the date asked for and the user's today. The targets sheet edits a change with the numbers of that change in this list. `spanOf` in `apps/web/src/components/targets/targetLines.ts` names the days a save on a date applies to, and whether a change starts before it. The same span names the days a removal of the change on that date gives back or leaves without targets.

`setTargets` in `apps/backend/src/services/writes/targets.ts` inserts the row, or overwrites the one on the same date. An identical save writes nothing. It first takes the user's row `FOR KEY SHARE` through `lockUserForWrite`, so a save never waits behind a session renewal, and one that races an account deletion answers 404 `user_not_found`. `removeTargetChange` runs in a transaction that first locks the user's row in `users` `FOR NO KEY UPDATE`, then refuses a date with no change (404), deletes the change and marks the first run passed. Two removals at once wait for each other. Logging a food holds only `FOR KEY SHARE` on that row, so a removal never waits behind it.

### The first-run fact

`users.first_run_done_at` records that the first run is behind the user. `markFirstRunDone` in `apps/backend/src/services/writes/settings.ts` sets it and `updated_at` to the request's `now`, only while it is null, so a repeat writes nothing and the first time stays. `finishFirstRun` calls it for `PUT /users/me/first-run`, and `removeTargetChange` calls it inside its own transaction. `targetsOverview` answers `firstRunDue`, true only with no change and a null column. It reads both facts in one SQL statement, so a removal that commits during the read can never make it true.

In the web app, `TargetsGate` in `apps/web/src/components/targets/` shows `FirstRunTargets` while `firstRunDue` is true. `useFirstRun().open()` pushes a history entry on the same address whose state carries `firstRun: true` next to the router's own, then reads the targets once with `retry: false` while `onlineManager` says online. The gate reads that flag as it mounts and on every `popstate`, and clears it with `replaceState` on an entry it ignores. Opened this way the page gets `onLeave`, which goes Back. Its save waits for `afterTargetsChange(client, { returnTo, saved })` in `apps/web/src/lib/invalidation.ts`. That puts the saved change into the cached targets read (`putSavedChange` in `apps/web/src/lib/targetsCache.ts`), reads the targets and the day the page returns to, first, and the other days it holds without waiting for them. It waits `RETURN_WAIT_MS` at most and drops the returned day's old answer when no new one came. `takeReturned()` tells the Day tab's next mount on the address the tabs arrived at to put focus on the date button.

Validation is `SetTargetsBodySchema` in `packages/types/src/targets.ts`, and two CHECKs repeat the range rule in the database.

### Today and the time zone

`contextFor(req)` in `apps/backend/src/lib/requestContext.ts` builds the context every service gets: the user, the database, `now`, the user's `time_zone` and `today`. `calendarDate(now, zone)` in `apps/backend/src/lib/userTime.ts` gives the `YYYY-MM-DD` that `now` falls on in that zone, through `Intl`. A daylight-saving switch moves the hour a date starts at, never which date an instant falls on. A stored zone the runtime no longer knows falls back to `Europe/Helsinki`, with a log line.

The web app follows the server's today.

Every answer that carries a newer today, a targets read, a day read or a write, moves the whole app to it, and the days are read again. Today moves forward only, so a late answer from before midnight cannot take the app back a day. A change of the account's time zone is the exception: the first targets answer after it is taken as it is, earlier or not, because a zone to the west can make today earlier. An entry write still out when the zone changes answers with the old zone's days. Its answer is left out of the cache and those days are read again, so the old zone's today never moves the app forward again.

The app also asks again when the page is shown, when the connection returns and, while the device's own date is ahead of the server's, at most every 5 minutes. Each ask is sent once and ends when the device goes offline, so writes never wait on it for long. While it is out the day on screen stays. The server's date always wins. `TodayProvider` in `apps/web/src/components/targets/` holds it, and the Day tab and Settings both read it.

The zone is written through `PATCH /users/me/settings`. `TimeZoneSchema` in `packages/types/src/dates.ts` stores the zone's canonical IANA name, so `europe/helsinki` becomes `Europe/Helsinki`. It refuses a name `Intl` does not know, an offset-style name such as `+02:00` and a name over 64 characters, each with `invalid_time_zone`.

### API

All under `/api/v1`, all Bearer. A refused request answers `{ message, code }`.

| Method | Path                      | Answers                                                                                                                                                         |
| ------ | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/targets?date=`          | 200 `{ date, today, inForce, changes, firstRunDue }`. Without `date`, the user's today. `inForce` is null on a date before the first change. 400 `invalid_date` |
| PUT    | `/targets/:effectiveFrom` | 200 with the change, created or overwritten. Takes `{ ranges: { energyKcal: { lower, upper }, proteinG: { lower, upper } } }`                                   |
| DELETE | `/targets/:effectiveFrom` | 204, for the only change too. Marks the first run passed. 404 `target_change_not_found`                                                                         |
| PUT    | `/users/me/first-run`     | 204, idempotent. No body. Marks the first run passed. 404 `user_not_found` for a deleted account                                                                |

A date in a path or a query is a `YYYY-MM-DD` that exists, or 400 `invalid_date`. A refused range answers `target_required`, `target_value_invalid`, `target_not_positive` or `target_lower_above_upper`. The shapes are in `packages/types/src/targets.ts`.

### Data

- `target_changes`: `user_id` cascading from `users`, `effective_from` a date, `energy_kcal_lower` and `energy_kcal_upper` with one decimal, `protein_g_lower` and `protein_g_upper` with one decimal. The unique index `target_changes_user_date_uq` keeps one change per date and serves the lookup. The CHECKs `target_changes_energy_range` and `target_changes_protein_range` require `0 < lower <= upper`.
- `users.time_zone`: a canonical IANA zone name, `Europe/Helsinki` until the user's settings change it.
- `users.first_run_done_at`: when the user passed the first run, null until then. Set once and never cleared.

Requirements: FR-TGT-01 to FR-TGT-07, NFR-ADV-01, NFR-ADV-02 (requirements 3.1 and 4)

## Where it appears

- [First run](../app/first-run.md): the first targets, or going on without them, before any other part of the app, and again on request from a day.
- [The Day tab](../app/day.md): the ranges the summary measures each day against, the day it opens on, and Set targets for a user with none.
- [Settings](../app/settings.md#targets): the targets in force, later and earlier changes, the targets sheet, empty for new targets and filled for a change being edited, and removing a change.
