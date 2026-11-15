---
name: Finanssi lifts that break Hovimestari requirements
description: Where finanssi's auth and session code conflicts with Hovimestari's signed-off requirements, found while designing step 1
type: project
---

Finanssi's browser session hands the refresh token to JavaScript (sign-in response body, `/api/auth/set-cookie`, and tokens in the Google callback URL). Hovimestari's NFR-SEC-03 forbids that. The step 1 design (`docs/design/scaffold-and-auth.md`, decision 3) relays every token-issuing call through Next route handlers with a `BFF_SECRET` header and a forwarded client address, and Google finishes through a one-time code.

**Why:** "lift, don't redesign" is the default, but a lifted mechanism that breaks a signed-off requirement must change. Relaying without forwarding the client IP would also have broken the per-address rate limits.

The design review (2026-11-15) found what the first draft missed in that relay: login CSRF through a JSON body sent as `text/plain` (fixed with a same-origin and content-type guard on every POST route handler), a Google finish not bound to the starting browser (fixed with a nonce cookie hashed into the signed state), and trusting `x-forwarded-for` (production trusts only `x-real-ip`). The orchestrator accepts no residual risk on sign-in. Round 2 found the same hole in finanssi's Google linking (a navigation ticket sent to a victim links their Google id to the attacker's account): every OAuth flow that ends in a session or a link must be bound to the starting browser, so check all of them, not just sign-in. Also: a cascade test must walk the whole foreign-key graph from `users`, not just direct references.

**How to apply:** when lifting anything else from finanssi (MCP in step 4 especially), check it against Hovimestari's NFRs rather than assuming finanssi's behaviour is compliant. Also found: bcrypt 72-byte truncation, case-sensitive email lookup, and a refresh handler that signs users out when the backend is unreachable.
