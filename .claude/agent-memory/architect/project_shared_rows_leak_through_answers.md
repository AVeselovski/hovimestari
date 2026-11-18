---
name: Shared rows leak through answers
description: On shared-storage, per-user-visibility designs, every flag and timing in an answer must be per requesting user; the delta review caught a leak
type: project
---

Any flag on an answer over a shared row (barcode lookup's old `kept`, "this lookup stored the product") must be defined relative to the requesting user (`newlyVisible`: their `food_lookups` row was inserted), or it tells one user what another did. Timing cannot be hidden cheaply: say what it reveals, to whom, and do not claim "nobody can tell".

**Why:** round 1 of barcode.md claimed in TODO.md that nobody could tell what others scanned; the delta review (2026-11-18) showed `kept: false` on a first lookup revealed it. Cost a review round.

**How to apply:** for each answer field and each fast path over shared data, ask "does this differ by what another user did?". Postgres insert-vs-update: `xmax = 0` in RETURNING, as `services/writes/targets.ts` does.
