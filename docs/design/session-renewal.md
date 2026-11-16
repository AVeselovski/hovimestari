# Design: Session renewal that survives a lost answer

Status: implemented on the branch, through fix cycle 2
Branch: `fix/lost-refresh-response`
Requested by: orchestrator, from a ui-validator reproduction and a code-review finding

One focused backend fix. It changes how `POST /auth/refresh` rotates a refresh token, and nothing a user sees except that they stay signed in. Changes from the design review are marked "(review)".

## 0. Product decisions the owner may want to shelve

| #   | Fork                                                                                                                      | Recommendation, and why                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Cost if flipped                                                                                                               |
| --- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 0.1 | A spent refresh token whose successors have never been used: refuse it (today) or renew it again                          | Renew it. It is the fix for FR-AUTH-03 on a weak signal. It costs one security property, honestly stated in section g (review): someone who copied a token before its owner's last use can still take over the session until the owner next renews. Today that copy is dead at the owner's use. In exchange, a thief who used a stolen token first no longer signs the owner out on the owner's return if the thief has not renewed again (section g, row 1b). The recommendation stands because the lost-answer sign-out hits every user on a weak signal, and the theft case needs the cookie already copied off the device. It is Artur's to veto | Back to today: the lost-answer sign-out returns                                                                               |
| 0.2 | What a recognised reuse does: only refuse and log, end that session's line (the family), or end every session of the user | **End the family** (orchestrator's ruling in fix cycle 1, replacing "only refuse and log"). The presenter is refused either way and the relay then deletes its cookie, so the legitimate user is signed out of that sign-in in both cases. Ending the family costs nothing more, and it removes a thief who renewed first, who would otherwise keep a session that rotates indefinitely. It does not touch the user's other sign-ins. Whether to go further and end every session is open in `TODO.md`                                                                                                                                               | One line in `onRefreshReuse`. "End every session" also turns the rare false positives in section h into a sign-out everywhere |
| 0.3 | Sign-out everywhere, a password change or a reset racing a renewal or a sign-in in flight can leave a session alive today | Fix it here: every write to a user's refresh rows, sign-in included, takes the user row lock, and a password sign-in re-checks its password under it (decision 4, review). It is the lock this fix needs anyway                                                                                                                                                                                                                                                                                                                                                                                                                                      | None for the owner. Dropping it leaves a small window where "sign out on all devices" or a password change misses one session |

The global sweep of other users' expired rows (0.4 in the first draft) is dropped (review). The fix does not need it, and it broke the lock rule.

## 1. Requirements validation

Verdict: **aligned**. No requirement changes. No drift.

| Requirement                                    | How this design meets it                                                                                                                                                  | Note                    |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| FR-AUTH-03 keep a user signed in across visits | A renewal whose answer never arrives can be repeated with the same token, any time before that token expires, and succeeds                                                | The reproduced defect   |
| FR-AUTH-03 sign out on one device or all       | Sign-out ends the whole token family. Sign out everywhere, password change and reset delete every row, superseded rows included, and serialise with renewals and sign-ins | Tightened, decision 4   |
| FR-AUTH-07, NFR-PRIV-02 delete the account     | Unchanged: `refresh_tokens.user_id` cascades. New columns carry no foreign key                                                                                            | Cascade test unchanged  |
| NFR-SEC-02 tokens stored only as hashes        | Still only hashes. No successor is ever stored in a form that can be handed back                                                                                          | Rules out alternative B |
| NFR-SEC-03 refresh token never readable by JS  | Untouched. The new `fam` claim lives inside the refresh JWT, which only the web server holds                                                                              |                         |
| NFR-SEC-04 no tokens in logs                   | The reuse log line carries the user id and the family id, never a token or a hash                                                                                         |                         |

**The problem, stripped of the proposed mechanism:** a renewal that the server committed but the client never heard about must not cost the user their session, however long the client takes to try again. A renewal racing another renewal of the same token must not sign anyone out. Both must hold without the client's help, because locks are missing in some browsers and absent across devices.

**The proposed mechanism**, "keep the previous token usable until its successor is first used", is accepted with one refinement. A repeated renewal does not replace the unused successor. It adds a second one beside it, a sibling, and the first sibling used kills the rest. Replacing would bring back the very race the reviewer found: two renewals from one browser each get an answer, and whichever cookie lands last must be a live token. With siblings, every answer is live until one is used. No workaround is forced: one code path, one lock, two columns.

**Changes proposed that were not asked for:** 0.3. It is in section h as an open question with an assumption.

## a) Overview

Every refresh token belongs to a **family**: the line of tokens one sign-in produces by rotation. Rotation no longer deletes the spent token. It marks it **superseded** and keeps it. A superseded token can still be renewed, and each renewal of it issues another successor beside the first. The moment any live token of the family is used, every other row of the family is deleted. A signature-valid token whose row is gone while its family still lives is a **reuse**, recognised exactly and handled by one policy function. Every write to one user's refresh rows serialises on the user's row, so races leave one continuing line and kills cannot miss a renewal or a sign-in in flight.

## b) Components and responsibilities

| Component                                                                   | Change             | Owns                                                                                                                                                                                                        | Depends on  |
| --------------------------------------------------------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `apps/backend/src/db/schema/refresh-tokens.ts`                              | modified           | `family_id`, `superseded_at`, an index on `family_id`                                                                                                                                                       | `users`     |
| `apps/backend/drizzle/migrations/0003_refresh_token_families.sql` + `meta/` | new, generated     | Adding the columns on a live table                                                                                                                                                                          | 0002        |
| `apps/backend/src/lib/jwt.ts`                                               | modified           | `signRefreshToken({ sub, fam })`, `verifyRefreshToken` returns `{ sub, fam? }`                                                                                                                              |             |
| `apps/backend/src/lib/sessions.ts`                                          | modified           | `issueSession(user, proof)` locks the user, re-checks the proof, starts a family. New `renewSession(refreshToken)`, `endSession(refreshToken)`, `onRefreshReuse`. `endAllSessions` locks the user row first | schema, jwt |
| `apps/backend/src/routes/auth.ts`                                           | modified           | `/register`, `/login` pass their proof. `/refresh` calls `renewSession`. `/logout` calls `endSession`. `/logout-all` runs `endAllSessions` in a transaction                                                 | sessions    |
| `apps/backend/src/routes/authGoogle.ts`                                     | modified (review)  | `/google/exchange` passes `{ googleId }` as its proof                                                                                                                                                       | sessions    |
| `apps/backend/src/routes/users.ts`                                          | unchanged          | `PUT /me/password` already calls `endAllSessions` inside a transaction                                                                                                                                      |             |
| `apps/backend/src/middleware/error.ts`                                      | unchanged (review) | Already answers a lock wait that gave up (`55P03`) with 503 and `Retry-After: 2`                                                                                                                            |             |
| `packages/types`                                                            | unchanged          | Request and response shapes do not change                                                                                                                                                                   |             |
| `apps/web`                                                                  | unchanged          | Section f                                                                                                                                                                                                   |             |

## c) Data model

```ts
// apps/backend/src/db/schema/refresh-tokens.ts
export const refreshTokens = pgTable(
  "refresh_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    // The sign-in this token descends from. A new sign-in takes the default,
    // a renewal copies its predecessor's. No foreign key: the family is not a row.
    familyId: uuid("family_id").notNull().defaultRandom(),
    // Set when the token was renewed. Its successors are live rows of the same family.
    supersededAt: timestamp("superseded_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("refresh_tokens_user_id_idx").on(t.userId), index("refresh_tokens_family_id_idx").on(t.familyId)],
);
```

**What holds per family (review).** The live rows of a family are interchangeable siblings. Using any one deletes every other row of the family, live or superseded. A family holds at most `MAX_UNUSED_SUCCESSORS` (5) live rows and at most one superseded row. Usually the live rows are the successors of the superseded row. When the superseded row has expired before its later-issued siblings, the family has live rows and no superseded row. The behaviour is the same: they are still siblings, and the first one used removes the rest.

**Expiry is judged by the database clock everywhere (review):** `expires_at > now()` in SQL, never a JS `Date` compared in the app. The row's `expires_at` is written as `now() + interval` in SQL too. The JWT's own `exp` is checked by `jsonwebtoken` first, as today. The two differ by milliseconds at issue, and the stricter of the two wins.

**Migration** (`drizzle-kit generate`, reviewed by hand). Expected SQL:

```sql
ALTER TABLE "refresh_tokens" ADD COLUMN "family_id" uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE "refresh_tokens" ADD COLUMN "superseded_at" timestamp with time zone;
CREATE INDEX "refresh_tokens_family_id_idx" ON "refresh_tokens" USING btree ("family_id");
```

- **Live sessions survive.** `gen_random_uuid()` is volatile, so Postgres evaluates it per existing row: every existing row becomes its own family, which is exactly what it is. `superseded_at` is null, so every existing token stays live. Existing tokens carry no `fam` claim and are found by hash as today. Their first renewal issues a token with the claim. Nobody is signed out.
- **Lock cost.** The volatile default rewrites the table under an exclusive lock. The table holds one to six rows per session, so this is milliseconds. Renewals during the release wait, they do not fail.
- **Deploy order.** Fly's `release_command` migrates before the new code starts. The old code against the new schema inserts rows with a default family and deletes on rotation, which stays correct. **Rollback** to the old code is safe too: it reads a superseded row as live and rotates it, deleting it. Nobody is signed out either way. Rollback of the schema is forward-only, as for every migration.
- **Cascade.** No new foreign key. `user_id` still cascades, so `userCascade.db.test.ts` and `seedOneOfEach` need no change (the seeded row takes the default family).

**Dead rows** go two ways (review):

1. Superseded rows and unused siblings are deleted when a sibling is used (section e). Per family the table holds at most six rows.
2. The user's own expired rows are deleted on every session write of that user, under the user lock, as today.

Rows of a user who never comes back stay until that user's next session write or their account deletion, as today. Not this fix's concern.

## d) API interface

No shape changes. `POST /auth/refresh` and `POST /auth/logout` keep their request and response types. What changes is when they succeed:

| Presented token                                                        | `/auth/refresh` answers                                            | Rows afterwards                                                                  |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| Live (no matter whether the family has a superseded row)               | 200, a successor                                                   | Every other row of the family deleted. This token superseded, one live successor |
| Superseded, unexpired                                                  | 200, **a new sibling successor**. The earlier successors stay live | One more live sibling. At the cap, an older live sibling is deleted first        |
| Row gone, `fam` claim names a family that still has rows               | 401 `session_expired`, and `onRefreshReuse` runs                   | Every row of that family deleted. The user's other families untouched            |
| Row gone otherwise (ended family, unknown, legacy token without `fam`) | 401 `session_expired`                                              | Unchanged                                                                        |
| Row expired by the database clock, or bad signature                    | 401 `session_expired`                                              | An expired row is deleted                                                        |
| The user row's lock not granted within `lock_timeout` (3 s) (review)   | 503, `Retry-After: 2`, the existing busy body                      | Unchanged: the transaction rolled back, so the token is exactly as it was        |

**What a retry with the old token returns:** a fresh 200 session whose refresh token is a new sibling. The lost successor is not returned (only its hash is stored) and is not deleted. It stays a live sibling until some sibling of the family is used, then it is deleted with the others. Nobody holds it, so it simply expires or is trimmed.

`/auth/logout` with a token whose row exists, superseded or live, deletes the whole family. With a token whose row is gone while its family lives, it is a reuse and ends the family, exactly as `/auth/refresh` does (fix cycle 2). With a token whose family has ended it deletes nothing. Still 204 either way.

**A lock wait that gives up (review).** `db/index.ts` sets `lock_timeout: 3_000`. A renewal or sign-in queued behind a long transaction on the same user row (an account deletion cascading many rows, say) fails with Postgres `55P03`. `middleware/error.ts` already maps `55P03` and `57014` to 503 with `Retry-After: 2` and the busy message, not to 500. That is the right answer: a retry cures it, and the transaction rolled back, so the presented token is untouched. No new error code: the relay acts on the status, and a new code would need copy in the web catalog for no behaviour.

## e) Data flow

**`renewSession(refreshToken)`**, one transaction, in this order:

1. Verify the JWT signature and expiry outside the transaction. Failure: 401.
2. `SELECT id FROM users WHERE id = $sub FOR NO KEY UPDATE`. No user: 401. **Taken first, always.** Every write to this user's refresh rows waits here, so every statement after it sees what the previous one committed (READ COMMITTED takes a fresh snapshot per statement).
3. Read the presented row by `token_hash` and `user_id`, with `expires_at > now()` computed in the same `SELECT`.
4. No row: if the claim `fam` names a family with any row of this user, call `onRefreshReuse({ userId, familyId })`. Answer 401 either way.
5. Expired row: delete it, 401.
6. Live row: `UPDATE refresh_tokens SET superseded_at = now() WHERE id = $id AND superseded_at IS NULL AND expires_at > now() RETURNING id` (review). **Zero rows: 401, nothing else written.** Then delete every other row of the family and insert a successor with its `family_id`.
7. Superseded row: re-read it with `superseded_at IS NOT NULL AND expires_at > now()` (review). **Zero rows: 401.** At the cap, delete an older live sibling so one slot is free (deviation 9: the order is approximate). Insert a sibling successor with the family's `family_id`.
8. Delete the user's expired rows, commit, answer `{ accessToken, refreshToken, user }`.

Under the user lock, steps 6 and 7 never miss in practice. They are the guard that turns any state the read did not foresee (an expiry crossing between two statements, a write that skipped the lock in some future code) into a 401 rather than a fork.

**`issueSession(user, proof)`** (review), one transaction:

1. `SELECT password_hash, google_id FROM users WHERE id = $id FOR NO KEY UPDATE`.
2. Re-check the proof the route verified before the lock. `{ passwordHash }` from `/login`: the stored hash must still equal the one bcrypt compared, else 401 `invalid_credentials`. `{ googleId }` from the Google exchange: the stored `google_id` must still equal it, else 401 `google_failed`. `{ newAccount: true }` from `/register`: nothing to re-check.
3. Delete the user's expired rows, insert the first row of a new family, commit.

A sign-in that checked the old password just before a password change or reset commits now either commits first (and the change deletes its row) or runs after and is refused. The same holds for Google sign-in against an unlink.

```ts
// apps/backend/src/lib/sessions.ts (signatures)
export const MAX_UNUSED_SUCCESSORS = 5;
export type SignInProof = { passwordHash: string } | { googleId: string } | { newAccount: true };
export async function issueSession(user: UserRow, proof: SignInProof): Promise<SessionGrant>; // starts a new family
export async function renewSession(refreshToken: string): Promise<SessionGrant>; // throws session_expired 401
export async function endSession(refreshToken: string): Promise<void>; // ends the token's family
export async function endAllSessions(tx: Tx, userId: string): Promise<void>; // locks the user row, then deletes
/** A dead token of a living family was presented. Ends that family. */
export async function onRefreshReuse(tx: Tx, reuse: { userId: string; familyId: string }): Promise<void>;
```

`onRefreshReuse` deletes every row of that family for that user, then logs `[auth] refresh token reuse, family ended` with `userId` and `familyId` (decision 0.2). The open alternative, ending every session of the user, is `await endAllSessions(tx, reuse.userId)` instead. Since step 4 writes, it runs inside the transaction and the 401 is thrown after the commit, so the deletes are not rolled back by their own refusal.

**Reproduced case.** The phone presents P. The server supersedes P, inserts H, commits, answers. The answer is lost. The phone still holds P (the web relay keeps the cookie on a network failure). Hours later it presents P: step 7, a sibling H2, 200. The phone stores H2. At the next renewal, H2 is used: step 6 deletes P and H. Presenting P or H after that is a reuse.

**Race in one browser, two to many tabs.** All present P together. The first to take the user lock supersedes P and gets H1. Each later one finds P superseded and gets a sibling. Every tab gets 200 with a live token, so whichever cookie lands last is live. The first sibling used trims the family back to one line. **One exception (review):** a request that is delayed until after a sibling of the same family has been used comes back 401 as a reuse, and the relay then deletes the cookie, which may already hold the newer token. Section h names it and how far the web lock removes it.

**Kill paths and superseded rows:**

| Path                                | What it deletes                        | Race with a renewal or sign-in in flight                                                                                                                                                                                                                                                              |
| ----------------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sign out (`/logout`)                | The presented token's family, all rows | `endSession` verifies the JWT for `sub`, takes the user lock, reads the row, then deletes by `family_id`, in one transaction. A renewal either committed first (its new row is in the family and is deleted) or runs after and finds its row gone                                                     |
| Sign out everywhere                 | Every row of the user                  | `endAllSessions` takes the user lock first, so it runs wholly before or after a renewal or sign-in                                                                                                                                                                                                    |
| Password change, reset              | Every row of the user                  | Same, inside their existing transactions. A password sign-in queued behind them re-checks the hash and is refused (review)                                                                                                                                                                            |
| Account deletion                    | Every row, by cascade                  | `DELETE FROM users` takes the row's strongest lock, so it serialises too. A renewal or sign-in after it finds no user                                                                                                                                                                                 |
| Unlinking a sign-in method (review) | Nothing. It ends no session today      | Unchanged. Whether removing a password or Google should end other sessions is the open `TODO.md` item "Decide whether adding or removing a password ends other sessions", settled in the account-settings pull request. A Google sign-in queued behind an unlink re-checks `google_id` and is refused |

All of them serialise with renewals and sign-ins. The rule has no exception now (review): **every write to a user's refresh rows takes the user row lock first.**

`FOR NO KEY UPDATE` does not conflict with the `FOR KEY SHARE` lock a foreign-key insert takes, so inserts elsewhere that reference the user never wait on it. Two `FOR NO KEY UPDATE` locks on one row do conflict, which is the point.

## f) Frontend architecture

**No change in this pull request, and none required in the web pull requests.** The fix depends on two web behaviours. Both are verified, and the tests that pin them must keep holding (review):

- **The relay keeps the cookie on a network failure or any 5xx and deletes it only on the backend's 401.** The web scaffold's validator verified this on the built web app. The pinning test is the `refresh/route.ts` suite in `apps/web/src/app/api/auth/__tests__/`, the cases "keeps the cookie on a network failure", "keeps the cookie on a 5xx" and "deletes the cookie on 401". If the 503 lock-wait answer in section d ever deleted the cookie, a busy database would sign people out.
- **`AuthContext` retries the renewal with the same cookie after a network failure or a server error, and keeps the session.** The web engineer is now making the client tell a server error apart from offline. Either state must keep the session and retry, which is exactly the repeated renewal the backend now accepts. The pinning tests are the `AuthContext` cases for a 503 and for a network failure, which assert the status is not `unauthenticated` and a retry follows.

A 401 from the backend now means the token is dead (bar the exception in section e), so deleting the cookie on 401 stays right.

The `navigator.locks` change in the web scaffold pull request stays useful and should land as it is: it saves a sibling row and a round trip per race, and it removes most of the stale-401 edge (section h). It is no longer load-bearing for the race the reviewer first found.

## g) Constraints and decisions

1. **Siblings, not replacement.** A repeat renewal adds a live successor and leaves the earlier ones alive, because a browser keeps whichever cookie landed last and every answer must therefore stay live until one is used.
2. **The security trade (review).** A token copied before its owner's last use can still be presented until the owner next renews, instead of dying at that use. Presenting it is possible only while the token itself is unexpired, at most `JWT_REFRESH_EXPIRES_IN` (7 days) after it was issued. That bounds when a thief can **start**, not how long a session gained lasts: a thief who uses the sibling they got keeps rotating indefinitely, exactly as a thief who wins today's race does. See the table below.
3. **Reuse is recognised without tombstones.** The refresh JWT carries `fam`, its family id. A signature-valid token whose row is gone while its family still has rows can only be a used predecessor or a trimmed sibling. This needs no record of spent hashes, so the `TODO.md` item's premise ("needs a short record of spent token hashes") no longer holds.
4. **One lock: the user row, `FOR NO KEY UPDATE`, taken first by every write to the user's refresh rows**, sign-in included (review). It serialises the renewals of one user across all their families and devices, and every kill path with them. Contention is one person's few devices. A wait past `lock_timeout` is a 503 that a retry cures (section d). It removes today's windows where a renewal or sign-in in flight survives a sign-out everywhere or a password change.
5. **Family lifetime is unchanged.** As today, a family lives while it is renewed at least once every 7 days, and any single token works for at most 7 days. No absolute cap is added (owner prefers no friction, and nothing asked for one).

**Stolen refresh token, by ordering (review).** "Stolen" means a copy of the cookie value at some moment, while the owner keeps using the original. Today and under this design:

| #   | Thief holds, and the order                                                                                | Before this branch                                                       | This design, a reuse ending the family                                                                                                                                                                                                                                        |
| --- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1a  | Live T. Thief uses T first and gets Ht, **and uses Ht** before the owner returns                          | Thief keeps a session. Owner's next renewal gets 401. Nothing recognised | The owner's next renewal presents T: a recognised reuse. The family ends: the owner is signed out of that sign-in, and the thief's session ends at the same moment                                                                                                            |
| 1b  | Live T. Thief uses T first and gets Ht, and **has not used Ht** when the owner returns                    | Owner's renewal gets 401 and is signed out. Thief keeps Ht               | T is superseded, not gone: the owner gets a sibling Ho, 200. Whoever uses their sibling first deletes the other, and the loser's next attempt is a recognised reuse that ends the family. Either way nobody keeps the session: the thief is out, and the owner signs in again |
| 2   | Live T. Owner uses T first, thief presents T before the owner's next renewal                              | Thief gets 401                                                           | **Thief gets a sibling.** Then as 1b: the first sibling used deletes the other, the loser's next attempt ends the family, and both are out of that sign-in                                                                                                                    |
| 3   | Live T. Owner uses T, renews again, then the thief presents T                                             | Thief gets 401. The owner keeps the session                              | Thief gets 401, recognised as reuse, and the family ends: **the owner is signed out of that sign-in** too                                                                                                                                                                     |
| 4   | Superseded T, owner's sibling unused. **Thief presents T five or more times** without using any successor | Not possible: T is dead                                                  | The cap evicts the owner's sibling. The owner's next renewal is a recognised reuse and ends the family, the thief's siblings included                                                                                                                                         |
| 5   | An old token, its family already past it                                                                  | 401                                                                      | 401, recognised as reuse while the family lives, and the family ends                                                                                                                                                                                                          |

**So, honestly:** a copy taken before the owner's last use still works until the owner next renews: at most 15 minutes on an open app, until the next launch on a closed one, and never later than that copy's own 7-day expiry. That is worse than before this branch, where the copy died at the owner's use. With a reuse ending the family, no ordering leaves a thief holding a session past the next renewal by either side. Before this branch, row 1a let a thief keep a session indefinitely with nothing detected. The price is in rows 3 and 5: anyone who holds an older token of a live family can end that sign-in, so the owner signs in again on that device. That needs the `httpOnly` cookie already copied off the device or the web server, and it touches no other sign-in. Decision 0.1 still follows, flagged for Artur's veto, not a free win.

**Out of scope.** Exact sign-out on every device (the `TODO.md` item): it needs a per-request check and fits this design either way, since a family id or a session version can be added to the access token later. An absolute family lifetime. A global sweep of other users' expired rows. Any web change.

### Rejected alternatives

| Alternative                                                                           | Why not                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A. Grace window: the old token stays valid for N seconds after rotation               | Fixes the race, not the reproduced case: the phone retries on its next launch, hours later. A window of hours is a token that never really dies                                                                                                                                                          |
| B. Client idempotency key per renewal, retry returns the same successor               | The server would have to store the successor in a recoverable form (breaks NFR-SEC-02) or derive it from the key and the old token (a secret derivable from what a thief already holds). It needs the web to persist the key across launches, and it does nothing across tabs that did not share the key |
| C. Rotate less often, or not at all                                                   | Makes the loss rarer, never impossible, and gives up rotation's theft signal entirely                                                                                                                                                                                                                    |
| D. Replace the unused successor on a repeat renewal (one live successor always)       | Two answers from one browser: the cookie that lands last may be the replaced token, and that tab is signed out. The race the reviewer found, moved one step                                                                                                                                              |
| E. Keep every spent token as a tombstone for reuse detection                          | A row per rotation for 7 days. The `fam` claim recognises the same reuse with at most six rows per family                                                                                                                                                                                                |
| F. A `sessions` (families) table that tokens point at, locked per family              | A real entity, a migration with a backfill, a cascade edge and seed changes, for a lock the user row already gives. Worth revisiting if exact sign-out or a device list arrives                                                                                                                          |
| G. Advisory lock on the family id                                                     | Works, but does not serialise the kill paths, which delete by user. The user row lock does both                                                                                                                                                                                                          |
| H. A global batched sweep of every user's expired rows on each session write (review) | Not needed by the fix, writes other users' rows without their lock, and compared the JS clock with the database clock                                                                                                                                                                                    |
| I. A new `server_busy` error code on the lock-wait 503 (review)                       | The relay acts on the status. A code would need web catalog copy for no change in behaviour                                                                                                                                                                                                              |

### Non-questions

- Refresh tokens stay JWTs stored by SHA-256 hash. Settled by NFR-SEC-02 and the scaffold design.
- The web relay keeps the cookie on network failure and 5xx and deletes it on 401. Settled in the scaffold design, verified on the built app, unchanged.
- Shapes in `packages/types` do not change.

## h) Open questions and risks

1. **What a recognised reuse does (0.2).** Owner's decision, held in `TODO.md`.
   > **Settled for now:** a reuse ends the family (0.2). Whether to end every session of the user instead is open in `TODO.md`. The flip is one line in `onRefreshReuse` and its test expectations.
2. **Fixing the kill-path races here (0.3).** Not asked for.
   > **Assumption:** fix them, because it is the same lock, one extra statement in `endAllSessions` and a re-check in `issueSession`.
3. **The sibling cap of 5.**
   > **Assumption:** five. Past it an older unused sibling is deleted (approximately the oldest, deviation 9), so six tabs renewing at the same instant leave one tab with a token that is gone, which is a recognised reuse at its next use. That ends the family, so that browser's sign-in ends. Under "end every session" every device would be signed out. Section g row 4 shows the cap gives a thief nothing new. Raise it if that ever shows up in the logs.

> **Risk:** false-positive reuse. A trimmed sibling presented later reads as reuse. In one browser that needs a cookie overwritten between two tabs' requests, a delayed request (below), or more than five simultaneous renewals. It ends that sign-in, so the person signs in again on that device. Under "end every session" it would sign out every device. The log line makes the rate visible first.

> **Risk:** a stale 401 deleting a newer cookie (review). Two shapes. (a) A delayed renewal request, processed after a sibling of its family was used, comes back as a reuse 401, and the relay's cookie deletion lands after the newer cookie. (b) A stale 401 in one tab deleting the cookie a fresh sign-in in another tab just set. Both are web-side: the backend cannot know which cookie the browser holds now. The `navigator.locks` change in the web scaffold pull request removes both in practice within one browser where locks exist, because no renewal leaves that browser while another is in flight, and a renewal holds the lock until its answer is applied. It does not cover a browser without locks (the fallback), a request held by the network and delivered after the client gave up on it, or the iOS installed app and Safari, which share no cookie and so cannot collide anyway. The residue is rare and ends in a sign-in screen, as today.

> **Risk:** the migration's table rewrite. Milliseconds on this table. Checked by the migration test, which runs the real 0003 over live rows.

> **Risk:** a rolling deploy (accepted as is). While old and new instances run side by side, an old instance reads a superseded row as live and rotates it, deleting it. For that short window a repeated renewal through an old instance behaves as before this fix. Nobody is signed out by it, and the window ends with the deploy.

> **Risk:** the parallel web pull request. It touches `apps/web` only, and this one touches `apps/backend` and docs only, so there is no shared file. Section f names the web tests this fix depends on.

## i) Docs

- `docs/features/authentication.md`:
  - `### Staying signed in`: one sentence, in plain words, that a renewal the phone never hears back about does not sign the person out, and two windows renewing together both stay signed in.
  - `### Tokens`: replace the rotation paragraph. Families, superseded tokens, siblings, what trims them, the user-row lock for every session write, the busy answer when it waits too long, how a reuse is recognised and that it ends the family. Remove "the loser waits on the row's lock, finds it gone and gets 401".
  - `### API`: the refresh row says a token whose successors have not been used yet renews again, and a busy database answers 503. The logout row says it ends the token's whole family.
  - `### Data`: `refresh_tokens` gains `family_id` and `superseded_at`.
- `docs/features.md`: no change. The catalog line still holds.
- `docs/design/link-map.md`: no new home heading. Add "token family, superseded token, reuse" to the keywords of the `### Tokens` row.
- `apps/backend/README.md`: the `refresh-tokens.ts` line becomes "One row per token, grouped by sign-in into families, stored as a hash".
- `TODO.md`: rewrite "Refresh-token reuse detection": reuse is now recognised exactly and ends the family, and the open decision is whether to end every session of the user instead. Who decides: Artur. "Exact sign-out on every device" is unchanged.
- `docs/design/scaffold-and-auth.md`: one line under "Refresh rotation and concurrency": superseded by `session-renewal.md`.

## j) Implementation plan

One pull request, `fix/lost-refresh-response`. Each agent logs STARTED and DONE to `logs.txt`.

| Step | Agent                    | Work                                                                                                                                                                                                                               | Exit checks                                                                                                                                                                                                                                          |
| ---- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | backend-engineer         | Write the tests below first and confirm each one marked **fails today** fails on `master`'s code. Then the schema and migration, `jwt.ts`, `sessions.ts`, `auth.ts`, `authGoogle.ts`, the docs in section i                        | `pnpm build`, `typecheck`, `lint`, `test` and `docs:check` green. `db:generate` leaves `apps/backend/drizzle` clean. No literal secret in any file: test tokens are signed at run time with the runtime secret, passwords come from `testPassword()` |
| 2    | validator                | Against this doc and FR-AUTH-03, NFR-SEC-02 to 04. Run the real-database suites in an isolated worktree at a pinned commit. Delete the user lock in `renewSession` and in `issueSession` in turn and confirm tests 8 and 14 go red | Pass, or findings back to step 1                                                                                                                                                                                                                     |
| 3    | reviewer                 | The diff and its docs                                                                                                                                                                                                              | Approve                                                                                                                                                                                                                                              |
| 4    | documentation-specialist | Docs pass, run by the orchestrator                                                                                                                                                                                                 | `docs:check` green                                                                                                                                                                                                                                   |

Not user-visible, so no ui-validator. After merge, the ui-validator's original reproduction (drop the network mid-renewal, relaunch) is re-run once on the web branch as a confirmation.

**Tests** (`authFlow.db.test.ts` unless named). **Fails today** tests fail on today's code at the line in brackets. **Guard** tests pass today too and pin behaviour the change must keep (review). Waiting on a lock is detected by polling `pg_locks` for an ungranted lock on the user's row, never by a fixed sleep.

1. **Lost answer.** Fails today. Sign up, P. Renew P and discard the answer (the server committed, the client never saw it). Renew P again: 200 [today 401]. Renew with that answer's token: 200. Then P and the discarded H both answer 401. Rows for the user: 2.
2. **Lost answer, then sign out with P.** Fails today. After step one of test 1, `/logout` with P: rows 0 [today 1, H survives]. P and H answer 401.
3. **Race of three.** Fails today. Three renewals of P at once: `[200, 200, 200]` [today `[200, 401, 401]`]. Rows: 1 superseded, 3 live. Renew with any one answer: 200, then rows 2 and the other two answers 401. This test does not prove the lock: test 8 does.
4. **Race of many.** Fails today. Eight at once: all 200 [today one], live rows at most 5, total at most 6. One use trims the family to 2.
5. **Reuse, both shapes.** Fails today. (a) P, then H used, then P presented: 401 and the reuse log called with the user and family [today: no log]. (b) Two siblings, one used, the other presented: same. (c) In both, the family ends: every token of it answers 401, and another sign-in of the same user still renews.
6. **Not reuse.** Guard. A token from an ended family, and a token signed without `fam`, both 401 with no reuse log.
7. **Every kill path with superseded rows present.** Fails today. Build the state of test 1 (P superseded, H and H2 live), then each of sign out everywhere, password change, reset and account deletion: rows 0, and P, H, H2 all 401 [today the setup's second renewal fails].
8. **The user lock, held as a renewal holds it (review).** Fails today. In `suite.client`, `BEGIN; SELECT id FROM users WHERE id = $1 FOR NO KEY UPDATE`. Start a renewal and a sign out everywhere. Both must be waiting in `pg_locks` [today neither waits: `FOR NO KEY UPDATE` does not conflict with the foreign key's `FOR KEY SHARE`, and `/logout-all` takes no user lock]. `ROLLBACK`, then both answer.
9. **The race outcome (review).** Guard for the property the lock gives: hold the lock as in test 8, start a renewal and a sign out everywhere, wait until both are queued, release. Afterwards the user has 0 rows, and every token any answer returned answers 401. Today it passes in most interleavings, which is why test 8 is the proof and this the property.
10. **Lock wait gives up (review).** Fails today. Hold the lock as in test 8 for longer than `lock_timeout`. The renewal answers 503 with `Retry-After: 2` [today it answers 200 at once]. After release, the same token renews with 200: the 503 changed nothing.
11. **Migration over live sessions** (`db/__tests__/refreshTokenFamilies.db.test.ts`). Fails today. `migrateBefore` the families migration, insert two users' rows the old way, `migrateAll()`. Each row has a distinct `family_id` and a null `superseded_at`. A token signed without `fam` whose hash is one of those rows renews: 200, and the successor's payload carries that row's family [today: no families migration, the suite fails].
12. **Sign out with a dead token (review, changed in fix cycle 2).** The owner renews H to H'. A thief renews a copy of H to T, then renews T, which deletes H and H'. `/logout` with H': 204, a recognised reuse, and the thief's token answers 401. Guard: a dead token of an ended family ends nothing on sign-out.
13. **The cap evicts the oldest sibling, and it then counts as reuse (review).** Fails today. P renewed once, then P presented six more times: live rows 5, and the first sibling's row is gone [today the second presentation is 401]. Presenting the first sibling: 401 and the reuse log called.
14. **A sign-in cannot outlive a password change (review).** Fails today. Hold the user lock as in test 8. Start `/login` with the current password and wait until it is queued on the lock (after bcrypt). In the holding transaction set a different `password_hash`, then `COMMIT`. The sign-in answers 401 `invalid_credentials` and the user has no new row [today 200 and a new row]. Same shape for the Google exchange against `google_id` set to null and another method kept: 401 `google_failed`.
15. **A step-6 guard miss is a 401 (review).** Guard. Set a live row's `expires_at` to `now() - interval '1 second'` in the database while its JWT is still valid. Renewal: 401, the row is deleted, no successor row exists. Today the JS clock check also answers 401, so this pins the database-clock path rather than proving it new.
16. **`jwt.test.ts`.** `fam` round-trips (fails today: the claim does not exist). A token without `fam` verifies with `fam` undefined (guard).

## Resolved defaults (orchestrator's architect, 2026-11-15, owner may veto)

- A spent token whose successors have never been used renews again. Veto cost: the lost-answer sign-out returns. The security cost of keeping it is section g, rows 2 and 4.
- A recognised reuse is refused, ends that family and is logged (fix cycle 1). Ending every session of the user instead is open in `TODO.md`. Veto cost: one line in `onRefreshReuse`.
- Sign out on this device ends the token's whole family, lost successors included. Veto cost: none worth having, a lost successor would outlive the sign-out.
- Sign out with an already dead token of a living family is a reuse and ends the family, as a renewal does (fix cycle 2). The old rule protected nothing once a reuse ends the family: the same token posted to `/auth/refresh` already ends it. A dead token of an ended family ends nothing.
- At most five unused successors per family. Veto cost: one constant.
- Renewals, sign-ins and every kill path serialise on the user row, and a sign-in re-checks its password or Google id under it. Veto cost: the sign-out-everywhere and password-change races return.
- A lock wait that gives up answers the existing 503 busy answer, with no new code. Veto cost: a new error code and its web copy.
- Expiry is judged by the database clock. Veto cost: none.
- No global sweep of other users' expired rows. Veto cost: a batched sweep that must take each user's lock.
- No absolute family lifetime. Veto cost: a column or a claim, and people signed out on a fixed date.
- No web change. Veto cost: none.

## Deviations recorded during implementation (backend-engineer, 2026-11-15)

1. **The migration is `0003_refresh_token_families`**, not 0001: 0001 and 0002 already existed. Generated by `db:generate --name refresh_token_families`. The SQL is exactly the expected SQL in section c.
2. **`middleware/error.ts` changed, one function.** Section b says it already answers `55P03` with 503. It did not for a real query: drizzle 0.45 wraps every failed query in `DrizzleQueryError` and keeps the driver error as `cause`, and `isBusyError` read only the top-level `code`, so a lock wait that gave up answered 500. `isBusyError` now reads the code from `cause` when the wrapper has none, and the busy log line prints the driver error's code and message only, never the wrapper's message, which holds the query params. Test 10 goes red without it, and `error.test.ts` pins both the 503 and the log line.
3. **Tests live in two new suites**, `routes/__tests__/sessionRenewal.db.test.ts` (1 to 7, 12, 13, 15) and `routes/__tests__/sessionLocks.db.test.ts` (8, 9, 10, 14), with helpers in `src/__tests__/support/sessionApi.ts`. `authFlow.db.test.ts` was already 390 lines, and the 500-line rule rules out adding them there. Its two tests that pinned the old rotation ("a token used twice succeeds once", "two concurrent refreshes, exactly one success") are replaced by one that pins the new rotation and the reuse log. Test titles carry the section j number and label.
4. **One extra test, 8 for `endSession`.** No named test went red when `endSession`'s lock was removed. "A sign out on one device waits on the user lock too" does, and fails on the code before the change.
5. **`now()` is the transaction's start time** in Postgres, so the step 6 and 7 guards cannot see an expiry cross between two statements of one transaction. They still turn a write that skipped the lock into a 401. A row is judged by the clock at `BEGIN`, which precedes the lock wait by at most the 3 s `lock_timeout`. Accepted as negligible.
6. **`endSession` with a token that does not verify ends nothing.** It needs `sub` to take the lock. Before, logout deleted by hash whatever it was given. A bad signature never had a row. An expired JWT's row is expired too and is swept at the user's next session write.
7. **The Google exchange refuses an account with no `google_id`** before it asks for a session, because its proof is the account's Google id. Before, an account that unlinked Google between the callback and the exchange got a session.
8. **`issueSession` with `{ newAccount: true }` and no user row** answers 401 `session_expired`. It cannot happen in practice: nothing else knows the new account's id yet.
9. **Cap eviction order** is newest first by `created_at`, then `id`. `created_at` defaults to `now()`, the transaction's start time, which is taken before the lock wait. Two renewals that start together can therefore carry start times in the opposite order to their commits, so eviction order is approximate. That is harmless: every live sibling is interchangeable, and a sibling evicted out of turn is refused as reuse just as the strictly oldest one would be. (Corrected in fix cycle 1: this item first said `created_at` follows the lock order.)
10. **Verified by removing each lock in turn:** `renewSession` (tests 8 and 10 red, and the races 3 and 4), `issueSession` (both tests 14 red), `endAllSessions` (test 8 red), `endSession` (the extra test 8 red), and the `cause` read in `error.ts` (test 10 red).

### Fix cycle 1 (backend-engineer, 2026-11-16)

11. **A recognised reuse ends the family**, the orchestrator's ruling, replacing "refuse and log". The reasoning is in decision 0.2, and section g is re-derived for it. `onRefreshReuse` deletes every row of that family for that user under the user lock the renewal holds, then logs the ids. The refusal is still thrown after the commit, so the deletes stay.
12. **`error.ts` unwraps by the wrapper's shape**, through `isQueryWrapper` exported from `lib/failureOf.ts` (a `query` string, a `params` array, an Error `cause`). It never reads or logs the wrapper's message. Deviation 2 unwrapped only a cause with a `code`, so a wrapped "Query read timeout" or pool connect timeout answered 500, and a busy phrase in a query's params could read as busy and be logged. `busyErrors.db.test.ts` produces both timeouts for real through a pool and drizzle.
13. **The Google sign-in proof is the Google id the one-time code carries.** `signInWithGoogle` answers the Google id, the callback puts it in the code, and the exchange passes it to `issueSession`. Deviation 7's check of the stored `google_id` is replaced: a relink to another Google account between callback and exchange is refused.
14. **`endAllSessions` takes `Tx`**, a new type in `db/types.ts`, so the pool no longer type-checks there. `sessions.types.test.ts` pins it through `pnpm typecheck`.
15. **`removeTargetChange` locks the user row `FOR NO KEY UPDATE`**, so a write that only references the user (it holds `FOR KEY SHARE`) does not wait behind it. Its race test now queues both removals behind a held lock and reads `pg_locks`, because the plain race failed only one run in five without the lock.
16. **A password reset locks the user row first**, then spends the link. The old order (link row, then user row) deadlocked with an account deletion (user row, then the cascade to the link).
17. **Token verification pins `algorithms: ["HS256"]`.**

### Fix cycle 2 (backend-engineer, 2026-11-16)

18. **`endSession` treats a dead token of a living family as a reuse**, through `reuseIfFamilyLives`, the branch `renewSession` uses, under the same user lock. The order it closes: the owner renews H to H'. A thief renews a copy of H to T, then renews T, which deletes H and H'. The owner signs out with H'. Before, `endSession` found no row and did nothing, the relay deleted the owner's cookie, and the thief kept a rotating session while the owner believed they had signed out. Test 12 now pins that order. It went red with the old `endSession`.
19. **`isBusyError` judges an error with a string `code` by `BUSY_PG_CODES` alone.** It matches the busy messages only for the code-less pool and client timeouts. A 22P02 message quotes the refused value, so a value holding a busy phrase read as busy.
20. **`failureOf` withholds the message of a data exception** (SQLSTATE class 22) and logs its name, code and stack frames. The coordinator asked that a 22P02 error answer 500 and log none of its text. The 500 path logs `failureOf(err)`, whose first stack line is the message, and a class 22 message quotes the input, so the test could not pass with `isBusyError` alone. Constraint violations (class 23) keep their message, which names the relation and the constraint, and their detail stays withheld as before.
