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
