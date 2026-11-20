# Local development

This runbook sets up the backend and the web app on your own machine: the tools, the local database, the env files with their generated secrets, the migrations, the Fineli catalogue, both servers and the tests. Run it once per clone. After a `git pull` on a clone you have set up, [the short version](#after-a-pull) is enough.

## Steps

1. Install Node 22 and Docker, and enable pnpm through Corepack. The pnpm version comes from `packageManager` in the root `package.json`.

   ```bash
   corepack enable pnpm
   pnpm -v
   ```

2. Install the dependencies from the repository root. This also points git at the commit hook in `.githooks/`.

   ```bash
   pnpm install
   ```

3. Write the local env files. This copies `apps/backend/.env.example` to `apps/backend/.env` and `apps/web/.env.example` to `apps/web/.env.local`, and fills `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` and `BFF_SECRET` with generated values. Both files get the same `BFF_SECRET`, because the web server presents it and the backend checks it. It never overwrites a file that exists.

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

6. Load the Fineli food catalogue. Download the release's "Basic package 2" in a browser and unzip it into `apps/backend/data/fineli/`, as steps 1 and 2 of [the Fineli import runbook](fineli-import.md) say. Then do the dry run and the import, and read each report as that runbook says. Without the catalogue the search finds only the foods you add yourself.

   ```bash
   pnpm --filter @hovimestari/backend fineli:import --dry-run
   pnpm --filter @hovimestari/backend fineli:import
   ```

7. Start the backend. It listens on port 3001 and restarts on every change.

   ```bash
   pnpm --filter @hovimestari/backend dev
   ```

   Connected AI has two switches in `apps/backend/.env`, `MCP_ENABLED` and `MCP_WRITES_ENABLED`, each `true` or `false`. Connected AI is on and keys that make changes are off, by default and in `.env.example`. An `.env` without the two lines gets the defaults. A change takes a restart of the backend. To let an assistant make changes, change the `MCP_WRITES_ENABLED` line in `apps/backend/.env` to this one, or add it, and restart the backend. Settings then offers **Read and write** when a key is made.

   ```bash
   MCP_WRITES_ENABLED=true
   ```

8. Start the web app in a second terminal. It listens on port 3000 and talks to the backend on 3001.

   ```bash
   pnpm --filter @hovimestari/web dev
   ```

   A server that stops at once with `EADDRINUSE` found another app on its port. `lsof -nP -iTCP:3000 -sTCP:LISTEN` names the process. Stop it, or the address serves that app instead of this one.

   Open `http://localhost:3000` and create an account with an email address and a password. The account is signed in at once, with no mail to confirm. A new account asks for its calorie and protein targets on the first-run page, then lands on the Day tab, where **Log food** opens the log sheet. **Continue with Google** shows only once the backend has its Google settings, as [the Google sign-in runbook](google-sign-in.md) says. It is optional. The development server registers no service worker. To check installing or offline behaviour, run a production build as [the web app's README](../../apps/web/README.md#running-a-production-build-locally) says.

9. Open the app from a phone on the same network, when you want to. The phone loads the page from this machine's address, and the browser on it calls the backend at that address too. Find the address, then set three values and restart both servers, because the web app reads its address at start. The first command is for macOS on Wi-Fi, the second for Linux.

   ```bash
   ipconfig getifaddr en0
   hostname -I
   ```

   In `apps/web/.env.local`, set `NEXT_PUBLIC_API_URL` to `http://<address>:3001/api/v1` and `NEXT_DEV_ORIGINS` to `<address>`. In `apps/backend/.env`, add `http://<address>:3000` to `CORS_ORIGIN`, comma separated after the localhost origin. Open `http://<address>:3000` on the phone. The laptop keeps working at both addresses. The query devtools' button shows on the laptop only, from the `md` breakpoint, so nothing covers the tab bar on the phone. Without `NEXT_DEV_ORIGINS`, the development server refuses the phone its own resources and the page stays on its loading screen. Plain http on a network address is not a secure context, so the browser withholds what needs one, such as installing the app, the clipboard and sharing. The app's own code does not depend on one. A production build over https has them all. To serve both servers over https on your network, for the camera or an installed app, follow [the local HTTPS runbook](local-https.md).

10. Run every check CI runs.

    ```bash
    pnpm build && pnpm typecheck && pnpm lint && pnpm test && pnpm docs:check
    ```

    The real-database test suites, named `*.db.test.ts`, create a throwaway database next to the one `TEST_DATABASE_URL` names, which defaults to the compose database. Without a database they are skipped with a warning. In CI they fail instead.

### After a pull

A pull can bring new dependencies, a changed shared types package and new migrations. From the repository root, with the database up:

```bash
pnpm install
pnpm db:up
pnpm --filter @hovimestari/types build
pnpm --filter @hovimestari/backend db:migrate
```

Then start the backend and the web app as in steps 7 and 8. Your env files, your data and the Fineli catalogue stay as they were. Run the Fineli import again only for a new Fineli release.

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

The web app's own session route answers a same-origin call. Without a session cookie it says the session has ended:

```bash
curl -s -X POST http://localhost:3000/api/auth/refresh -H 'Sec-Fetch-Site: same-origin'
# {"message":"The session has ended.","code":"session_expired"}
```

Stop the database with `pnpm db:down`. Its volume keeps the data. If a migration fails on that data, recreate the database with `docker compose down -v`, then run steps 4, 5 and 6 again. This deletes everything in it, the Fineli catalogue included.

## Before production

- Nothing in `apps/backend/.env` goes to production. Production secrets are generated on their own and set on Fly, as [the Fly runbook](fly-backend.md) says.
- The compose database has no password and listens on this machine only. It is never exposed.
