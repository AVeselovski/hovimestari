# Local development

This runbook sets up the backend on your own machine: the tools, the local database, the env file with its generated secrets, the first migration, the server and the tests. Run it once per clone. The web app joins this runbook when it exists.

## Steps

1. Install Node 22 and enable pnpm through Corepack. The pnpm version comes from `packageManager` in the root `package.json`.

   ```bash
   corepack enable pnpm
   pnpm -v
   ```

2. Install the dependencies from the repository root. This also points git at the commit hook in `.githooks/`.

   ```bash
   pnpm install
   ```

3. Write the local env file. This copies `apps/backend/.env.example` to `apps/backend/.env` and fills `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` and `BFF_SECRET` with generated values. It never overwrites a file that exists.

   ```bash
   pnpm env:init
   ```

4. Start the local database. It is Postgres 16 in Docker, on port 5433 of this machine only, with trust authentication and no password. Its data lives in the Docker volume `hovimestari_db`.

   ```bash
   pnpm db:up
   ```

5. Build the shared types, which the backend and its schema import, then apply the migrations.

   ```bash
   pnpm --filter @hovimestari/types build
   pnpm --filter @hovimestari/backend db:migrate
   ```

6. Start the backend. It listens on port 3001 and restarts on every change.

   ```bash
   pnpm --filter @hovimestari/backend dev
   ```

7. Run every check CI runs.

   ```bash
   pnpm build && pnpm typecheck && pnpm lint && pnpm test && pnpm docs:check
   ```

   The real-database test suites, named `*.db.test.ts`, create a throwaway database next to the one `TEST_DATABASE_URL` names, which defaults to the compose database. Without a database they are skipped with a warning. In CI they fail instead.

### In an agent container

An agent's container has no Docker. Its own Postgres 16 runs on port 5432 with trust authentication. Start it and point the tests at it:

```bash
/home/user/start-local-postgres.sh
export TEST_DATABASE_URL=postgresql://postgres@localhost:5432/postgres
pnpm test
```

## Check it works

The health check answers with the database's state:

```bash
curl -s http://localhost:3001/health
# {"status":"ok","db":"ok"}
```

The sign-in routes refuse a caller without the relay secret:

```bash
curl -s -X POST http://localhost:3001/api/v1/auth/login -H 'Content-Type: application/json' -d '{}'
# {"message":"The request was refused.","code":"request_refused"}
```

Ask for a reset link for any address. Mail goes to the console in development, so a reset link for an account with a password shows up in the backend's output.

```bash
curl -s -X POST http://localhost:3001/api/v1/auth/forgot-password \
  -H 'Content-Type: application/json' -d '{"email":"you@example.com"}'
```

Stop the database with `pnpm db:down`. Its volume keeps the data. If a migration fails on that data, recreate the database with `docker compose down -v`, then run steps 4 and 5 again. This deletes everything in it.

## Before production

- Nothing in `apps/backend/.env` goes to production. Production secrets are generated on their own and set on Fly, as [the Fly runbook](fly-backend.md) says.
- The compose database has no password and listens on this machine only. It is never exposed.
