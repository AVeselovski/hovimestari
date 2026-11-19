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

**Why:** the orchestrator accepted every one of these as a finding and asked for the fix in the body, so they are the review's standing bar.

**How to apply:** run this list over a design before returning it.
