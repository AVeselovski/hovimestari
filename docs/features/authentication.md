# Authentication

How a person gets into Hovimestari and stays in: signing up, signing in with a password or with Google, staying signed in on a phone, recovering a forgotten password, choosing how they sign in, and deleting the account with everything in it. An account belongs to one person, and everything else in the app belongs to an account.

## In detail

### Signing up and signing in

Signing up takes an email address and a password. The password is at least 8 characters and at most 72 bytes, which is 72 plain letters or fewer accented ones. The address is stored in lower case, so `Anna@Example.com` and `anna@example.com` are one account. A new account is signed in straight away. Signing up with an address that already has an account is refused, and the refusal says whether that account uses a password or Google. Sign-up therefore does tell someone that an address has an account. That is accepted, because a form that cannot say an address is taken leaves an honest person stuck, and sign-up is limited to a few attempts an hour per network.

Signing in takes the same two. A wrong password, an unknown address and a password typed for a Google-only account all get one answer: "Invalid email or password." Each takes about as long as the others, so neither the words nor the wait tell which addresses have an account.

On a deployment with Google configured, **Continue with Google** signs in with a Google account. It creates a Google-only account the first time. A first sign-in from a Google account whose email address Google has not verified is refused, so nobody can claim an address that is not theirs. An account already linked to that Google account still signs in.

### Sign-in methods

An account has a password, Google, or both. The two never join by themselves:

- Signing up with the address of a Google-only account is refused, with a hint to sign in with Google.
- Signing in with Google as the address of a password account is refused, with a hint to sign in with the password.

Joining them is done on purpose, while signed in. A Google-only account can add a password. A password account can link its Google account. An account with both can remove either one. The last way in can never be removed: the server refuses it, and so does the database.

### Staying signed in

A session lasts 7 days without use and renews itself while the app is in use. Closing the app and opening it again keeps the person signed in. A renewal whose answer never reaches the phone, on a dropped network say, does not sign the person out: the phone renews again later and gets a new session. Two windows renewing at the same moment both stay signed in. When an older token of a session is presented after a newer one has been used, the server takes it as a copy and ends that session. The person signs in again on that device, and their other devices stay signed in.

Signing out ends the session on this device. **Sign out on all devices** ends every session, including a renewal or a sign-in that is under way at that moment. A device that is open at that moment keeps working until its short-lived pass runs out, within 15 minutes, and only while the app is open there. A closed app cannot use it at all. Changing or resetting the password ends every session the same way, and a sign-in that checked the old password just before the change is refused.

When the server cannot be reached, nobody is signed out. A device that was signed in opens the app as usual, says it is offline and tries again on its own, and again as soon as it is back online. A device that was signed out, or never signed in, opens the sign-in side instead, with the same offline line. When the server answers but with a fault of its own, the app keeps the session, says something went wrong and offers **Try again**.

Two tabs, or the installed app beside a browser tab, stay signed in together. Each renews in turn and uses the other's latest renewal.

### Rate limits

Guessing is slowed down. After 10 failed sign-ins for one address from one network in 15 minutes, that address is refused from that network for the rest of the window. Other accounts on the same network still sign in. After 100 failed sign-ins from one network in 15 minutes, whatever the addresses, the network is refused. A successful sign-in does not count.

Sign-up allows 10 accounts per network an hour. Password reset allows 5 requests per network an hour. A wrong current password on a password change, and a wrong confirmation on deleting the account, each allow 10 failures per account in 15 minutes.

### Forgotten password

Asking for a reset link always gets the same answer, just as fast, so it cannot tell anyone which addresses have an account. Only an account with a password gets the email. The link works once, for one hour. Using it sets the new password, ends every session, and makes every other reset link of that account stop working.

### Deleting the account

Deleting the account removes it and everything it owns, at once and for good. A password account confirms with its password. A Google-only account confirms by typing its email address.

## How it works

### Tokens

Two JWTs with separate secrets carry `sub`, the user id, in `apps/backend/src/lib/jwt.ts`. Both are signed and verified with HS256 only, so a token signed another way, or not signed, is refused. The access token lasts `JWT_ACCESS_EXPIRES_IN`, `15m` by default. The refresh token lasts `JWT_REFRESH_EXPIRES_IN`, `7d` by default, and carries a random `jti`, so two signed in the same second differ.

The server stores only a SHA-256 hash of each refresh token. `apps/backend/src/lib/sessions.ts` holds every write to the stored tokens.

**Families.** Every refresh token belongs to a family, the line of tokens one sign-in produces. The family id rides in the refresh token as the claim `fam` and in its row as `family_id`. A token without `fam` is found by its hash alone. Its first renewal answers a token that carries its row's family.

**Renewing.** `renewSession` renews a token whose signature checks out and whose row exists and has not expired:

- A live token is marked superseded and gets one successor. Every other row of its family is deleted, superseded rows and unused successors alike.
- A superseded token renews again. Each renewal adds another successor, a sibling, beside the earlier ones, which all stay live. A family keeps at most 5 unused siblings, and an older one is deleted to make room for a sixth.

So a renewal whose answer was lost can be repeated with the same token until one of its successors is used. A family holds at most six rows: one superseded token and its live siblings. The first sibling used deletes the rest.

**Reuse.** A token whose signature checks out but whose row is gone, while its family still has rows, is a reuse: a predecessor presented after its successor was used, or a sibling deleted when another one was used or the cap trimmed it. `onRefreshReuse` handles every reuse. It refuses the token, deletes every row of that family under the user lock, and logs the user id and the family id. The user's other families stay. Whoever presented the token is refused either way, and the web server then deletes that browser's cookie, so the person loses nothing more than that sign-in. Take someone holding a copied token who renews it before the person does. If they have also used the token that renewal gave them, the person's next renewal is a reuse and ends the family. If they have not, the person's renewal gets a sibling and succeeds. The first of the two siblings used deletes the other, and the family ends when the side that lost presents its deleted sibling. The cost is that anyone holding an old copy of a token, at any time within its 7 days, can end that sign-in whenever they like by presenting it. That signs the person out of one sign-in and gives the copy's holder no session. A token of a family that has ended, or a token without `fam` whose row is gone, is refused without a reuse log.

**One lock per user.** Every write to a user's refresh rows takes that user's row lock first, with `FOR NO KEY UPDATE`: a renewal, a sign-in, a sign out, a sign out everywhere, a password change and a reset. Writes for one user therefore run one after another, across all their devices, so a sign out everywhere or a password change cannot miss a renewal or a sign-in that is under way. A sign-in checks again under the lock that the password hash or the Google id it verified is still the account's, and is refused otherwise. A request that waits longer than the pool's 3-second `lock_timeout` answers 503 with `Retry-After: 2`. Nothing was written, so the same token works on the next try.

Expiry is judged by the database clock. A row expires at `now() + JWT_REFRESH_EXPIRES_IN`, set in SQL, and an expired row is refused and deleted. A sign-in and a renewal also sweep the same user's other expired rows. A sign out and a sign out everywhere delete the rows they end, expired or not.

`endSession` signs out: it deletes every row of the presented token's family. A token whose row is gone, while its family still has rows, is a reuse and ends the family, as it does on a renewal. So a person who signs out with a token whose row a copy's renewals already deleted also ends the copy's session. A token of a family that has ended ends nothing. `endAllSessions` deletes every refresh row of a user. Password change, password reset and sign out everywhere call it inside their transactions. An access token already handed out stays valid until it expires, which is the 15-minute window above.

`authenticate` in `apps/backend/src/middleware/authenticate.ts` accepts a `Bearer` access token and answers 401 `unauthorized` otherwise.

### The browser session through the web server

No browser JavaScript ever holds a refresh token. The web app's route handlers, on the web app's own origin, are the only callers of the routes that answer with one: sign-up, sign-in, refresh, the Google exchange and logout. They keep the token in the `httpOnly` cookie `__refresh_token` and hand the page only the access token and the user.

Those routes require the relay secret, in `apps/backend/src/middleware/requireBff.ts`. The web server presents `BFF_SECRET` in `X-Bff-Secret`. The backend hashes the presented value and each accepted secret with SHA-256 and compares them in constant time, so a wrong value of any length is refused with 401 `request_refused`. During a rotation `BFF_SECRET_PREVIOUS` is accepted too.

The secret also vouches for the browser's address. The web server forwards it in `X-Client-Ip`, and the rate limiters key a relayed call on it. A relayed call without the header is refused with 400 `client_address_missing` in production. A header that is not an IP address is refused with 400 `client_address_invalid` everywhere. A call without the secret is keyed as it arrives, and its `X-Client-Ip` is ignored.

On the web side the route handlers live in `apps/web/src/app/api/auth/`. Each relay goes through `relay()` in `_relay.ts`, which adds the secret and the address. In production the address is `x-real-ip` only, which Vercel sets from the connecting address. Without it the handler answers 500 and relays nothing, and `x-forwarded-for` is never read. In development the loopback address stands in. A production build run on a developer's machine may do the same with `LOCAL_PRODUCTION_RELAY=1`, which is ignored wherever `VERCEL` is set.

A production build without `BACKEND_URL` refuses to relay and answers 500, rather than calling a backend on its own machine.

The refresh handler deletes the cookie only on the backend's 401 `session_expired`. When the backend cannot be reached it keeps the cookie and answers 503 `server_unreachable`, so an outage signs nobody out. Any other refusal, a refused relay secret included, is a fault of the deployment: the handler keeps the cookie and answers 502. A backend answer that is not JSON counts as such a fault too. Sign-out always deletes the cookie, and tells the backend when it can.

The page's auth context, `AuthContext`, owns renewal. On 503 `server_unreachable`, a failed request, or a request that has not answered within 12 seconds, it reports `offline` and retries after 2, 5 and 15 seconds, then every minute, and at once when the browser comes back online. On any other failure it reports `error` and waits for the person to retry, because retrying a misconfiguration on a timer only repeats it. Neither state ends the session.

The cookie is shared by every tab. Renewal runs one request at a time within a tab, and, where the browser has the Web Locks API, one at a time across tabs under the lock `hovi-session-renewal`. A tab that waited sends the cookie the previous renewal set, which spares the server a second successor. Without Web Locks two tabs can renew with the same token at the same moment, and both still get a working token, because a renewed token stays usable until one of its successors is used. [Tokens](#tokens) has the rule. The 12-second limit means a hung request never holds the lock for longer than that.

Sign-out takes the same lock, and without Web Locks it waits for this tab's renewal. A renewal already in flight finishes and sets its cookie first, and the sign-out then ends that session and deletes the cookie last. Any renewal answer that arrives after the person tapped **Sign out** is discarded, so a late renewal can never sign the device back in.

The context keeps a plain flag, `hovi-signed-in` in local storage, set when a session starts and cleared on sign-out and when the server ends the session. It holds no token. It only decides what an offline launch shows: the app for a device with a known session, the sign-in side for any other.

### The redirect after sign-in

A visitor sent to sign in from a signed-in page carries that page's path in `?redirect=`, and lands back on it once signed in. A visitor who signed out on this tab goes to plain sign-in, so the next sign-in starts on the Day tab. `postLoginPath()` in `apps/web/src/components/GuestGuard.tsx` picks the target: `?redirect=`, else the path saved before a Google round trip, else `/`.

`safeRedirectPath()` in `apps/web/src/lib/redirect.ts` resolves a target the way the browser would and keeps it only when it stays on the same origin. The resolved path must also not start with `//` or `/\`, and must resolve to itself again, so no later navigation can turn it into another host. That refuses `//host`, `/\host`, the same forms with a tab or a newline inside, and dot-segment forms such as `/.//host`. A refused target sends the visitor to the Day tab. The guard navigates to the resolved path, never to the raw text. Google's round trip loses the query string, so the sign-in and sign-up pages save the checked target in the tab's session storage just before leaving, and the guard reads it once on return.

### The same-origin guard

Every handler that accepts a POST runs the same-origin guard in `_guard.ts` first. It answers 403 `request_refused` unless `Sec-Fetch-Site` is `same-origin`, or, when a browser sends no such header, `Origin` is the app's own. It answers 415 `request_refused` to any body that is not `application/json`, so a form on another site cannot submit one. This is what stops another site signing a visitor into an account it controls. `src/app/api/auth/__tests__/allHandlersGuarded.test.ts` finds every POST handler on disk and fails when one skips the guard.

### Google sign-in

Google is optional per deployment. The two Passport strategies in `apps/backend/src/lib/passport.ts` are registered only when all four `GOOGLE_*` values are set, and `GET /auth/providers` tells the web app whether to show the button. While Google is off its routes answer 404 `google_unavailable`. Setup is in [the Google sign-in runbook](../setup/google-sign-in.md).

A sign-in is tied to the browser twice:

1. The web server makes a random nonce, keeps it in an `httpOnly` cookie and sends the browser to `GET /auth/google` with its SHA-256 as `bind`.
2. The backend signs an OAuth state carrying `bind`, keeps that state's own nonce in a cookie only its callback path receives, and sends the browser to Google.
3. The callback refuses a state that is forged, expired, another flow's, or arrives without its cookie, and then Google's code is never exchanged. It finds the account by Google id. Otherwise it refuses an address Google has not verified or that belongs to an account Google is not linked to, and creates a Google-only account.
4. It hands the web server a one-time code in the redirect, never a token.
5. The web server trades the code and its nonce at `POST /auth/google/exchange`. The backend spends the code, requires the nonce to hash to the code's `bind`, and answers a session. A code finished in another browser fails there, because that browser holds another nonce or none.

### Linking Google

Linking is bound to the starting browser in the same way. The web server relays the signed-in user's bearer and the hash of a fresh nonce to `POST /auth/link/google/start`, which answers Google's consent URL with a signed state over the user id and `bind`. The callback learns which Google account consented and links nothing. It hands the web server a link code bound to the user, the Google id and `bind`. `POST /auth/link/google/exchange` spends the code, checks the nonce, refuses a Google account another user holds, and only then links it.

The link callback sets no cookie of its own and checks none, unlike the sign-in callback. It does not need one. A linking flow starts from the web server, so the backend never has the starting browser in front of it to give a cookie to. The nonce does the same job one step later. Take someone who starts a link for their own account and gets another person to open the consent URL and approve it. The link code then goes to that other person's browser, which does not hold the starter's nonce, so the exchange is refused and the code is spent. The starter holds the nonce and never sees the code. Neither can finish, and nothing is linked.

### One-time codes

`apps/backend/src/lib/oneTimeCodes.ts` holds the codes the two Google callbacks issue. A code is 32 random bytes, lives 60 seconds, is spent by the first exchange that presents it with a nonce, whatever the outcome of that exchange, and is stored only by its hash. One user holds at most 20 live codes, and the store at most 10,000. The store is in process memory, which is one reason the backend runs on one machine.

### Passwords and reset links

`apps/backend/src/lib/passwords.ts` hashes with bcrypt at cost 12. A sign-in for an unknown address or an account with no password is compared against a dummy hash made at start-up, so every refused sign-in costs the same. bcrypt reads only the first 72 bytes of a password, so the schemas refuse a longer one with `password_too_long`, on sign-in too, where a longer input that starts with the stored password would otherwise match it.

A reset link carries 32 random bytes and is stored as a SHA-256 hash with a one-hour expiry. Storing one sweeps the user's expired links. Redeeming one deletes the used row first and requires that it was there, then deletes every other reset row of the user, sets the password and ends every session, all in one transaction. The route answers before it stores the link and sends the mail, so an address with an account answers as fast as one without. A mail that fails is logged. Only when no `RESEND_API_KEY` is configured does the backend write each mail, the link included, to its console, which is how development works. Production refuses to start without the key. Setup is in [the Resend runbook](../setup/resend-email.md).

### Rate limiting

`apps/backend/src/middleware/authRateLimits.ts` holds six limiters on in-memory stores, keyed by `clientIp` in `apps/backend/src/lib/clientIp.ts`:

| Limiter             | Budget            | Key               | Counts        |
| ------------------- | ----------------- | ----------------- | ------------- |
| Sign-in per account | 10 in 15 minutes  | address and email | failures only |
| Sign-in per network | 100 in 15 minutes | address           | failures only |
| Sign-up             | 10 an hour        | address           | every request |
| Password reset      | 5 an hour         | address           | every request |
| Password change     | 10 in 15 minutes  | user              | failures only |
| Account deletion    | 10 in 15 minutes  | user              | failures only |

An unrelayed call's address is `Fly-Client-IP` in production and the socket address elsewhere. IPv6 addresses are grouped by their /56 network.

### Errors

A known error answers `{ message, code }`. The codes are `ERROR_CODES` in `packages/types/src/errors.ts`, and the web app shows its own copy for each. A refused body answers the code its schema names, such as `invalid_email` or `password_too_short`, and any other malformed body answers `invalid_request`. The backend's English `message` is for API clients and logs. A busy database answers 503 with `Retry-After: 2`, and an unexpected error answers 500. Both carry only a `message`.

A Google callback never answers JSON, because the browser is on its way back to the web app. A failed sign-in goes to the web app's `/auth/sign-in?error=` with `google_failed`, `google_email_taken` or `google_email_unverified`. A failed link goes to `/settings?google=failed`.

### API

All under `/api/v1`. **Relay** means `X-Bff-Secret` is required. **Bearer** means an access token is required.

| Method | Path                         | Who           | Answers                                                                                                                                      |
| ------ | ---------------------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/auth/register`             | Relay         | 201 with the access token, the refresh token and the user                                                                                    |
| POST   | `/auth/login`                | Relay         | 200 with the same                                                                                                                            |
| POST   | `/auth/refresh`              | Relay         | 200 with a renewed session, also for a token whose successors are all unused. 401 `session_expired` otherwise. 503 when the database is busy |
| POST   | `/auth/logout`               | Relay         | 204. Ends the whole family the presented refresh token belongs to                                                                            |
| POST   | `/auth/logout-all`           | Bearer        | 204. Ends every session of the user                                                                                                          |
| GET    | `/auth/providers`            | Anyone        | `{ google }`                                                                                                                                 |
| GET    | `/auth/google`               | Anyone        | 302 to Google. Needs `?bind=`                                                                                                                |
| GET    | `/auth/google/callback`      | Google        | 302 to the web server's `/api/auth/google/complete?code=`, or to `/auth/sign-in?error=`                                                      |
| POST   | `/auth/google/exchange`      | Relay         | 200 with a session for a code and its nonce, or 401 `google_failed`                                                                          |
| POST   | `/auth/forgot-password`      | Anyone        | 200 with the same answer for every address                                                                                                   |
| POST   | `/auth/reset-password`       | Anyone        | 204, or 400 `reset_link_invalid`                                                                                                             |
| POST   | `/auth/link/password`        | Bearer        | 200 with the user, or 409 `password_already_set`                                                                                             |
| POST   | `/auth/link/google/start`    | Bearer, Relay | 200 `{ url }`, Google's consent URL, or 409 `google_already_linked`                                                                          |
| GET    | `/auth/link/google/callback` | Google        | 302 to the web server's `/api/auth/google/link/complete?code=`, or to `/settings?google=failed`                                              |
| POST   | `/auth/link/google/exchange` | Relay         | 204, or 401 `google_failed`, 409 `google_taken` or `google_already_linked`                                                                   |
| DELETE | `/auth/unlink/:method`       | Bearer        | 200 with the user. `method` is `google` or `password`                                                                                        |
| GET    | `/users/me`                  | Bearer        | 200 `{ id, email, hasPassword, hasGoogle, foodNameLanguage, timeZone }`                                                                      |
| PUT    | `/users/me/password`         | Bearer        | 204, or 401 `current_password_wrong`, 403 `no_password`                                                                                      |
| DELETE | `/users/me`                  | Bearer        | 204, or 400 `confirmation_mismatch`. Takes `{ password }` or `{ email }`                                                                     |

The request and response shapes are the Zod schemas in `packages/types/src/auth.ts`.

The web app's own route handlers, on its origin under `/api/auth`. The browser calls only these for anything that carries a refresh token. None of them ever puts the refresh token in a body.

| Method | Path                        | Answers                                                                                                                                                            |
| ------ | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| POST   | `/api/auth/sign-in`         | 200 `{ accessToken, user }` and sets the cookie. A refusal passes through with its status, code and `Retry-After`                                                  |
| POST   | `/api/auth/sign-up`         | 201 with the same                                                                                                                                                  |
| POST   | `/api/auth/refresh`         | 200 and rotates the cookie. 401 `session_expired` and deletes it. 503 `server_unreachable` or 502 and keeps it                                                     |
| POST   | `/api/auth/sign-out`        | 204 and deletes the cookie                                                                                                                                         |
| GET    | `/api/auth/google/start`    | 302 to the backend's `/auth/google?bind=`, with the nonce cookie set. Without `NEXT_PUBLIC_API_URL` in production, 302 to `/auth/sign-in?error=google_unavailable` |
| GET    | `/api/auth/google/complete` | 302 to `/auth/sign-in` with the cookie set, or to `/auth/sign-in?error=google_failed`. The nonce cookie is spent                                                   |

The refresh cookie `__refresh_token` is `httpOnly`, `SameSite=Strict`, `Secure` in production, sent only under `/api/auth`, and lasts 7 days. The nonce cookie `__google_sign_in` is `httpOnly`, `SameSite=Lax` so it rides the return from Google, sent only under `/api/auth/google`, and lasts 10 minutes.

### Data

Three tables, in `apps/backend/src/db/schema/`:

- `users`: `email` unique and always lower case, `password_hash` null on a Google-only account, `google_id` unique and null on a password-only account. The CHECK `users_has_sign_in_method` requires one of the two. The CHECK `users_email_lower` refuses a mixed-case email. It also holds `food_name_language`, whose rule is in [food-name language](foods.md#food-name-language), and `time_zone`, whose rule is in [today and the time zone](targets.md#today-and-the-time-zone).
- `refresh_tokens`: one row per refresh token, with `token_hash` unique, `family_id` naming the sign-in it descends from, `superseded_at` set once it was renewed, and `expires_at`.
- `password_reset_tokens`: one row per reset link, with `token_hash` unique and `expires_at`.

Both token tables point at `users` with `ON DELETE CASCADE`. Every table that holds a user's data does the same, directly or through a chain of cascading foreign keys, so deleting a user is one `DELETE` and Postgres removes the rest. `apps/backend/src/db/__tests__/userCascade.db.test.ts` fails when a table breaks that rule or is left out of its deletion check.

Requirements: FR-AUTH-01 to FR-AUTH-07, NFR-SEC-01 to NFR-SEC-04, NFR-PRIV-02 (requirements 3.11 and 4)

## Where it appears

- [Sign-in and account pages](../app/auth.md): signing in and up with a password or Google, asking for a reset link and choosing a new password.
- [Settings](../app/settings.md): who is signed in, and signing out of this device.
- [The app shell](../app/shell.md): every signed-in tab sits behind the session, and the shell stays up while the server is out of reach.
