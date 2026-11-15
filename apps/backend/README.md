# @hovimestari/backend

The REST API behind the web app: Node.js and Express 5 in TypeScript, Drizzle ORM on PostgreSQL 16, JWT sessions, optional Google OAuth 2.0 and email through Resend. Feature behaviour lives in the [feature docs](../../docs/features.md). This README covers the source layout, the endpoints, the database, tests and deployment.

## Source structure

```text
src/
├── index.ts                    Entry point: the last-resort handlers, the HTTP server, its keep-alive timeouts and the stats log
├── app.ts                      The Express app: CORS, the JSON parser, Google when configured, /livez, /health, the routes, the error handler
├── db/
│   ├── index.ts                Drizzle client, the pg pool and its settings, poolStats()
│   ├── types.ts                Db, the type of the database or a transaction, without the pool
│   └── schema/
│       ├── index.ts            Re-exports every table
│       ├── users.ts            Accounts, with the sign-in method and lower-case email CHECKs
│       ├── refresh-tokens.ts   One row per session, the refresh token stored as a hash
│       └── password-reset-tokens.ts  One row per reset link, stored as a hash
├── lib/
│   ├── env.ts                  Typed env vars, parsed with Zod. Google all or none, Resend required in production
│   ├── errors.ts               AppError (message, status, code), ERROR_MESSAGES and appError(code, status)
│   ├── parseBody.ts            Parses a body with a shared schema, answering its error code on failure
│   ├── failureOf.ts            What an unexpected error logs: stack, code and constraint, never the row values in `detail`
│   ├── lastResort.ts           Logs an unhandled rejection or uncaught exception through failureOf, then exits 1
│   ├── shutdown.ts             On SIGTERM or SIGINT: finish requests in flight, end the pool, exit. Ten seconds at most
│   ├── runtimeStats.ts         The 30 s pool and memory log line
│   ├── requestAborted.ts       isAborted(req): has the client gone or the response been sent
│   ├── clientIp.ts             The address the rate limiters key on: the relayed X-Client-Ip, Fly-Client-IP, or the socket
│   ├── jwt.ts                  Token sign, verify and hash, and the signed OAuth state with its purpose
│   ├── sessions.ts             issueSession, endAllSessions and meOf
│   ├── passwords.ts            bcrypt at cost 12, the 72-byte rule and the dummy compare for refused sign-ins
│   ├── users.ts                findUser
│   ├── google.ts               googleConfig and googleEnabled
│   ├── passport.ts             The Google sign-in and link strategies, and the consent URL builder
│   ├── oauthStateCookie.ts     The cookie that ties a Google consent to the browser that went to Google
│   ├── oneTimeCodes.ts         Single-use, one-minute codes that finish Google sign-in and linking, in process
│   ├── email.ts                The mailer: Resend, or the console without a key, and the reset mail
│   ├── pgErrors.ts             Reads a Postgres error: unique and check violations on a named constraint
│   └── isUuid.ts               Whether a path id is a UUID, before Postgres sees it
├── middleware/
│   ├── authenticate.ts         Bearer access token check, sets req.user
│   ├── requireBff.ts           The relay secret check and the relayed client address rules
│   ├── authRateLimits.ts       The six auth rate limiters and resetAuthRateLimits for tests
│   ├── error.ts                Global error handler: { message, code }, 503 when the database is busy, 500 otherwise
│   └── requestLog.ts           One line per request: method, route key, status, duration
├── routes/
│   ├── index.ts                Mounts /auth and /users
│   ├── auth.ts                 Sign-up, sign-in, refresh, sign-out, password reset, password link, unlink
│   ├── authGoogle.ts           Google sign-in and linking, and their code exchanges
│   └── users.ts                The signed-in user: read, change password, delete the account
└── types/
    └── express.d.ts            req.user and req.relay
```

## Endpoints

Every route is under `/api/v1`, and the [authentication feature doc](../../docs/features/authentication.md#api) lists them with who may call each. Two more routes live outside it, with no auth:

- `GET /livez` answers 200 while the process serves HTTP. It never touches the database, so Fly's routing check cannot fail on a busy pool.
- `GET /health` answers 200 when the database answers `SELECT 1`, and 503 otherwise. It is for monitoring.

A known error answers `{ message, code }`, and the codes are `ERROR_CODES` in `@hovimestari/types`. A busy database answers 503 with `Retry-After: 2`, and an unexpected error answers 500. Both carry a `message` and no code.

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
```

Local setup, from `pnpm env:init` to a running server, is in [the local development runbook](../../docs/setup/local-development.md).

## Database and migrations

The schema lives in `src/db/schema/`, and the migrations it produces in `drizzle/migrations/`. To change the schema:

1. Edit `src/db/schema/*.ts`.
2. Run `db:generate` and commit the SQL file and the `meta/` snapshot together.
3. Run `db:migrate` locally.

CI runs `db:generate` and fails when `git status --porcelain apps/backend/drizzle` prints anything, so a schema change without its migration cannot merge. `generate` needs no database. Fly applies pending migrations with the `release_command` in `fly.toml` before a new machine takes traffic. Rollback is forward only: a bad migration is undone by a new one.

Every table that holds a user's data has `user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE`, or reaches `users` through a chain of cascading foreign keys. `src/db/__tests__/userCascade.db.test.ts` walks the foreign keys from `users` and fails when an edge does not cascade or a table with `user_id` is not reached. A new user-owned table also adds a row to `seedOneOfEach` in `src/db/__tests__/support/seedOneOfEach.ts`, or that test fails.

## Tests

Jest 29 in native ESM mode, with Supertest against the Express app. Use `jest.unstable_mockModule` and a dynamic `await import()`, and import `{ jest }` from `@jest/globals`.

- `src/__tests__/env-setup.ts` gives every suite its environment: fixed values that are not secret, and secrets generated with `randomBytes` at start-up. Google is off and mail goes to the console. A suite that needs Google calls `enableGoogle()` from `src/__tests__/support/google.ts` before it imports the app.
- No test holds a literal password, key or secret. `testPassword()` in `src/__tests__/support/credentials.ts` makes passwords at run time, and `relayHeaders()` in `src/__tests__/support/relay.ts` presents the generated relay secret.
- Suites named `*.db.test.ts` run on a real Postgres through `describeWithDb` in `src/db/__tests__/support/throwawayDb.ts`. It creates a throwaway database next to the one `TEST_DATABASE_URL` names, migrates it, points `DATABASE_URL` at it, then imports the app for the suite, and drops the database at the end. Such a file never imports the app or the database statically. `TEST_DATABASE_URL` defaults to `postgresql://postgres@localhost:5433/postgres`, the compose database. With no Postgres there the suites are skipped with a warning, and in CI they fail.
- The other route suites mock the database. They cover who may call each route, the codes a refused body answers and the answers that must not differ between accounts. The flows run on the real database in `src/routes/__tests__/authFlow.db.test.ts`.

## Deployment

The image builds from `Dockerfile` with the repository root as its context, because it copies `packages/types`:

```bash
docker build -f apps/backend/Dockerfile -t hovimestari-backend .
```

Fly deploys it from the repository root with `flyctl deploy --remote-only --ha=false --config apps/backend/fly.toml`. The backend runs on exactly one machine, because the one-time codes and the rate limiters' budgets live in process memory. `--ha=false` keeps a first deploy from creating two. On SIGTERM or SIGINT the server stops taking connections, finishes the requests in flight and ends the database pool before it exits. It gives up after ten seconds. `fly.toml` sets no `kill_signal` or `kill_timeout`, so Fly uses its defaults: SIGINT, then a hard stop after five seconds. The steps, the secrets and the `BFF_SECRET` rotation are in [the Fly runbook](../../docs/setup/fly-backend.md).
