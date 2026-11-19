# Connected AI

Connected AI is how a person gives their own AI assistant access to their Hovimestari data: a named connection key they make, hand to the assistant and revoke whenever they like. The app runs no model of its own and keeps no key to any AI service.

A signed-in person can make, list and revoke keys through the API. No assistant can use a key yet, because the endpoint an assistant calls is not built.

## In detail

### Connections and keys

A connection is one key given to one assistant. The person names it, such as "Claude on my laptop", in up to 64 characters. A name needs at least one character that shows. It may not hold control characters, line breaks inside it, characters that reverse the direction of text, zero-width spaces or soft hyphens. Joiners and flag characters are allowed, so Persian spelling, emoji joined into one picture and flags such as Scotland's all work. A name of only blank or filler characters is refused. The key is shown once, when it is made, and never again. The server keeps only a fingerprint of it, so nobody can read a key back from the app. A lost key cannot be recovered. The person revokes it and makes a new one.

A person holds at most 10 working keys at a time. A revoked key and an expired key do not count.

### Access and lifetime

A key can read, or read and make changes. Its access and its lifetime are set when it is made and never change. A key that reads lasts 7, 30 or 90 days, or a year. A key that can make changes lasts 7, 30 or 90 days. A day is 24 hours. A new key lasts 30 days and reads only, unless the person picks otherwise.

Listing the keys gives each one's name, its access, when it expires and when it was last used. Last use is recorded to the nearest five minutes. A key past its expiry stays listed as expired until the person removes it.

### Revoking a key

Revoking a key stops it at once. From that moment the server treats it as revoked, and it leaves the list. Removing an expired key revokes it the same way.

[Changing the password](authentication.md#sign-in-methods) or [resetting it](authentication.md#forgotten-password) revokes every key the person holds, together with ending every session. A change that fails revokes nothing. Signing out on all devices leaves keys alone.

Only a [session](authentication.md#staying-signed-in) that is still signed in can make a key. A device signed out by a password change, a reset or signing out on all devices cannot make one, even in the few minutes it can still reach the app. So no key outlives the password it was made under.

### Switched off on the server

Whoever runs the server can switch connected AI off, or switch off only keys that make changes. Keys that make changes are off unless the server switches them on. While connected AI is off no key can be made. While changes are off a key that reads can still be made, and a key that makes changes cannot. Listing the keys also says which of the two the server offers.

## How it works

### Keys

`apps/backend/src/lib/connectionKeys.ts` makes and looks up keys. A key is `hovi_mcp_` followed by 32 random bytes in base64url, 52 characters and 256 bits of entropy. Only its SHA-256 hex is stored, the scheme refresh tokens use. A fast unsalted hash suits a random 256-bit secret, which has no dictionary to attack. A key is looked up by the hash of the key presented, so no timing difference can lead to a matching key.

`lookupConnectionKey(key)` answers one of four states, in one query joined to the key's user:

- `active`, with the connection's id, its user, its name, its access, its expiry and the user's time zone.
- `revoked`. A key both revoked and expired is revoked.
- `expired`, judged by the database clock.
- `unknown`, for anything the server never issued, a text without the `hovi_mcp_` prefix, and a key whose account was deleted.

An `active` lookup also carries `touchDue`, worked out in the same query: the key was never used, or last used more than five minutes ago. `touchLastUsed(id)` records a use with one conditional update, and the endpoint calls it only when `touchDue` holds. The update repeats the five-minute condition, so two requests that both saw a use due write once. It matches no revoked key, so a revoke between the lookup and the write records no use. A failed write is logged with the connection's id and never fails the call.

The key appears in the answer that creates it and nowhere else: in no other answer, no error and no log line. That answer carries `Cache-Control: no-store`, so no browser or proxy keeps it.

### Making and revoking

`apps/backend/src/services/writes/connections.ts` holds the writes. `createConnection` checks the switches, then locks the user's row `FOR NO KEY UPDATE`, checks the session, counts the live keys and inserts the new one, in one transaction. Two creates at once by one person therefore run one after the other, and the second counts the first one's key, so the limit of 10 holds. Expiry is set on the database clock, as `now()` plus the chosen days of 24 hours each, and every check of it reads the same clock.

The access token names its session's family, as [the tokens](authentication.md#tokens) describe. Under the user lock the create requires an unexpired refresh row of that family. Without one it answers 401 `session_expired`, and the web app renews the session or signs the person in again. Every way a session ends takes the same lock, so none can land between the check and the insert. An access token that names no family is refused the same way.

`revokeConnection` stamps `revoked_at` on one key of the user that is not yet revoked. A row is never deleted while its user lives. `revokeAllConnections` stamps every key of a user. The password change and the password reset call it inside their own transactions, beside `endAllSessions`, which ends every session.

`apps/backend/src/services/reads/connections.ts` lists the keys not revoked, newest first, and works out each one's status on the database clock.

### The two switches

Two env values on the backend, read when it starts:

- `MCP_ENABLED`: connected AI is on. `true` by default.
- `MCP_WRITES_ENABLED`: keys that make changes are on. `false` by default. It has effect only while `MCP_ENABLED` is on too.

Each takes `true` or `false`. Unset or empty takes the default, and any other value stops the server at start-up. A change takes a restart. Every list and every create reads the values the server holds at that moment.

### API

All under `/api/v1`, with a signed-in user's access token. A connection key presented to any of these routes, or to any other route under `/api/v1`, answers 401 `unauthorized`, so a key can never make, list or revoke keys.

| Method | Path               | Answers                                                                                                                                                                                                                                                                                                                                                                             |
| ------ | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/connections`     | 200 `{ connections, availability }`. `availability` is `{ connect, write }`: `connect` is `MCP_ENABLED`, `write` is both switches on                                                                                                                                                                                                                                                |
| POST   | `/connections`     | 201 `{ connection, key }` with `Cache-Control: no-store`. 400 `invalid_request`, `connection_name_required`, `connection_name_too_long`, `connection_name_invalid`, `connection_expiry_invalid`, `connection_write_expiry_too_long` or `writes_off`. 401 `session_expired` when the access token's session has ended. 404 `user_not_found`. 409 `connection_limit` or `connect_off` |
| DELETE | `/connections/:id` | 204 for a key of the user's not yet revoked, active or expired. 404 `connection_not_found` for a revoked key, another user's, a missing one or an id that is not a UUID                                                                                                                                                                                                             |

The body of a create is `{ name, access, expiresInDays }`. `access` is `read` or `read_write`, `read` by default. `expiresInDays` is 7, 30, 90 or 365, 30 by default. A connection in an answer is `{ id, name, access, status, createdAt, expiresAt, lastUsedAt }`, with `status` `active` or `expired`. The shapes are the Zod schemas in `packages/types/src/connections.ts`.

### Data

`assistant_connections`, in `apps/backend/src/db/schema/assistantConnections.ts`:

- `user_id`: the key's user, with `ON DELETE CASCADE`.
- `name`: 1 to 64 characters, by the CHECK `assistant_connections_name_len`.
- `key_hash`: the SHA-256 hex of the key, unique.
- `access`: `read` or `read_write`, by the CHECK `assistant_connections_access`.
- `expires_at`: always set. There is no key that never expires.
- `last_used_at`: null until the first use.
- `revoked_at`: null while the key is not revoked.
- `created_at`: when it was made. The index `assistant_connections_user_idx` reads a user's keys newest first.

### Known gaps

- The endpoint an assistant calls is not built, so no assistant can connect, and no key is used yet.
- No screen lists or makes keys yet. The API is in place for the Settings section.

Requirements: FR-AI-01 to FR-AI-05, FR-AI-15, FR-AI-16, NFR-SEC-02 (requirements 3.10 and 4)

## Where it appears

- [Settings](../app/settings.md): changing the password there revokes every key.
- [Sign-in and account pages](../app/auth.md): choosing a new password from a reset link revokes every key.
