---
name: Web test and browser-run gotchas
description: Traps in apps/web tests and local browser runs that each cost a round trip in PR 2 of the scaffold
type: gotcha
---

- **StrictMode does not double effects under Jest here** (React 19.3, RTL 16, jsdom env). A test that wraps a provider in `<StrictMode>` to prove a once-only effect passes with or without the guard. Drive the real concurrency instead, e.g. call the injected `renewSession` while the launch renewal is still pending (see `contexts/__tests__/AuthContext.test.tsx`). Found by mutation testing, not by reading.
- **`next start` relays nothing without `LOCAL_PRODUCTION_RELAY=1`.** Production mode demands `x-real-ip`, which only Vercel sets. Every sign-in answered 500 until the flag existed.
- **Repeated browser runs trip the backend's sign-up limiter** (all requests come from 127.0.0.1). Restart the backend (`node dist/index.js`) to reset the in-memory budget before another sweep.
- **Screenshots right after a theme click catch the 150ms colour transition.** Wait ~400ms before capturing.
- **`pnpm docs:check` reads "4.5:1" as a file and line number.** Write contrast as "4.5 to 1" in docs.
- **jsdom 20 has no `Response`/`Request`/`Headers`.** The default env `src/__tests__/environments/jsdom.ts` adds Node's. Route handler suites need `/** @jest-environment node */`.
- **A stale `tsconfig.tsbuildinfo` or `messages/en.d.json.ts` makes `tsc` reject new catalog keys.** `next typegen` does not rewrite the catalog declaration, and the incremental cache kept the old types. Delete both locally. A fresh clone has neither.
- **Never judge a redirect target by its raw text.** The URL parser strips tabs and newlines, so `/<tab>/evil.com` becomes `//evil.com`. Resolve with `new URL` and compare origins (`lib/redirect.ts`).
- **A fake worker fetch must answer `type: "basic"`.** `new Response` cannot set it, and the service worker caches only basic answers. Fake `cache.add` must fetch and reject on failure, as the real one does.
- **`drizzle-kit migrate` fails silently on a SQL_ASCII database.** The agent container's Postgres defaults to SQL_ASCII and the search migration refuses it with no output from drizzle-kit. Create the dev database with `createdb -E UTF8 -T template0 --locale=C.UTF-8 <name>`. Applying the files with `psql -v ON_ERROR_STOP=1` shows the real error.
- **Servers started with `nohup ... &` die with the Bash call.** Start the backend and `next start` with the tool's `run_in_background` and stop them with TaskStop by task id. A broad `pkill -f` is refused by the permission classifier.
- **`next build` type-checks test files, `jest` does not.** Run `tsc --noEmit` after writing tests, before committing, or the production build fails on a test.
- **Two quick full navigations lost a refresh answer** before the lost-refresh fix (PR #31): the second page load sent the spent cookie and landed on sign-in. If it shows again after that fix, it is a regression. Waiting for `networkidle` between navigations avoids it in scripts.
- **`getByLabel('Password')` also matches the Settings method row** (a group labelled "Password"). Scope to `getByRole('dialog')`, and use `exact: true` for "New password" beside "Repeat the new password".
- **Jest reads a path argument as a regex**, so `src/app/(app)/settings/...` matches nothing. Pass a fragment such as `'settings/__tests__/methods'`.
- **The full gate needs `TEST_DATABASE_URL=postgresql://postgres@localhost:5432/postgres`.** Without it the backend's database suites default to port 5433 and fail under `CI=true`.
- **A page region is aria-hidden while a modal sheet is open.** `getByRole("region")` behind an open dialog fails slowly (a 5s timeout, not a clear error). Close the dialog first.
- **Forcing a renewal in a real browser:** run the backend with `JWT_ACCESS_EXPIRES_IN=75s` (renewal 15s after each session), and hold `**/api/auth/refresh` with `page.route`. The held request has already captured the cookie of the moment. Playwright lives at `/opt/node22/lib/node_modules/playwright/index.js`; import it by path.
