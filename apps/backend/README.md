# @hovimestari/backend

The REST API behind the web app: Node.js and Express 5 in TypeScript, Drizzle ORM on PostgreSQL 16, JWT sessions, optional Google OAuth 2.0 and email through Resend. Feature behaviour lives in the [feature docs](../../docs/features.md). This README covers the source layout, the endpoints, the database, tests and deployment.

## Source structure

```text
src/
├── index.ts                    Entry point: the last-resort handlers, the HTTP server, its keep-alive timeouts and the stats log
├── app.ts                      The Express app: the request log, /mcp while MCP_ENABLED, CORS, the JSON parser, Google when configured, /livez, /health, the routes, the error handler
├── db/
│   ├── index.ts                Drizzle client, the pg pool and its settings, poolStats()
│   ├── types.ts                Db, the database or a transaction, and Tx, a transaction only, for code that holds a lock
│   └── schema/
│       ├── index.ts            Re-exports every table
│       ├── assistantConnections.ts  assistant_connections: a user's connection keys, stored as hashes, with access, expiry, last use and revocation
│       ├── assistantChanges.ts  assistant_changes: the record of an assistant's changes, with the ids it touched and the request key
│       ├── users.ts            Accounts, with the sign-in method and lower-case email CHECKs, the food-name language, the time zone and when the first run was passed
│       ├── targets.ts          target_changes: one row per dated change of a user's targets
│       ├── foods.ts            foods, food_portions, food_favourites and food_lookups, with the generated search columns
│       ├── savedMeals.ts       saved_meals: a user's meal with its figures for one meal, archived or hidden
│       ├── entries.ts          entries: one row per entry on a day, its basis and amount, with the CHECKs per kind
│       ├── removedEntries.ts   removed_entries: a removed entry's whole row, kept ten minutes for a restore
│       ├── refresh-tokens.ts   One row per token, grouped by sign-in into families, stored as a hash
│       └── password-reset-tokens.ts  One row per reset link, stored as a hash
├── lib/
│   ├── env.ts                  Typed env vars, parsed with Zod. Google all or none, Resend required in production
│   ├── errors.ts               AppError (message, status, code), ERROR_MESSAGES and appError(code, status)
│   ├── parseBody.ts            parseBody and parseQuery: a body or a query string parsed with a shared schema, answering its error code on failure
│   ├── requestContext.ts       contextForUser(user, now), the pure service context, and contextFor(req), which reads the user first
│   ├── writeStatus.ts          statusOf(outcome): 201 for an add that wrote, 200 for a repeat
│   ├── userTime.ts             calendarDate(now, zone), the fallback zone and the stored-zone check
│   ├── failureOf.ts            What an unexpected error logs: stack, code and constraint, never row values or a data error's message
│   ├── lastResort.ts           Logs an unhandled rejection or uncaught exception through failureOf, then exits 1
│   ├── shutdown.ts             On SIGTERM or SIGINT: finish requests in flight, end the pool, exit. Ten seconds at most
│   ├── runtimeStats.ts         The 30 s pool and memory log line
│   ├── requestAborted.ts       isAborted(req): has the client gone or the response been sent
│   ├── clientIp.ts             The address the rate limiters key on: the relayed X-Client-Ip, Fly-Client-IP, or the socket
│   ├── jwt.ts                  Token sign, verify and hash, and the signed OAuth state with its purpose
│   ├── sessions.ts             Sessions as token families: sign-in, renewal, sign-out, the user lock and whether a session is live
│   ├── passwords.ts            bcrypt at cost 12, the 72-byte rule and the dummy compare for refused sign-ins
│   ├── users.ts                findUser
│   ├── connectionKeys.ts       The connection key's format and hash, lookupConnectionKey with its four states and touchDue, touchLastUsed
│   ├── google.ts               googleConfig and googleEnabled
│   ├── passport.ts             The Google sign-in and link strategies, and the consent URL builder
│   ├── oauthStateCookie.ts     The cookie that ties a Google consent to the browser that went to Google
│   ├── oneTimeCodes.ts         Single-use, one-minute codes that finish Google sign-in and linking, in process
│   ├── email.ts                The mailer: Resend, or the console without a key, and the reset mail
│   ├── pgErrors.ts             Reads a Postgres error: its SQLSTATE, and unique, check and foreign-key violations on a named constraint
│   ├── isUuid.ts               Whether a path id is a UUID, before Postgres sees it
│   └── openFoodFacts/          The barcode lookup's helpers, each tested on its own
│       ├── gtin.ts             Reads a barcode by the GS1 rules: check digit, UPC-E, the shop's own numbers
│       ├── client.ts           The one call to Open Food Facts: timeout, body cap, a User-Agent with nothing personal
│       ├── product.ts          Parses a product and decides what is kept: names, the four values, incomplete or implausible
│       ├── limiter.ts          Token buckets for the two call budgets, on an injected clock
│       └── cache.ts            Answers not stored, held 10 minutes, on an injected clock
├── mcp/                        Connected AI's endpoint: an assistant's key in, the read services and the recorded writes out
│   ├── router.ts               /mcp in order: the Origin refusal, the brakes, the body parser, the key check, the request limit per user, last use, the protocol handler
│   ├── auth.ts                 verifyConnectionKey and requireConnectionKey: a key to AuthInfo for its user, or a 401 saying why
│   ├── server.ts               The server built per request: instructions, the tools, the app rules resource, and contextForUser per call
│   ├── result.ts               defineTool, runTool, the answer envelope, refusals with their code and seconds to wait, the tool log line
│   ├── inputs.ts               DayDate, DayRange, RequestKey, writeInput and EntryIdSet for tool inputs, and dateIn, which reads today as the person's today
│   ├── writeBrake.ts           The per-minute window on write calls, keyed by user, and the hourly limit's numbers
│   ├── appRules.ts             The app rules text, the write rules, appRulesFor and APP_RULES_SOURCES, the feature docs' stamps
│   └── tools/
│       ├── index.ts            READ_TOOLS, the 12 tools every key lists
│       ├── context.ts          get_context: the key's access, today, the targets and the rules
│       ├── days.ts             get_targets, get_day and get_days, a range or the week of a date
│       ├── foods.ts            search_foods, get_food, the favourite, own and recent lists, and look_up_barcode
│       ├── meals.ts            list_saved_meals and get_saved_meal
│       └── writes/
│           ├── index.ts        WRITE_TOOLS, listed only to a key that can write while writing is on
│           ├── run.ts          defineWriteTool and runWriteTool: the brakes, the request hash, the replay, the recorded write, the note
│           ├── entries.ts      The eight entry write tools: log_food, log_saved_meal, log_estimate, update_entry, set_entries_status, copy_entries, remove_entries, restore_entry
│           ├── foods.ts        create_own_food, update_own_food, add_portion, update_portion and set_favourite
│           ├── meals.ts        create_saved_meal, update_saved_meal and set_saved_meal_archived
│           └── targets.ts      set_targets and remove_targets
├── middleware/
│   ├── authenticate.ts         Bearer access token check, sets req.user
│   ├── requireBff.ts           The relay secret check and the relayed client address rules
│   ├── authRateLimits.ts       The six auth rate limiters and resetAuthRateLimits for tests
│   ├── error.ts                Global error handler: { message, code }, 503 when the database is busy, 500 otherwise
│   └── requestLog.ts           One line per request: method, route key, status, duration
├── routes/
│   ├── index.ts                Mounts /auth, /users, /targets, /foods, /days, /entries, /saved-meals, /log and /connections
│   ├── targets.ts              Targets: the overview for a date, set a dated change, remove one
│   ├── foods.ts                Food search, favourites, own foods, the barcode lookup, one food, own food writes, portions, favourite toggles
│   ├── days.ts                 One day, or a range of days without their entries
│   ├── entries.ts              Add, change, mark, copy, remove one or several, and restore entries
│   ├── savedMeals.ts           Saved meals: list, read, create, save and log, edit, archive, delete
│   ├── log.ts                  Recent items
│   ├── connections.ts          Connection keys: list with their change counts and past connections, create, revoke, and one connection's record of changes by page
│   ├── auth.ts                 Sign-up, sign-in, refresh, sign-out, password reset, password link, unlink
│   ├── authGoogle.ts           Google sign-in and linking, and their code exchanges
│   └── users.ts                The signed-in user: read, change settings, pass the first run, change password, delete the account
├── services/                   What a route does, without Express. The assistant's tools call the same functions
│   ├── reads/context.ts        ReadContext: the user, the database, now, the time zone and today
│   ├── reads/targets.ts        targetsOn, the in-force rule (null before the first change), inForceOn, its pure form, and targetsOverview, with firstRunDue
│   ├── reads/foods.ts          searchFoods, getFood, listFavouriteFoods, listOwnFoods
│   ├── reads/days.ts           getDay and listDaySummaries: the two readings and their positions. getEntry, one entry by its id
│   ├── reads/log.ts            listRecents and lastAmountsOf, from eaten entries
│   ├── reads/savedMeals.ts     listSavedMeals and getSavedMeal
│   ├── reads/connections.ts    listConnections, changeCount and listPastConnections, and connectionAvailability, the two switches as the server holds them now
│   ├── reads/changeRecord.ts   listChanges: one connection's record, newest first, by cursor, with the cursor's encoding
│   ├── writes/context.ts       WriteContext and WriteOutcome
│   ├── writes/targets.ts       setTargets, and removeTargetChange, which also marks the first run passed
│   ├── writes/foods.ts         Own foods, portions and favourites
│   ├── writes/barcode.ts       lookupBarcode, and the process's budgets and memory for it
│   ├── writes/entries.ts       addEntry, updateEntry, setEntriesStatus, removeEntry, removeEntries, restoreEntry, copyEntries
│   ├── writes/savedMeals.ts    Saved meal writes and saveAndLog
│   ├── writes/settings.ts      updateSettings: the food-name language and the time zone. finishFirstRun and markFirstRunDone
│   ├── writes/connections.ts   createConnection for a live session under the user lock and the ten-key limit, revokeConnection, revokeAllConnections
│   ├── writes/changeRecord.ts  recordedWrite, which runs an assistant's write and its record row in one transaction, findReplay, replayAfterConflict, requestHashOf, countRecentChanges, fieldChanges, goneAsNull
│   ├── writes/recorded/entries.ts  One function per entry write tool: its before-read, the one screen write it calls, its record, and its replay reader
│   ├── writes/recorded/foods.ts  The same for the own-food, portion and favourite tools
│   ├── writes/recorded/savedMeals.ts  The same for the saved-meal tools
│   ├── writes/recorded/targets.ts  The same for set_targets and remove_targets, with their user locks
│   ├── entryRows.ts            The selection every entry read answers with, and an entry's figures
│   ├── sourceValues.ts         Reads an entry's basis from its source, takes the user lock, checks a source's use and rewrites planned entries
│   ├── foodScope.ts            visibleTo and portionVisibleTo, the only place the visibility rules are written
│   ├── foodRows.ts             The selection every food read answers with, names in the user's language
│   └── foodSearch.ts           The query's words and the ranked search query
├── scripts/
│   ├── fineliImport/           The Fineli import command
│   │   ├── index.ts            Entry point: a pool from DATABASE_URL alone, the default folder, the exit code
│   │   ├── cli.ts              Arguments, the run, VACUUM ANALYZE foods, the exit codes
│   │   ├── readRelease.ts      Reads a release folder into foods and portions, or names the missing file or column
│   │   ├── applyRelease.ts     Writes a release in one transaction: upserts, retirement, the retire and rename guards, portions
│   │   └── report.ts           The report a person reads after each run
│   └── mcpSmoke/               The MCP smoke check
│       ├── index.ts            Its own user and data through the API, every read tool against its route, the revoke and the clean-up
│       ├── writeLeg.ts         log_food against POST /entries, the record rows, and the record read back by page
│       ├── localOnly.ts        The guard: a local database made for the run, or one named for this run
│       └── checks.ts           The tool names each key lists, and the tally
└── types/
    └── express.d.ts            req.user and req.relay
```

## Endpoints

Every route but `/mcp`, `/livez` and `/health` is under `/api/v1`. The feature docs list them with who may call each: [authentication](../../docs/features/authentication.md#api), [targets](../../docs/features/targets.md#api), [foods](../../docs/features/foods.md#api), [days](../../docs/features/days.md#api), [quick logging](../../docs/features/quick-logging.md#api), [saved meals](../../docs/features/saved-meals.md#api) and [connected AI](../../docs/features/connected-ai.md#api). A route parses its input, builds the service context with `contextFor(req)`, calls one service in `src/services/` and sends the answer. It holds no SQL. Two more routes live outside it, with no auth:

- `GET /livez` answers 200 while the process serves HTTP. It never touches the database, so Fly's routing check cannot fail on a busy pool.
- `GET /health` answers 200 when the database answers `SELECT 1`, and 503 otherwise. It is for monitoring.

A known error answers `{ message, code }`, and the codes are `ERROR_CODES` in `@hovimestari/types`. A known error that says when to try again, such as a barcode lookup over its budget, also sends `Retry-After`. A busy database answers 503 with `Retry-After: 2`, and an unexpected error answers 500. Both carry a `message` and no code.

### The barcode lookup

`POST /foods/lookup` calls Open Food Facts from the server. Two env values steer it, both optional and neither a secret:

- `OFF_BASE_URL`: where the calls go. `https://world.openfoodfacts.org` by default.
- `OFF_USER_AGENT`: the User-Agent of every call. `Hovimestari/<version of this package>` by default. Open Food Facts asks for a contact in it, which a deployment may add, such as `Hovimestari/1.0 (an address you choose)`. Nothing builds it from user data.

The two call budgets and the answers held in memory live in the process, so the backend runs on one machine. How the lookup works is in [the foods feature doc](../../docs/features/foods.md#looking-up-a-barcode).

### The MCP endpoint

`POST /mcp` is where a connected assistant calls, with `Authorization: Bearer` and a connection key. It is outside `/api/v1`, mounted after the request log and before CORS and the JSON parser, so it sends no CORS headers and parses its own body with a 100 kB limit. Any request with an `Origin` header answers 403. A connection key opens nothing under `/api/v1`, and an access token opens nothing at `/mcp`. The router's steps, its limits and what a request must carry in each protocol revision are in [the connected AI feature doc](../../docs/features/connected-ai.md#the-endpoint). The limits live in process memory, like the other rate limits.

A tool in `src/mcp/tools/` calls the read service its REST route calls and selects fields. `look_up_barcode` calls `lookupBarcode` with `sharedLookupDeps()`, as `POST /foods/lookup` does, so both spend one budget. A new read tool is a `defineTool` in its area's file, added to `READ_TOOLS`. A new write tool is a `defineWriteTool` under `src/mcp/tools/writes/`, added to `WRITE_TOOLS`, that calls one function in `src/services/writes/recorded/`. `src/mcp/__tests__/importBoundary.test.ts` fails when a file under `src/mcp/` imports a route, middleware, the database module, `drizzle-orm` or a database driver, imports a module by a computed path or through `createRequire`, imports a `lib/` module that is not on its allow-list, or reaches the database client or builds SQL. A change to any `docs/features/*.md` re-reads the app rules section that names it in `src/mcp/appRules.ts` and re-stamps it in `APP_RULES_SOURCES`. `src/mcp/__tests__/appRules.test.ts` fails until then, printing the doc's new hash.

### The connected AI switches

`MCP_ENABLED` and `MCP_WRITES_ENABLED` are the operator's switches for connected AI, each `true` or `false`, neither a secret. `MCP_ENABLED` is `true` by default and `MCP_WRITES_ENABLED` is `false`. Unset or empty takes the default, and any other value stops the server at start-up. A change takes a restart. While `MCP_ENABLED` is off no connection key can be made and `/mcp` answers 404. While `MCP_WRITES_ENABLED` is on, a key that can make changes also lists the write tools. While it is off no key that makes changes can be made, and a key that can make changes reads only. What each does is in [the connected AI feature doc](../../docs/features/connected-ai.md#the-two-switches).

### The relay secret

The routes that answer a refresh token (`register`, `login`, `refresh`, `logout` and both Google exchanges) answer only the web app's route handlers. Those present `BFF_SECRET` in `X-Bff-Secret` and the browser's address in `X-Client-Ip`. `BFF_SECRET_PREVIOUS` is accepted too, during a rotation only. The rotation steps are in [the Fly runbook](../../docs/setup/fly-backend.md).

## Commands

```bash
pnpm --filter @hovimestari/backend dev          # tsx watch on port 3001
pnpm --filter @hovimestari/backend build        # tsc to dist/
pnpm --filter @hovimestari/backend test         # Jest, every suite
pnpm --filter @hovimestari/backend db:generate  # SQL migration from a schema change
pnpm --filter @hovimestari/backend db:migrate   # apply migrations to DATABASE_URL
pnpm --filter @hovimestari/backend db:studio    # Drizzle Studio on DATABASE_URL
pnpm --filter @hovimestari/backend fineli:import [dir] [--dry-run] [--allow-retire] [--allow-rename]
pnpm --filter @hovimestari/backend mcp:smoke    # every read tool and one write against their REST routes, on a local _smoke database
```

`fineli:import` loads an unzipped Fineli release into the food catalogue. The folder defaults to `apps/backend/data/fineli/`, which git ignores, and a relative folder is read from where you run the command. Only `DATABASE_URL` is needed. The steps, local and on Fly, are in [the Fineli import runbook](../../docs/setup/fineli-import.md), and how the import treats each food in [the foods feature doc](../../docs/features/foods.md#the-fineli-import).

`mcp:smoke` checks the MCP endpoint against the REST routes on a local, migrated database made for it, the one `DATABASE_URL` names. It refuses a host other than `localhost`, `127.0.0.1` or `::1`, a URL with query parameters, a database name with anything but letters, digits, `_`, `-` and `.`, and a database whose name does not end in `_smoke`. To use another local database for one run, set `MCP_SMOKE_ANY_DATABASE=true` and `MCP_SMOKE_CONFIRM_DATABASE` to that database's name. The script prints the host and the database it is about to write to, and refuses unless the second variable repeats the name exactly. CI uses a `_smoke` database and sets neither. To run it locally:

```bash
psql postgresql://postgres@localhost:5432/postgres -c "CREATE DATABASE hovimestari_smoke"
export DATABASE_URL=postgresql://postgres@localhost:5432/hovimestari_smoke
pnpm --filter @hovimestari/backend db:migrate
pnpm --filter @hovimestari/backend mcp:smoke
```

It signs up a user of its own with a password it makes, gives it a day of data through the API, compares every read tool with its route, runs one write through `log_food` and `POST /entries`, makes a food through `create_own_food` and logs it, reads the three changes back through `GET /connections/:id/changes`, then revokes its keys and deletes its user. It makes any secret the env lacks at start-up and reaches nothing outside the machine. It prints each check and exits 1 on any mismatch. CI runs it after the tests on a database of its own. What it covers is in [the connected AI feature doc](../../docs/features/connected-ai.md#the-smoke-check).

Local setup, from `pnpm env:init` to a running server, is in [the local development runbook](../../docs/setup/local-development.md).

## Database and migrations

The schema lives in `src/db/schema/`, and the migrations it produces in `drizzle/migrations/`. The schema imports constants from `@hovimestari/types`, so `db:generate` needs that package built first. To change the schema:

1. Edit `src/db/schema/*.ts`.
2. Build the shared types and generate the migration, then commit the SQL file and the `meta/` snapshot together:

   ```bash
   pnpm --filter @hovimestari/types build
   pnpm --filter @hovimestari/backend db:generate
   ```

3. Run `db:migrate` locally.

Drizzle applies each migration once and never reads an applied file again, so a change to an applied migration reaches only a new database. If a migration fails on an existing local database, or a migration you already applied has changed, recreate it from the repository root. This deletes everything in the local database:

```bash
docker compose down -v
pnpm db:up
pnpm --filter @hovimestari/backend db:migrate
```

Migration `0001_search_functions.sql` is written by hand: it was generated empty with `db:generate --custom` and installs `pg_trgm`, `unaccent` and the search functions the generated columns of `foods` call. It fails on a database that is not UTF-8 and on a server without the ICU collation `fi-x-icu`, which food names sort with. The Postgres server must ship both extensions and ICU, as the official image and Fly's do.

Migration `0003_refresh_token_families.sql` adds `family_id` and `superseded_at` to `refresh_tokens`. Every stored token becomes a family of its own, so nobody is signed out by it. Run `db:migrate` after pulling it.

Migration `0004_days_and_logging.sql` adds `saved_meals`, `entries`, `removed_entries` and `foods.deleted_at`. The unique constraint on `saved_meals (id, user_id)` is declared with `unique()` in the table, so the generated SQL creates it with the table, before the composite key from `entries` that needs it.

Migration `0005_first_run_done.sql` adds the nullable `users.first_run_done_at`, with no backfill. An existing account with a targets change has no first run due by the rule, and one without still has it due.

Migration `0006_off_lookups.sql` adds `food_lookups`, the CHECK `foods_off_has_barcode` and the unique index `foods_off_barcode_uq` on an Open Food Facts food's barcode padded to 14 digits. No stored row is an Open Food Facts food before it, so both apply to an empty set.

Migration `0007_assistant_connections.sql` adds the empty table `assistant_connections`, so it touches no stored row.

Migration `0008_assistant_changes.sql` adds the empty table `assistant_changes`, so it touches no stored row either. Its CHECK names every action the record knows, so a later tool that records a new kind of change needs no migration.

A migration that adds, renames, drops or retypes a column of `entries`, or tightens one of its CHECKs, also rewrites or clears `removed_entries.row`. A restore puts that row back by column name, so a row removed before such a migration lacks the new column or keeps the old name. A restore that the table then refuses answers `entry_not_found`, and the entry cannot come back.

CI runs `db:generate` and fails when `git status --porcelain apps/backend/drizzle` prints anything, so a schema change without its migration cannot merge. `generate` needs no database. Fly applies pending migrations with the `release_command` in `fly.toml` before a new machine takes traffic. Rollback is forward only: a bad migration is undone by a new one.

Every table that holds a user's data has `user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE`, or reaches `users` through a chain of cascading foreign keys. `src/db/__tests__/userCascade.db.test.ts` walks the foreign keys from `users` and fails when an edge does not cascade or a table with `user_id` is not reached. A new user-owned table also adds a row to `seedOneOfEach` in `src/db/__tests__/support/seedOneOfEach.ts`, or that test fails.

## Tests

Jest 29 in native ESM mode, with Supertest against the Express app. Use `jest.unstable_mockModule` and a dynamic `await import()`, and import `{ jest }` from `@jest/globals`.

- `src/__tests__/env-setup.ts` gives every suite its environment: fixed values that are not secret, and secrets generated with `randomBytes` at start-up. Google is off and mail goes to the console. A suite that needs Google calls `enableGoogle()` from `src/__tests__/support/google.ts` before it imports the app.
- No test holds a literal password, key or secret. `testPassword()` in `src/__tests__/support/credentials.ts` makes passwords at run time, and `relayHeaders()` in `src/__tests__/support/relay.ts` presents the generated relay secret.
- Suites named `*.db.test.ts` run on a real Postgres through `describeWithDb` in `src/db/__tests__/support/throwawayDb.ts`. It creates a throwaway UTF-8 database with the `C.UTF-8` locale next to the one `TEST_DATABASE_URL` names, so every machine sorts and folds names alike, migrates it, points `DATABASE_URL` at it, then imports the app for the suite, and drops the database at the end. Such a file never imports the app or the database statically. `TEST_DATABASE_URL` defaults to `postgresql://postgres@localhost:5433/postgres`, the compose database. With no Postgres there the suites are skipped with a warning, and in CI they fail.
- `signUp(client)` in `src/__tests__/support/apiUser.ts` makes a user directly in a suite's database and signs an access token for it, past the sign-up rate limit. The targets, foods and search suites use it.
- `src/services/__tests__/foodWrites.db.test.ts` changes a row's owner between a write's check and the write itself, and proves the write still touches only the caller's rows.
- `src/routes/__tests__/sessionRenewal.db.test.ts` renews sessions on the real database: lost answers, races of renewals, reuse and every way a session ends. `src/routes/__tests__/sessionLocks.db.test.ts` holds a user's row lock on its own connection and reads `pg_locks` to see requests queue behind it, so no test waits on a sleep. Both use `sessionApi(suite)` in `src/__tests__/support/sessionApi.ts`. `src/db/__tests__/refreshTokenFamilies.db.test.ts` runs the token family migration over sessions stored before it. `src/db/__tests__/firstRunDone.db.test.ts` runs the first-run migration over accounts made before it. `src/routes/__tests__/firstRun.db.test.ts` passes the first run and reads `firstRunDue` after every way there.
- `src/services/__tests__/entryRaces.db.test.ts` runs the races the entry locks close on two connections: deleting or editing a food while an add is in flight, the user lock taken before the food, a repeated add or copy that meets the first one uncommitted, and the status batch and the planned rewrite locking rows in id order. `src/services/__tests__/deletionRaces.db.test.ts` races writes against an account deletion. `src/services/__tests__/firstRunDueRace.db.test.ts` commits a removal of the last change between the reads of one targets overview, in both orders, and checks the overview never answers the first run due. `src/services/__tests__/savedMealRaces.db.test.ts` repeats a saved meal create and a save-and-log while the first is in flight, held open or released together with others from the user's row lock. Each holds one side open with `sqlHolder` or `serviceHolder` in `src/__tests__/support/holder.ts`: raw SQL on a connection of its own, or a real service call in a transaction held until it commits. The `days`, `entries`, `entryReplays`, `figuresStay` and `savedMeals` suites in `src/routes/__tests__/` drive the routes through `daysApi(suite)` in `src/__tests__/support/daysApi.ts`, which also builds a service context at a fixed instant for the cases that need a clock.
- The barcode lookup never reaches Open Food Facts in a test. `src/lib/openFoodFacts/__tests__/` tests each helper, the client against a local `node:http` server, on answers recorded once by hand in `fixtures/` and credited in the README there. `src/services/__tests__/barcodeLookup.db.test.ts` runs the service and `src/routes/__tests__/barcodeVisibility.db.test.ts` the route and who sees a stored product. Both pass `offStub()` from `src/__tests__/support/offStub.ts` as `fetch`, which counts every call, and a fake clock. The route suite swaps the route's budgets with `setSharedLookupDepsForTests`.
- `src/services/__tests__/foodSearch.db.test.ts` pins the search ranking on `fixtures/fineli-names-r18.csv`, 249 real Fineli names credited in the README next to it.
- `src/scripts/fineliImport/__tests__/` tests the Fineli import. `readRelease.test.ts` reads the fixtures without a database, and `fineliImport.db.test.ts` imports them into one. `nameCase.test.ts` pins how a name written in capitals is stored, and `fineliImportCase.db.test.ts` imports a release in capitals over stored names. `support/capitalRelease.ts` makes that release as a temp copy of a fixture. The fixtures in `fixtures/` are release 18 rows in the release's own bytes, credited in the README there. Git treats them as binary, so their CRLF line ends and Windows-1252 names never change.
- `src/routes/__tests__/connections.db.test.ts` makes, lists and revokes connection keys on the real database, with the two switches set on the parsed `env`. It holds the user's row on its own connection to show a create waits and counts the key added meanwhile, and races six creates for the tenth place. `src/routes/__tests__/connectionsRevoke.db.test.ts` changes and resets passwords, and fails their transactions at commit with a deferred trigger to show a failed change revokes no key. `src/routes/__tests__/connectionsSession.db.test.ts` shows that only a live session makes a key. `src/routes/__tests__/connectionChanges.db.test.ts` pages a connection's record by cursor, with changes that share one moment and changes that land between two reads, and refuses a cursor the route did not issue and another person's connection. `src/routes/__tests__/connectionCounts.db.test.ts` checks each connection's count and the past connections. Both insert record rows with their times written out, through `src/__tests__/support/changeRows.ts`. `src/scripts/mcpSmoke/__tests__/localOnlyAgreesWithPg.test.ts` runs the smoke guard's addresses through pg's own parser. `src/lib/__tests__/connectionKeys.test.ts` renders the lookup's and the last-use write's SQL with drizzle's own dialect.
- `src/mcp/__tests__/` tests the endpoint. `harness.ts` makes every key at start-up, stands in for the key lookup, runs the app on a real port for the real MCP client, and freezes `Date` alone with `freezeDate`, so the limiters and the services read one fixed instant. `router.test.ts` covers the refusals, the Origin guard, the bodies, the `Host` header and the tool list in both protocol revisions. `deadKeyBrake`, `refusedKeyBrake`, `brakeAfterBody` and `rateLimit` run the limiters in order on one address, and move the frozen clock past a window to show it refill. `disabled.test.ts` starts the app with `MCP_ENABLED=false`. `server.db.test.ts` calls `get_context` with a key made through the API and compares it with `GET /targets` on a real database. `readTools.db.test.ts` does the same for every other read tool against its route on one frozen clock, and runs `look_up_barcode` against the `offStub` stand-in for Open Food Facts. `importBoundary.test.ts` reads every file under `src/mcp/` with `importsOf` from `src/__tests__/support/importsOf.ts` and `withoutComments` from `src/__tests__/support/withoutComments.ts`. `registries.test.ts` keeps every write tool out of `READ_TOOLS`, and `writesOff.test.ts` starts the endpoint with `MCP_WRITES_ENABLED=false`. `entryWrites.db.test.ts` runs every entry write tool on a real database with a key made through the API: its change, its record row and its replay. `otherWrites.db.test.ts` does the same for the food and saved-meal tools, and `targetWrites.db.test.ts` for the targets tools, with the races a screen save and a second call run against `set_targets`, held by a pause in `setTargets`. `writeReplays.db.test.ts` holds a first call open with `serviceHolder` to race a second with the same request key, for a tool that adds, for each tool that changes what is there, and for a different call under the same key, and forces a failure after the service to show the change and its record go together. `writeBrakes.db.test.ts` runs both write limits for two keys of one person on a frozen clock, on both sides of each window. They share `writeSupport.ts`. `src/services/writes/recorded/__tests__/screenPath.test.ts` reads the recorded writes and fails on a row written there, a namespace or run-time import, or a function that calls other than one write service.
- The other route suites mock the database. They cover who may call each route, the codes a refused body answers and the answers that must not differ between accounts. The flows run on the real database in `src/routes/__tests__/authFlow.db.test.ts`.

## Deployment

The image builds from `Dockerfile` with the repository root as its context, because it copies `packages/types`:

```bash
docker build -f apps/backend/Dockerfile -t hovimestari-backend .
```

Fly deploys it from the repository root with `flyctl deploy --remote-only --ha=false --config apps/backend/fly.toml`. The backend runs on exactly one machine, because the one-time codes, the rate limiters' budgets and the barcode lookup's budgets and memory live in process memory. `--ha=false` keeps a first deploy from creating two. On SIGTERM or SIGINT the server stops taking connections, finishes the requests in flight and ends the database pool before it exits. It gives up after ten seconds. `fly.toml` sets no `kill_signal` or `kill_timeout`, so Fly uses its defaults: SIGINT, then a hard stop after five seconds. The steps, the secrets and the `BFF_SECRET` rotation are in [the Fly runbook](../../docs/setup/fly-backend.md).
