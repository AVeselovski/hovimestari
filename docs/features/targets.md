# Targets

A user's daily targets: a calorie range and a protein range, each with a lower and an upper bound, in the user's own numbers. Targets change from a date the user picks, and a change never rewrites the days before it.

## In detail

### Setting your targets

Targets are two ranges. Calories run from a lower to an upper number of kcal. Protein runs from a lower to an upper number of grams, and its lower number is the floor. Every bound is a number above zero with at most one decimal. The lower bound may equal the upper one, but never exceed it. Calories go up to 99999.9 and protein up to 9999.9. Those are storage limits and say nothing about what a target should be.

### Changing your targets

A change holds both ranges and starts on a date the user picks, in the past, today or in the future. It stays in force until the next change starts. Saving a change on a date that already has one replaces that change, so a date holds one change at most.

A new change leaves every day before its date as it was. Editing or removing a change on a past date does change the days it covers: every day from its date to the day before the next change. The first change also covers every day before it, so editing it changes those days too.

A change can be removed, except the last one. A user who has targets always keeps a set.

### Which targets a day uses

A day uses the change with the latest start on or before that day. A day before the first change uses the first change. So once a user has targets, every day has targets.

"Today" is the calendar date in the user's time zone. The time zone is an account setting, and a new account starts with Helsinki time. A day starts at local midnight in that zone.

### The first run

A new account has no targets, and no day has targets in force until the first change is saved. Asked for a day's targets, the app then answers that there are none, with no number at all.

### Not advice

Hovimestari never suggests, prefills or computes a target. It holds no default value, offers no calculator, and its error messages name no number to aim for. Every target is a number the user entered. It measures days against those numbers and says nothing about what they should be.

## How it works

### The dated change

`target_changes` holds one row per change: the user, `effective_from` and the four bounds. `targetsOn(ctx, date)` in `apps/backend/src/services/reads/targets.ts` reads the row with the latest `effective_from` on or before `date`, and falls back to the user's earliest row. It answers null only for a user with no rows. `targetsOverview` answers that change, every change oldest first, the date asked for and the user's today.

`setTargets` in `apps/backend/src/services/writes/targets.ts` inserts the row, or overwrites the one on the same date. An identical save writes nothing. `removeTargetChange` runs in a transaction that first locks the user's row in `users`, then refuses a date with no change (404) and the last change (409). The lock makes two removals at once wait for each other, so they cannot both find another change left.

Validation is `SetTargetsBodySchema` in `packages/types/src/targets.ts`, and two CHECKs repeat the range rule in the database.

### Today and the time zone

`contextFor(req)` in `apps/backend/src/lib/requestContext.ts` builds the context every service gets: the user, the database, `now`, the user's `time_zone` and `today`. `calendarDate(now, zone)` in `apps/backend/src/lib/userTime.ts` gives the `YYYY-MM-DD` that `now` falls on in that zone, through `Intl`. A daylight-saving switch moves the hour a date starts at, never which date an instant falls on. A stored zone the runtime no longer knows falls back to `Europe/Helsinki`, with a log line.

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

- No screen asks a new user for targets before the rest of the app, because the web app has no targets screens yet.

Requirements: FR-TGT-01, FR-TGT-02, FR-TGT-04 to FR-TGT-07, NFR-ADV-01 (requirements 3.1 and 4)

## Where it appears

- The web app has no targets screens yet. The API is reached directly.
