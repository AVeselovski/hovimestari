---
name: Connected AI design choices (step 4)
description: Why the change record wraps services from outside, where its per-tool parts live, the key reveal's store, per-user limits, writes off by default, deletions on the Recipes tab (docs/design/connected-ai.md, review round 1 answered 2026-11-19)
type: project
---

The change record and request keys go through one wrapper, `recordedWrite` in `services/writes/changeRecord.ts`: it opens the transaction, takes the user lock, runs a before-reader, runs the unchanged service on `{...ctx, db: tx}` (Drizzle nests it as a savepoint) and inserts the record last. The per-tool parts (before-reader, summary, entity ids, replay reader) live in `services/writes/recorded/`, never in `src/mcp/`, which may not import `db/` or `drizzle-orm` at all. The actor is a parameter, not a `WriteContext` field.

**Why:** ~17 write services all reach the database only through `ctx.db`, so one wrapper gives finanssi's atomicity without touching the REST path. The orchestrator ruled (2026-11-19) that `src/mcp/` computes nothing and runs no SQL, before-reads included.

Settled in review round 1 (orchestrator, 2026-11-19):

- The record stores `entity_ids`, and a replay answers the thing as it is now by those ids. Without them a retried `create_own_food` cannot return the food's id.
- No slice reads a table a later slice creates. `assistant_changes` arrives in 4a with its writer, and slice 1's list has no change count.
- `MCP_WRITES_ENABLED` defaults to false, switched on at hand-over B after the Activity sheet ships, so no assistant writes before the user can read the record.
- Write, hourly and request limits count per user across keys.
- `set_targets` takes the user row `FOR UPDATE` first: the screen's `setTargets` holds only `FOR KEY SHARE`, so nothing weaker closes the before-read race (Postgres 16, no `RETURNING old`).
- The outcome follows the record: several services answer `changed` or `replayed` for a no-op, so no record means `unchanged`.
- The key reveal is its own `BottomSheet` over a React provider in `app/(app)/layout.tsx` keyed by user id, left only by "I have copied it". Android's second back navigates away (`BottomSheet.tsx:94-98`), so the key must outlive Settings unmounting. Not a module global: nothing in this app drops per-user state on sign-out except unmounting, so a global would keep the key after sign-out (delta review, 2026-11-19).
- The record's reads (counts, past connections, changes route) ship with the Activity screen in slice 5, not with the writer in 4a.
- FR-AI-17 deletions wait as requests approved on the Recipes tab only, capped at 20, withdrawn on revoke. Removing a portion is out of reach pending Artur.

**How to apply:** a later step's write services must keep using `ctx.db` only, and their tools get a `recorded/` function. A recipe deletion is a new `kind` on `deletion_requests`, not a delete tool.
