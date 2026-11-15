---
name: Cascade walk and shared catalogue rows
description: Why foods carries a nullable user_id and why a Fineli food is never deleted; the constraint step 3 inherits
type: project
---

The cascade test (`userCascade.db.test.ts`) treats every table reachable from `users` as user-owned: every foreign key into a reached table must be ON DELETE CASCADE, and every seeded table must have a `user_id` column (the deletion check counts by it). `foods` holds shared Fineli rows and users' own foods in one table with a nullable `user_id`, so it is reached, and anything pointing at `foods` (entries, ingredients) must cascade too.

**Why:** a SET NULL edge into `foods` fails the walk. The step 2 design therefore never deletes a Fineli food (it retires it) and lets step 3 choose between snapshotting figures on entries plus a soft delete of referenced own foods, or changing the walk.

**How to apply:** when designing step 3 (entries) or step 5 (ingredients), point at `foods.id` with a cascading key and make "delete a referenced own food" a soft delete, or argue explicitly for a walker exception. Do not add SET NULL edges silently.
