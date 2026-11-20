---
name: What design reviews catch that the first draft missed
description: Recurring design-review findings on this project: slices reading later tables, UI specified against imagined primitives, trusting a service's outcome, per-key limits, vague hand-overs
type: feedback
---

Before handing a design to review, check these, each of which cost a review round on connected AI (2026-11-19):

- Every slice's schemas and queries read only tables merged by then. Slice "shippable alone" claims are checked file by file.
- UI behaviour is specified against the real wrapper's props and comments (`FormSheet` has no `dismissible` override, `BottomSheet` refuses Android back only once), not against what the design wishes they did.
- A service's `outcome` is not proof of change: some answer `changed` or `replayed` for a no-op. Derive anything recorded or reported from an actual diff.
- Limits named "per key" multiply by the number of keys a user may hold. Say per user or say the multiplication.
- A hand-over to Artur is numbered steps: env values, migration, the exact commands for each assistant, what he should see, and what could not be verified.
- Each slice gets an exact file list, its tests, and what must be merged first, including in-flight branches that share files such as `messages/en.json`.

- Per-user client state lives where the app already scopes by user (the layout's `key={user.id}`), never in a module global, which outlives sign-out.
- A lock that guards a count must conflict with itself: `FOR KEY SHARE` does not, so a cap counted under it can be raced.

- Web test fakes (`components/day/__tests__/support.ts` `dayOf`, `harness.tsx` `FakeDays`) copy server rules. A rule change must move the rule into `packages/types` and have the fake call it, or the fake encodes the old behaviour (week average review, 2026-11-20).
- The week table is automatic layout: any in-flow nowrap text widens its `w-12` column. Put new labels out of flow. Fonts load with `display: swap`, so a 0.2 px margin is no margin.
- A change that alters what renders is user-visible even with no web code change: it gets ui-validator and screenshots. A blank where a figure's line was reads as half-loaded.
- Count copy must be checkable against the rows a person sees ("3 days before today", not "3 days eaten").

**Why:** the orchestrator accepted every one of these as a finding and asked for the fix in the body, so they are the review's standing bar.

**How to apply:** run this list over a design before returning it.
