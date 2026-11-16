---
name: Refresh-token families and the user-row lock
description: Why session renewal uses token families with siblings, a fam claim and a user-row lock (session-renewal design, 2026-11-15)
type: project
---

Session renewal (`docs/design/session-renewal.md`, 2026-11-15) keeps a superseded token renewable until any of its successors is used. A repeat renewal adds a sibling successor and does not replace the first one. The refresh JWT carries `fam` (family id), so reuse is recognised without tombstones. Every write to a user's refresh rows locks `users` FOR NO KEY UPDATE first.

**Why:** a lost answer on a phone is retried hours later, so a grace window fails. Replacing the unused successor brings back the cross-tab cookie-order race: whichever Set-Cookie lands last must be live. Deleting the spent row in the rotation tx let a renewal in flight survive logout-all (the DELETE's snapshot misses the new row), which the user-row lock also fixes.

**How to apply:** a recognised reuse ends that family (orchestrator's ruling in fix cycle 1, 2026-11-16), on renewal and on sign-out alike. Whether to end every session of the user instead is Artur's open decision in TODO.md, a one-line change in `onRefreshReuse`. Any later session work (exact sign-out, device list) should build on families and keep the lock-first rule. Check whether it was implemented as designed before relying on it.

Design review round 1 (2026-11-15) caught, worth checking in any lock design here:

- A test that holds `FOR UPDATE` on `users` blocks every refresh-token insert too (the FK check takes `FOR KEY SHARE`), so it cannot prove a code path takes the lock. Hold `FOR NO KEY UPDATE` and detect waiting through `pg_locks`, not a sleep.
- `db/index.ts` sets `lock_timeout` 3 s, and `middleware/error.ts` already maps 55P03 to 503 with Retry-After. Any new lock must say what a timed-out wait answers and that the web relay keeps the cookie on 5xx.
- Sign-in must take the same lock and re-check its proof (password hash, Google id) under it, or a sign-in outlives a password change.
- Stolen-token tables: walk "thief used T but not its successor yet" separately. The owner's T is superseded, not gone, so nothing is detected yet.
