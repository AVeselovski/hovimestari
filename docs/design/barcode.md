# Design: barcode lookup and the camera scan

Status: in review, round 1 and the delta review answered
Branches: `feat/barcode-lookup-backend`, `feat/barcode-lookup-web`, `docs/local-https`, `feat/barcode-camera`, one per slice (section j)
Requested by: Artur, 2026-11-18: "this would've been times easier if I could just read the barcode and do the same in the time equal to me typing the name". Order confirmed the same day: after the Recipes tab page, barcode in two parts (lookup by a typed number, then the camera), with local HTTPS for his iPhone, then the connected AI step.

**Verdict: build.** The requirements already describe it (FR-SCAN-01 to 06, section 5 "Open Food Facts"). The forks below are reversible and each carries a recommendation. The ones only Artur can settle are also in `TODO.md` under "Needs a decision from Artur", because he does not read this folder.

## 0. Product decisions the owner may want to shelve

| #   | Fork                                                                                                                                                        | Recommendation, and why                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Cost if flipped                                                                                                            |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| 0.1 | Who sees a kept Open Food Facts product in name search: every user, or only the users who looked it up                                                      | **Stored once, searchable only by the users who looked it up.** One row per product, so any user's lookup finds it with no new call (FR-SCAN-04). A `food_lookups` row per user and product decides visibility, inside `visibleTo`, the one place the rule is written. One user's lookup never changes what another user's search shows, and another user's search never shows a product someone else looked up. A lookup's speed can still tell a user that someone has looked a product up before (section h, risks) | "Every user": drop the `EXISTS` from `visibleTo`. One line, and the `food_lookups` table stays as a record of use          |
| 0.2 | A typed number is looked up on a press (or Enter), or on its own as the typing pauses                                                                       | **On a press.** A 13-digit code passes through 8 to 12 digits on the way, each a valid length. Open Food Facts allows 15 product reads a minute per IP address, and every user of the app shares the server's address. A scan runs the lookup at once                                                                                                                                                                                                                                                                  | Look up on the debounce, with a guard against half-typed codes. Medium, and it spends the shared budget                    |
| 0.3 | Open Food Facts figures out of the catalogue's ranges, or protein, carbohydrates and fat over 101.5 g per 100 g                                             | **Treat as incomplete.** Not kept. The own-food form opens with the figures and the barcode, and the person checks them against the label. The 101.5 g rule then holds on what they save                                                                                                                                                                                                                                                                                                                               | Keep such a product as it is: a food whose figures cannot all be right. Small in code                                      |
| 0.4 | A way to correct a kept product: **Copy to your foods** on an Open Food Facts food opens the own-food form with its name, figures and barcode               | **Include.** It is how a person fixes uneven data, using the incomplete path's own prefill. The own copy then wins every later lookup, because own foods come first (FR-SCAN-02)                                                                                                                                                                                                                                                                                                                                       | Leave it out. The person types an own food by hand with the same barcode. Small                                            |
| 0.5 | A drink's figures. Open Food Facts gives many per 100 ml (`nutrition_data_per: "100ml"`, seen on a real Valio milk)                                         | **Keep them as per 100 g** in this change. A litre of milk weighs about 1030 g, so a log by grams is about 3 % off for milk. It changes what a figure means on screen, so it is Artur's call, in `TODO.md`                                                                                                                                                                                                                                                                                                             | A column for the unit, a line "Figures per 100 ml" in the food view, and a decision on how a log by grams reads it. Medium |
| 0.6 | A product's serving size as a portion                                                                                                                       | **Cut.** Artur logs by grams. He can add a portion of his own                                                                                                                                                                                                                                                                                                                                                                                                                                                          | A shared named portion per kept product, from `serving_quantity`. Small to medium                                          |
| 0.7 | Defect found in passing: `FoodDetailSchema.barcode` says "Only ever set on the user's own food" (`packages/types/src/foods.ts:111-112`)                     | Fixed here: a kept product has its barcode too                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | None                                                                                                                       |
| 0.8 | Defect found in passing: `routeKey` keeps digits in a path (`apps/backend/src/middleware/requestLog.ts:9-12`), so a barcode in a path would land in the log | Avoided here: the lookup takes the barcode in a `POST` body, which no log reads. File separately if any other route ever puts personal data in a path                                                                                                                                                                                                                                                                                                                                                                  | None for this change                                                                                                       |

**Why not a copy per user (0.1, weighed).** Each user could get their own copy of a product: an own food with the barcode and an Open Food Facts source, editable in place. That would remove **Copy to your foods**, the read-only variant and the takedown question. It needs, in turn:

- the CHECK `foods_owner_matches_source` (`foods.ts:61`) relaxed, and `visibleTo` rewritten from "not a user food, or mine" to "no owner, or mine", or every user's copies become visible to everyone (`foodScope.ts:11-12`);
- a second user's lookup of the same product to call Open Food Facts again, or to copy from another user's row, which may have been edited. Both break "any user's lookup finds it without a new call";
- a source line that stays true after an edit, since an edited copy no longer holds Open Food Facts' figures: a flag, or the source flipping to `user` on save;
- FR-FOOD-05 ("Foods from Fineli and from Open Food Facts are read-only") reworded, which is Artur's.

That is three workarounds and a requirement change, a stop signal. Shared storage with per-user visibility needs one table and one `EXISTS`, and keeps every existing rule. It is the build's default.

## 1. Requirements validation

| Requirement   | How this design meets it                                                                                                                                                                                                                                                                                                                                              | Note                                                                   |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| FR-SCAN-01    | A camera button in the log sheet's search field opens a scanner sheet. A read runs the lookup                                                                                                                                                                                                                                                                         | Part 2                                                                 |
| FR-SCAN-02    | One server lookup: the user's own foods, then kept Open Food Facts foods, then Open Food Facts itself                                                                                                                                                                                                                                                                 | A kept product counts as Open Food Facts                               |
| FR-SCAN-03    | A found product opens the log sheet's food view: its figures per 100 g, the amount, Log                                                                                                                                                                                                                                                                               | The same two taps as any food                                          |
| FR-SCAN-04    | A complete product is stored once with `source = 'open_food_facts'` and its barcode. The looking-up user's search finds it by name, and any user's next lookup finds it without a call                                                                                                                                                                                | Search visibility is per user (0.1)                                    |
| FR-SCAN-05    | Not found, incomplete or implausible: the own-food form opens with the barcode, and with what Open Food Facts had                                                                                                                                                                                                                                                     | "Implausible" widens "incomplete" (0.3). Wording proposal in `TODO.md` |
| FR-SCAN-06    | Typing the number in the search field is the same lookup. It is the only way where the camera is missing, refused or the origin is not secure                                                                                                                                                                                                                         | Part 1 is this requirement                                             |
| FR-FOOD-05    | Kept products are read-only: `PUT` and `DELETE /foods/:id` already answer 403 `food_read_only` for any shared food                                                                                                                                                                                                                                                    | Correction goes through 0.4                                            |
| FR-FOOD-07    | "From Open Food Facts", with a link to the product's page                                                                                                                                                                                                                                                                                                             |                                                                        |
| NFR-DATA-01   | A credit in Settings: the source, the licence and a line that Open Food Facts does not endorse the app. Each product links to its page                                                                                                                                                                                                                                | Section f                                                              |
| NFR-PRIV-01   | The server calls Open Food Facts, never the browser, with a User-Agent that names no person. Open Food Facts sees a barcode and the server's address. No log line holds a barcode. Another user's search never shows what one user looked up, and every `found` answer has one shape whoever stored the product. A lookup's timing is the one leak, named under risks | Sections 0.1 and g                                                     |
| NFR-PRIV-02   | Deleting an account deletes its `food_lookups` rows by cascade and leaves the stored products, which hold nothing of the user                                                                                                                                                                                                                                         |                                                                        |
| NFR-SEC-01    | Own-food matches and kept-product visibility are scoped to the user through `visibleTo`                                                                                                                                                                                                                                                                               |                                                                        |
| NFR-UX-05, 06 | The scanner is a Base UI sheet through the existing wrapper                                                                                                                                                                                                                                                                                                           | The camera view itself is a `<video>`, not a library primitive         |
| NFR-AI-03     | The lookup is one service. The connected AI step wraps it in a tool                                                                                                                                                                                                                                                                                                   | `TODO.md` already records that tools arrive one step after the screen  |

**The problem, stripped of the proposed mechanism:** adding a packaged product takes as long as typing its name and copying four values. The person wants the product's figures from its barcode in the time it takes to type the name, then to log an amount as with any food.

**The typed number goes in the log sheet's search field, not in a control of its own.** The field is where a person finds a food. A string of 8 to 14 digits names no food, so the field can treat it as a barcode with no second control and no mode switch. A separate "Enter a barcode" control would be a second way into the same lookup, and it would need its own place on a phone. The Recipes tab's **Add a food** gets no lookup: its sheet keeps its plain Barcode field, and the lookup has one home, next to the scanner.

**Changes proposed that were not asked for:** 0.4 (**Copy to your foods**). It is in section h.

**Requirements drift, proposed wording for Artur, also in `TODO.md`:**

- FR-SCAN-05, now "when no product is found or its figures are incomplete". Proposed: "The system shall, when no product is found, or its figures are incomplete or cannot all be right, let the user enter the values from the label and save the product as a food of their own with that barcode." The build reads "cannot all be right" as incomplete until he answers.
- Section 5, "Open Food Facts", now "Looked up by barcode from the backend, one product at a time, at the moment a user scans." Proposed: "...at the moment a user scans or types a barcode." FR-SCAN-06 already implies it.

## a) Overview

Part 1 adds one server lookup, `POST /foods/lookup`, that finds a barcode among the user's own foods, then among the stored Open Food Facts foods, then asks Open Food Facts and stores a complete product once. Each user's lookup makes the product visible to that user. The log sheet's search field treats a typed 8 to 14 digit number as a barcode and offers the lookup. A found food opens its food view. Anything else opens the own-food form with the barcode filled in. Part 2 adds a camera button to the same field that opens a scanner sheet, decodes the barcode on the device with a WebAssembly build of ZXing, and hands the number to part 1. A runbook puts the local development servers behind HTTPS on the LAN, so Artur's iPhone can use the camera.

## What exists

| Fact                                                                                                                                                    | Where                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `food_source` already has `open_food_facts`                                                                                                             | `apps/backend/src/db/schema/foods.ts:18`                                                                                       |
| `foods.barcode` exists, any row may hold one, CHECK `^[0-9]{8,14}$`                                                                                     | `foods.ts:43`, `:67`                                                                                                           |
| One barcode per user among own foods: partial unique index `foods_user_barcode_uq` on `(user_id, barcode)` where `source = 'user'`                      | `foods.ts:68-70`                                                                                                               |
| A shared food has no owner: CHECK `foods_owner_matches_source`                                                                                          | `foods.ts:61`                                                                                                                  |
| Values in range for every row: energy 0 to 1000, each macro 0 to 100                                                                                    | `foods.ts:63-66`                                                                                                               |
| `retired_at` hides a food from search and keeps it readable                                                                                             | `foods.ts:47-48`, `services/foodSearch.ts:64`                                                                                  |
| Entries cascade from their food, so a food that entries use can never be deleted                                                                        | `db/schema/entries.ts:53`                                                                                                      |
| Every food read and write goes through `visibleTo`: search, the detail, favourites, recents and the add's value read                                    | `services/foodScope.ts:11-12`, used in `foodSearch.ts`, `reads/foods.ts`, `reads/log.ts`, `sourceValues.ts`, `writes/foods.ts` |
| `name_en` is filled where the source has one. Display name is `coalesce(name_en, name)` for `en`                                                        | `foods.ts:37-38`, `docs/design/targets-and-foods.md:316`                                                                       |
| The 101.5 g macro sum applies to own foods only, through `OwnFoodPer100gSchema`                                                                         | `packages/types/src/foods.ts:51-68`                                                                                            |
| The own-food body has its own inline barcode regex, trim only                                                                                           | `packages/types/src/foods.ts:161-166`                                                                                          |
| A new food's value with three decimals and 1 or more is refused as a possible thousands group. Only an untouched saved value in an edit passes          | `apps/web/src/components/foods/ownFoodForm.ts:77-88`                                                                           |
| The own-food form has an optional Barcode field                                                                                                         | `apps/web/src/components/foods/OwnFoodSheet.tsx:227-238`                                                                       |
| A deleted own food frees its barcode                                                                                                                    | `apps/backend/src/services/writes/foods.ts:146`                                                                                |
| Search matches names only. A typed barcode finds nothing                                                                                                | `apps/backend/src/services/reads/foods.ts:22`, `services/foodSearch.ts`                                                        |
| Every food write invalidates every key under `["foods"]`                                                                                                | `apps/web/src/lib/invalidation.ts:180`, `:202`                                                                                 |
| The food view's source line says "From Open Food Facts", with no link                                                                                   | `apps/web/src/components/foods/FoodSourceLine.tsx:20`                                                                          |
| Settings credits Fineli only                                                                                                                            | `apps/web/src/app/(app)/settings/_components/FoodDataSection.tsx:8-36`                                                         |
| The request log drops the query string and replaces ids                                                                                                 | `apps/backend/src/middleware/requestLog.ts:9-12`                                                                               |
| CORS exposes no response header, so the web cannot read `Retry-After`                                                                                   | `apps/backend/src/app.ts:25`                                                                                                   |
| The same-origin guard reads `x-forwarded-proto` and `Host`, so it holds behind a proxy                                                                  | `apps/web/src/app/api/auth/_guard.ts:34-37`                                                                                    |
| The relay keys sign-in limits on `x-real-ip` in development, else 127.0.0.1                                                                             | `apps/web/src/app/api/auth/_relay.ts:37-42`                                                                                    |
| Session cookies are `Secure` only in production                                                                                                         | `apps/web/src/app/api/auth/_constants.ts:18`                                                                                   |
| The only security header policy is `frame-ancestors 'none'`. No `Permissions-Policy`, no `script-src`                                                   | `apps/web/next.config.ts:55`, `src/app/__tests__/securityHeaders.test.ts:20`                                                   |
| `next build` runs Turbopack (Next 16.4.6). The service worker caches `/_next/static/` first                                                             | `apps/web/package.json:8`, `:21`, `public/sw.js:157-158`                                                                       |
| Nothing in `docs/design/salvage/` scans or calls Open Food Facts. The earlier app's brief mentions barcode scanning once, as a pantry idea out of scope | `docs/design/salvage/`, `docs/design/legacy-brief.md:253`                                                                      |
| The pivot plan asks for the ODbL question and a phone prototype before this step                                                                        | `docs/design/pivot-plan.md:112-113`, `TODO.md` "Read the Open Food Facts licence" and "Prototype barcode scanning"             |

## Part 1: lookup by number

### Open Food Facts, verified on 2026-11-18

| Fact                                                                                                                                                                                                                                                 | Source                                                       |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Read a product: `GET https://world.openfoodfacts.org/api/v2/product/{code}?fields=...`. No sign-in for reads                                                                                                                                         | API docs, and a live call                                    |
| Found: HTTP 200, `{ code, status: 1, product }`. Not found: HTTP 404, `{ status: 0, status_verbose: "product not found" }`. An invalid code: HTTP 200 with `status: 0`                                                                               | Live calls on 6408430000258, 6400000000017 and 0000000000017 |
| A 12-digit UPC-A is answered under its 13-digit form, with a leading 0 (`012000161155` → `"code": "0012000161155"`)                                                                                                                                  | Live call                                                    |
| `nutriments` holds `energy-kcal_100g`, `energy-kj_100g`, `proteins_100g`, `carbohydrates_100g`, `fat_100g`, `salt_100g`, `sodium_100g`. Names: `product_name`, `product_name_fi`, `product_name_en`, `brands`, `lang`                                | Live call on a Valio milk                                    |
| `nutrition_data_per` can be `"100ml"`, and the `_100g` fields then hold the per 100 ml values                                                                                                                                                        | Live call on the same milk                                   |
| Rate limits: 15 product reads a minute per IP address, 10 searches a minute. Exceeding a global limit answers 503                                                                                                                                    | API docs                                                     |
| User-Agent: always a custom one, in the form `AppName/Version (ContactEmail)`                                                                                                                                                                        | API docs                                                     |
| Licences: the database under ODbL, each item under the Database Contents License, images under CC BY-SA                                                                                                                                              | API docs, terms of use                                       |
| Attribution: re-users "have to mention the licence and to attribute the authorship to Open Food Facts", with a link to https://openfoodfacts.org, or to the product page for a product's data. Derivative works are shared under the same conditions | Terms of use                                                 |
| Data comes with no assurance of accuracy or completeness. The docs ask API users to fill in a usage form                                                                                                                                             | API docs                                                     |

Not verified: whether Hovimestari's stored rows count as a "Derivative Database" that it "Publicly Uses" under ODbL section 4.4. No legal reading was available. Section g says what the design does about it, and `TODO.md` keeps the question for Artur.

### Which numbers are sent

`apps/backend/src/lib/openFoodFacts/gtin.ts`, `gtinOf(code)`, pure. It answers the 14-digit form of a code Open Food Facts can hold, `"in_store"`, or null. It works in two steps, so the length a code was typed or pasted at never changes the answer.

**Step 1, the 14-digit form.**

| Code                                                             | 14-digit form                                 |
| ---------------------------------------------------------------- | --------------------------------------------- |
| 8 digits, starting 0 or 1, whose check digit is right as a UPC-E | The UPC-E expanded to its UPC-A, padded to 14 |
| Otherwise 8, 12, 13 or 14 digits with a right GS1 check digit    | Padded to 14 with leading zeros               |
| 9, 10 or 11 digits, or any wrong check digit                     | None: `gtinOf` answers null                   |

**Step 2, the shop's own numbers, read on the 14-digit form.**

| 14-digit form starts with | What it is                                                                                                                                                               |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `0000000` or `0000002`    | An 8-digit GS1 restricted circulation number (8 digits starting 0 or 2)                                                                                                  |
| `002` or `004`            | A UPC variable-measure or in-store number (12 digits starting 2 or 4, or 13 digits starting 02 or 04)                                                                    |
| `02`                      | A GS1 restricted circulation number, 13 digits starting 20 to 29. Finnish shops print weighed and priced items in this range, with the weight or the price in the digits |

Any of these answers `"in_store"`. Anything else answers its 14-digit form. So "0" plus a 13-digit "20…", or "00" plus a 12-digit "2…", typed as 14 digits, is caught as the shop's own number and never sent.

The check digit is GS1's mod 10: from the right, the digits before the check digit are weighted 3, 1, 3, 1 and so on, and the check digit brings the sum to a multiple of 10. Not verified against the GS1 General Specifications text: the exact prefix ranges for 8-digit restricted numbers, and whether a UPC-E whose expansion starts with five zeros lands in `0000000`. The engineer checks both there before writing the table into code, and the unit tests pin the result.

**UPC-E expansion is tested against published vectors.** The expansion has four branches, by the UPC-E's last data digit: 0 to 2, 3, 4, and 5 to 9. Each is easy to get subtly wrong. `gtin.test.ts` pins one published GS1 example per branch, copied from the GS1 General Specifications' UPC-E table, with the section cited in the test. A self-derived expected value proves nothing, so none is used.

An 8-digit code that is valid both as a UPC-E and as an EAN-8 is read as the UPC-E. That collision is rare. The decoder knows the format of a scan, and the web sends no format, so a typed code takes that rule too.

### The call, made by the server

`apps/backend/src/lib/openFoodFacts/client.ts`, `fetchProduct(gtin, deps)`:

- `GET {OFF_BASE_URL}/api/v2/product/{code}?fields=code,product_name,product_name_fi,product_name_en,brands,nutriments,nutrition_data_per,no_nutrition_data`. `OFF_BASE_URL` defaults to `https://world.openfoodfacts.org`. `{code}` is the 14-digit form less its leading zero when it has one, so the 13-digit form Open Food Facts answers under.
- Header `User-Agent: {OFF_USER_AGENT}`. The default is `Hovimestari/<backend package version>`, with no address, no account id and no email. Open Food Facts asks for a contact. Artur may set `OFF_USER_AGENT` on Fly to add one of his choosing (in `TODO.md`). The code never builds it from user data.
- A 5-second timeout (`AbortSignal.timeout`), one attempt, no retry. The body is read up to 512 KB. A longer body counts as unavailable.
- The body is parsed with a Zod schema in `product.ts`. A field of the wrong type counts as missing, and a numeric string is coerced to its number.
- Answers `{ kind: "found", product }` for 200 with `status: 1`, `{ kind: "not_found" }` for 404, or 200 with `status: 0`. Anything else, a timeout, a network failure, a 429, a 5xx or a body that is not JSON, throws `OffUnavailableError`. Its message names the kind of failure only, never the code or the URL, because `failureOf` logs an unexpected error's message (`apps/backend/src/lib/failureOf.ts:27-38`).
- `fetch` is injected, so tests pass a stub that returns a recorded body.

**Budgets.** `limiter.ts` exports `tokenBucket({ capacity, refillPerMs, now })` and `keyedBuckets({ capacity, refillPerMs, now })`, factories with an injected clock, so tests own their time and no state leaks between suites. A bucket has `has()` and `take()`. The service holds two budgets:

- per user, 30 calls to Open Food Facts an hour, keyed on `ctx.userId`, so a person's devices share one budget. It refills one call every 2 minutes;
- for the whole server, 10 calls a minute, below the 15 Open Food Facts allows. It refills one call every 6 seconds.

Both count only calls that would reach Open Food Facts. A lookup answered from the user's foods, a stored product or the cache spends nothing. It is a small homegrown helper on purpose: `express-rate-limit`, which the auth routes use, limits whole requests at the route, and these budgets apply halfway through the service.

- **Both or neither.** The service checks both buckets with `has()`, then takes from both with `take()`, in one synchronous step with no `await` between. Node runs it to the end without another request in between, so a call either spends one token from each bucket or spends nothing. A user never loses a token for a call the server's empty bucket stopped.
- **Which answer.** The user's bucket empty: 429 `barcode_lookup_limit`. Otherwise the server's bucket empty: 429 `barcode_lookup_busy`. The user's limit is checked first because waiting a minute does not help it.
- **The per-user map is trimmed.** `keyedBuckets` holds a bucket per user id only while it is below capacity. A bucket that has refilled to full is the same as none, so a sweep drops it. The sweep runs on a `take()` at most once a minute and walks the map once. The map never holds more users than have called Open Food Facts in the last hour.

**Cache.** `cache.ts` exports `answerCache({ ttlMs, max, now })`, also a factory with an injected clock. It holds answers that were not stored (not found, incomplete, implausible) for 10 minutes, at most 500 entries, oldest first out, keyed on the 14-digit form. A second scan of an unknown product in that time spends nothing.

**All of it lives in one process.** The two budgets and the cache are memory in the backend process. A restart or a deploy empties them: every user's budget is full again, the server's too, and every cached answer is gone. In the minute after a restart the server may send up to 10 more calls than its bucket would have allowed, which can pass Open Food Facts' 15. Their 503 or 429 then reaches the person as "Open Food Facts did not answer.", and a second try works. Section h names it.

### From a product to a food

`apps/backend/src/lib/openFoodFacts/product.ts`, `foodOf(product)`, pure, on the parsed body:

| Field         | Rule                                                                                                                                                                                                                                                                                                                                                     |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `barcode`     | The requested code's 14-digit form less its leading zero when it has one, the form sent to Open Food Facts. `product.code` is only compared: when its 14-digit form differs from the requested one, the answer is `not_found` (see below)                                                                                                                |
| `name`        | `product_name_fi`, else `product_name`, else `product_name_en`, trimmed, runs of spaces to one. The first entry of `brands` is added after a comma and a space, unless the name already holds it, compared with case and accents folded: "Eila laktoositon kevytmaitojuoma, Valio". Cut at a word boundary to 120 characters. No name at all: incomplete |
| `name_en`     | `product_name_en`, when present and different from `name` before the brand. The brand is added the same way, and it is cut to 120 the same way                                                                                                                                                                                                           |
| `energy_kcal` | `energy-kcal_100g`, else `energy-kj_100g` divided by 4.184, as the Fineli import converts. Rounded to two decimals                                                                                                                                                                                                                                       |
| macros        | `proteins_100g`, `carbohydrates_100g`, `fat_100g`, rounded to three decimals. Open Food Facts' carbohydrate on EU labels excludes fibre, as Fineli's does                                                                                                                                                                                                |
| missing       | Any of the four absent, not a number, or `no_nutrition_data` set: `incomplete`, reason `missing_values`                                                                                                                                                                                                                                                  |
| implausible   | Any value negative, energy over 1000 kcal, a macro over 100 g, or the three macros over the own-food limit: `incomplete`, reason `implausible_values`                                                                                                                                                                                                    |
| ignored       | Salt, sodium, sugars, serving size, images. The catalogue holds four values                                                                                                                                                                                                                                                                              |

The sum check is one exported function, `macroSumWithinLimit(per100g)` in `packages/types/src/foods.ts`, taken out of `OwnFoodPer100gSchema`'s refinement (`foods.ts:59-64`), which then calls it. `foodOf` calls the same function, so the rule exists once. An `incomplete` answer carries the name built by the same rule, brand and 120 cut included.

### Storing a product (FR-SCAN-04)

A complete product becomes one row: `source = 'open_food_facts'`, `user_id` null, `fineli_id` null, `name`, `name_en`, the four values, `barcode`. Nobody edits it (FR-FOOD-05). `created_at` is when it was fetched, since a stored product is never refreshed: a later refresh rule keys on it. The row is visible to a user once that user has a `food_lookups` row for it. Search then finds it by name, ranked with "anything else" at step 3 of the search rule.

- **Duplicates.** One stored row per product, by a unique index on the barcode padded to 14 digits, so `012000161155` and `0012000161155` are one product. The insert is `ON CONFLICT DO NOTHING` on `foods_off_barcode_uq`, in its own transaction. The read-back by the requested GTIN is a new statement after that transaction has committed, at the default READ COMMITTED level, never inside a REPEATABLE READ snapshot taken before the insert.
- **Two first lookups at once.** Two users, or two devices, look up a product nobody has stored. Both pass steps 1 to 5 and both call Open Food Facts, so the product costs two calls once. The second insert waits on the unique index until the first commits, then does nothing. Both read the same row back, and each records its own lookup. Each user's `food_lookups` row is written before that user's `getFood`, so each answer is visible to the user who asked.
- **The stored code is the requested one.** Open Food Facts can answer under a code other than the one asked for, such as a product merged into another. When the answer's `code`, padded to 14, differs from the requested 14-digit form, the lookup answers `not_found`, caches it and stores nothing. Storing the answer under the requested code would put another product's figures under that barcode, in a shared row that is never refreshed, and every later lookup of that code by any user would find it. Storing it under the answer's code would leave the read-back empty, and every later lookup would call again. Answering `not_found` keeps the index true at the cost of one product the person adds from its label. The two forms of one code, such as a UPC-A answered under its 13-digit form, pad to the same 14 digits and are not a difference.
- **Later changes at Open Food Facts.** The stored row is not refreshed. FR-SCAN-04 asks that the next lookup needs no call, and entries keep their own figures anyway. A person who finds the figures wrong uses **Copy to your foods** (0.4).
- **Taking one down.** An operator sets `retired_at` on the row, as the Fineli import does for a food that left a release. Search stops finding it for everyone, and entries and favourites that point at it keep reading it. A lookup that meets a retired stored row answers `not_found` and calls nothing, so the person adds the food from its label, and their own food wins from then on. Unretiring is clearing `retired_at`. The statement goes into `docs/features/foods.md`, How it works. A row is never deleted, because entries cascade from their food (`entries.ts:53`).
- **Own foods with the same barcode.** Each user may have one own food per barcode, whatever is stored. The lookup takes the own food first. Own-food matching pads both sides to 14 digits too, and takes the most recently updated when two match, which only two forms of one code can cause.
- **The macro sum.** It holds on own foods. A product over it is never stored (0.3).
- **Incomplete figures (FR-SCAN-05).** Nothing is stored. The answer carries the barcode, the name and the values Open Food Facts had. The web opens the own-food form with them, and the person's save is an ordinary `POST /foods`, under every own-food rule.

### The lookup service

`apps/backend/src/services/writes/barcode.ts`, `lookupBarcode(ctx, code, deps)`. It is a write service: it may insert a stored product and it records the user's lookup. `deps` holds the client, the two buckets, the cache and the clock. Steps:

1. The user's own visible food whose barcode, padded to 14, matches. Found: answer it, `newlyVisible: false`, since an own food is always visible to its owner.
2. `gtinOf(code)`. Null: answer `not_found`, no call. `"in_store"`: answer `in_store`, no call, nothing stored.
3. A stored Open Food Facts row for that GTIN. Retired: answer `not_found`, no call. Live: record the lookup and answer it, with `newlyVisible` from the record.
4. A cached answer for that GTIN: answer it.
5. Both budgets, as under "Budgets": the user's empty answers 429 `barcode_lookup_limit`, the server's empty answers 429 `barcode_lookup_busy`, else one token from each.
6. `fetchProduct`. Unavailable: 503 `barcode_lookup_unavailable`.
7. Not found, or found under a different code: cache and answer `not_found`. Incomplete: cache and answer `incomplete`. Complete: insert, read the row back after the insert has committed (retired meanwhile: `not_found`), record the lookup, read it through `getFood` (portions, favourite, last amount), answer `found`, with `newlyVisible` from the record.

**Recording the lookup** is `INSERT INTO food_lookups ... ON CONFLICT (user_id, food_id) DO UPDATE SET looked_up_at = now() RETURNING (xmax = 0) AS inserted`, the form `services/writes/targets.ts:41` already uses through Drizzle's ``.returning({ inserted: sql<boolean>`xmax = 0` })``. It runs in a transaction that first takes the user's row through `lockUserForWrite`, as every write that inserts a user's row does, so a lookup that races an account deletion answers 404 `user_not_found`, and two of one user's lookups of one product take turns. `inserted` is `newlyVisible`: true when this lookup made the product visible to this user, false when the user had looked it up before. No log line holds the barcode, the product's name or the user id together with either.

**`newlyVisible` says nothing about other users.** A product another user stored first and a product this lookup just fetched answer in the same shape, `found` with `newlyVisible: true`, on the user's first lookup of it. The flag cannot tell a user whether anyone else looked a product up. The answer's speed still can (section h, risks).

**The invariant `visibleTo` rests on.** An Open Food Facts food in a user's entries, favourites or recents always has that user's `food_lookups` row, because the user could only log or star it once visible. It holds because `food_lookups` rows are deleted only by their two cascades: the user's account deleted, or the food row deleted, which never happens to a stored product. No code deletes a `food_lookups` row. A later "clear my history" must not either, or the user's own favourites would vanish from their reads. The engineer writes this into the comment in `foodScope.ts` and into the Data section of `docs/features/foods.md`. Entries never depend on it: `selectEntries` left-joins `foods` with no visibility filter (`services/entryRows.ts:53`), so an entry keeps its name and figures either way.

**The later assistant tool.** `lookupBarcode` writes a stored product, which is public data, and a `food_lookups` row, which only makes that product visible to the user. The recommendation for the connected AI step is that a reading key may call it, under the same per-user budget, since tool calls run the same service. The connected AI design decides.

## d) API interface

All under `/api/v1`, Bearer, registered before `/foods/:id` in `apps/backend/src/routes/foods.ts`.

| Method | Path            | Body          | Answers                                                                                                                           |
| ------ | --------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/foods/lookup` | `{ barcode }` | 200 `BarcodeLookup`. 400 `barcode_invalid`. 429 `barcode_lookup_limit` or `barcode_lookup_busy`. 503 `barcode_lookup_unavailable` |

A `POST`, because the lookup may write. The barcode is in the body, so no URL and no log line holds it (0.8). A 429 also sends `Retry-After`, which the web does not read, because CORS exposes no response header (`app.ts:25`). Each 429 code has its own line, true for its own bucket: the server's refills within a minute, the user's does not promise a time.

New shapes in `packages/types/src/barcode.ts`, exported from the index:

```ts
/** A barcode as typed or scanned: spaces removed, 8 to 14 digits. The own-food body uses it too. */
export const BarcodeSchema = z
  .string({ error: "barcode_invalid" })
  .transform((s) => s.replace(/\s+/g, ""))
  .pipe(z.string().regex(/^[0-9]{8,14}$/, { error: "barcode_invalid" }));

export const BarcodeLookupBodySchema = z.object({ barcode: BarcodeSchema });

/** What Open Food Facts had, any value possibly missing or out of range. */
export const ProductValuesSchema = z.object({
  energyKcal: z.number().nullable(),
  proteinG: z.number().nullable(),
  carbsG: z.number().nullable(),
  fatG: z.number().nullable(),
});

export const BarcodeLookupSchema = z.discriminatedUnion("result", [
  /**
   * `newlyVisible`: this lookup made the food visible to this user (their
   * `food_lookups` row was inserted, not updated), so their cached searches
   * are stale. Never says whether another user looked the product up.
   */
  z.object({ result: z.literal("found"), food: FoodDetailSchema, newlyVisible: z.boolean() }),
  z.object({
    result: z.literal("incomplete"),
    barcode: z.string(),
    reason: z.enum(["missing_values", "implausible_values"]),
    product: z.object({ name: z.string().nullable(), per100g: ProductValuesSchema }),
  }),
  z.object({ result: z.literal("not_found"), barcode: z.string() }),
  /** A shop's own number for a weighed or priced item. Never sent, never stored. */
  z.object({ result: z.literal("in_store"), barcode: z.string() }),
]);
export type BarcodeLookup = z.infer<typeof BarcodeLookupSchema>;
```

`OwnFoodUpdateBodySchema.barcode` (`packages/types/src/foods.ts:161-166`) becomes `BarcodeSchema.nullable().default(null)`, so an own food and a lookup read a barcode one way. An own food's barcode typed with spaces is then stored without them. Its test changes with it. `FoodDetailSchema.barcode`'s comment becomes "Set on an own food that has one and on every Open Food Facts food" (0.7). `found.food.source` says whether the food is the user's own or from Open Food Facts.

New error codes in `packages/types/src/errors.ts`, with server text in `apps/backend/src/lib/errors.ts` and a line each in the web catalog: `barcode_lookup_limit` ("You have looked up many barcodes this hour. Try again later."), `barcode_lookup_busy` ("Too many lookups at once. Try again in a minute."), `barcode_lookup_unavailable` ("Open Food Facts did not answer."). `barcode_invalid` exists. The limit's line names no time, because the user's bucket gives back one call every 2 minutes and the app cannot say when the person will press again. The busy line's "in a minute" is true: the server's bucket refills a call every 6 seconds.

Env, in `apps/backend/src/lib/env.ts` and `.env.example`, both optional: `OFF_BASE_URL` (a URL) and `OFF_USER_AGENT` (a string). Neither is a secret.

## c) Data model

Migration `0006`, generated with `drizzle-kit generate` from the schema below, so `meta/_journal.json` and the snapshot stay in step. `0005_first_run_done.sql` is on master.

In `apps/backend/src/db/schema/foods.ts`, on `foods`:

```ts
check("foods_off_has_barcode", sql`${t.source} <> 'open_food_facts' OR ${t.barcode} IS NOT NULL`),
uniqueIndex("foods_off_barcode_uq")
  .on(sql`lpad(${t.barcode}, 14, '0')`)
  .where(sql`${t.source} = 'open_food_facts'`),
```

A new table in the same file:

```ts
/** The stored Open Food Facts products a user has looked up. Only these show in that user's reads. */
export const foodLookups = pgTable(
  "food_lookups",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    foodId: uuid("food_id")
      .notNull()
      .references(() => foods.id, { onDelete: "cascade" }),
    lookedUpAt: timestamp("looked_up_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.foodId] }), index("food_lookups_food_id_idx").on(t.foodId)],
);
```

`visibleTo` in `apps/backend/src/services/foodScope.ts` becomes:

```ts
export const visibleTo = (userId: string): SQL =>
  and(
    isNull(foods.deletedAt),
    or(
      eq(foods.source, "fineli"),
      eq(foods.userId, userId),
      and(
        eq(foods.source, "open_food_facts"),
        sql`EXISTS (SELECT 1 FROM food_lookups l WHERE l.user_id = ${userId} AND l.food_id = ${foods.id})`,
      ),
    ),
  )!;
```

The rule stays in one place. Search, the detail, favourites, recents and the add's value read all follow it, so a person can log only a product they looked up, and another user's lookups never show. The `EXISTS` is evaluated for stored products only and hits the primary key. Lookup steps 3 and 7 read stored rows without `visibleTo`, by design: that is how any user's lookup finds a product with no new call.

No row has `source = 'open_food_facts'` yet, so the constraint and the index apply to an empty set. Rollback: drop the table, the index and the constraint, and restore `visibleTo`. The own-food unique index stays as it is, on the raw barcode: changing it could fail on rows already stored, for a gain nobody has asked for. Own-food matching needs no index: it runs within one user's rows on `foods_user_id_idx`.

## e) Data flow

1. In the log sheet's search field, the person types or pastes "6408430000258". The text, spaces removed, is 8 to 14 digits, so the search view is in barcode mode: no name search is sent, no saved meal filter shows, and one row reads **Look up barcode 6408430000258**.
2. A press on it, or Enter, sends `POST /foods/lookup` with `{ barcode }`, as a mutation through `useBarcodeLookup` (no query key, so no food write can refetch it). The hook holds `{ code, answer }` in state. It drops the answer when the typed text stops naming that code. While a lookup is pending, a press for the same code does nothing. A lookup for a new code, such as a scan during a typed lookup, becomes the one the hook waits for, and the earlier answer is dropped when it lands, compared by code.
3. `found`: the food goes into `foodDetailQuery(id)` through `setQueryData`. The sheet opens its food view (`showFood`) only while its search view shows and the field still names the held code. An answer that lands after the person opened another food or a meal, or closed the sheet, is held quietly and pulls nobody into a view. It shows as the held row when they come back to the search with that code. The log block offers the last amount or an empty amount. **Log** is the ordinary add. With `newlyVisible: true`, `afterFoodNewlyVisible` marks every cached search stale, so the next search by name finds it. It runs in the mutation's hook-level `onSuccess`, in the `useMutation` options, which TanStack Query runs even after the sheet has unmounted. Per-call `mutate` callbacks do not run after unmount, so the invalidation is never there.
4. `not_found`, `incomplete` or `in_store`: the result block says so, with **Add it from the label** or **Complete it from the label**, which opens the own-food sheet. It holds the barcode (not for `in_store`), and for `incomplete` the name and every value that is a number. Its save is the ordinary own-food create. On that save, when the saved food's barcode padded to 14 equals the held code padded to 14, the hook's answer turns into `found` with the new food, locally and with no request. The person may have changed or cleared the barcode in the form, and then the held answer stays as it was. Either way the sheet opens the food's view, as a new own food does today.
5. 503, 429 or offline: the result block says so, with **Try again** and **Add it from the label**.
6. Back from the food view returns to the search with the number still typed and the held answer shown as one row under "Barcode 6408430000258". Nothing is sent again.

## f) Frontend architecture, part 1

| Component                                                         | Change   | Work                                                                                                                                                                                                                                                             |
| ----------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/lib/barcode.ts`                                     | new      | `barcodeOf(text)`: the digits when the text, spaces removed, is 8 to 14 digits, else null. `openFoodFactsUrl(code)`: `https://world.openfoodfacts.org/product/{code}`                                                                                            |
| `apps/web/src/lib/api/foods.ts`                                   | modified | `lookupBarcode(code, req)`, a `POST`                                                                                                                                                                                                                             |
| `apps/web/src/lib/invalidation.ts`                                | modified | `afterFoodNewlyVisible(client, food)`: every cached search stale                                                                                                                                                                                                 |
| `apps/web/src/components/foods/useBarcodeLookup.ts`               | new      | The mutation, the held answer and the code it waits for, the search invalidation in the hook-level `onSuccess`, the local turn to `found` after an own-food save whose barcode matches. Keeps `FoodSheet.tsx` (430 lines today) under 500                        |
| `apps/web/src/components/foods/BarcodeResult.tsx`                 | new      | The result block of the table below. Takes the code, the hook's state and the callbacks                                                                                                                                                                          |
| `apps/web/src/components/foods/FoodSearchView.tsx`                | modified | Barcode mode: when `barcodeOf(query)` is set, render `BarcodeResult` in place of the meals and the food results                                                                                                                                                  |
| `apps/web/src/components/foods/FoodSheet.tsx`                     | modified | Uses `useBarcodeLookup`, opens the food view on `found` only while the search view shows the held code, opens the own-food sheet with a start                                                                                                                    |
| `apps/web/src/components/foods/SearchField.tsx`                   | modified | Enter in barcode mode runs the lookup instead of only putting the keyboard away                                                                                                                                                                                  |
| `apps/web/src/components/foods/OwnFoodSheet.tsx`                  | modified | `initialName` becomes `initial?: { name, barcode, per100g }`, each part optional. New `note?: string`, a line under the Per 100 g hint. A value left as its prefill is read as the number it came from, then checked by the same ranges and sum as a typed value |
| `apps/web/src/components/foods/ownFoodForm.ts`                    | modified | `parseOwnFood` takes the prefill as a baseline for the values only. The name is always checked as a new name                                                                                                                                                     |
| `apps/web/src/components/foods/FoodSheetStack.tsx`                | modified | Passes the own-food start                                                                                                                                                                                                                                        |
| `apps/web/src/components/recipes/RecipesTab.tsx`                  | modified | Its own-food sheet's `initialName` becomes `initial` (the caller the Recipes tab page adds)                                                                                                                                                                      |
| `apps/web/src/components/foods/FoodSourceLine.tsx`                | modified | For Open Food Facts: "From Open Food Facts", **See it on Open Food Facts** (the product page, a new tab) and **About the food data**                                                                                                                             |
| `apps/web/src/components/foods/FoodDetail.tsx`                    | modified | **Copy to your foods** on an Open Food Facts food (0.4)                                                                                                                                                                                                          |
| `apps/web/src/app/(app)/settings/_components/FoodDataSection.tsx` | modified | A second paragraph, the Open Food Facts credit                                                                                                                                                                                                                   |
| `apps/web/messages/en.json`                                       | modified | The copy below                                                                                                                                                                                                                                                   |

**The result block, state by state.** The code shows in the monospaced face. `{name}` is the food's or the product's name in the food-name language.

| State                                   | Shows                                                                                                                               | Actions                                              |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Typed, not looked up                    | **Look up barcode {code}** as a full-width row                                                                                      | The row, or Enter                                    |
| Looking up                              | "Looking up {code}…" with the busy ring                                                                                             |                                                      |
| Found, own food or stored product       | The food view opens. Back shows "Barcode {code}" over the food's row                                                                | The row opens the food again                         |
| Found, newly from Open Food Facts       | The same                                                                                                                            |                                                      |
| Not found                               | "No food has the barcode {code}."                                                                                                   | **Add it from the label**                            |
| A shop's own barcode                    | "This barcode is the shop's own. It changes with the weight or the price, so it cannot find a product."                             | **Add it from the label**, with no barcode filled in |
| Incomplete, values missing              | "Open Food Facts has {name} without all four values." or, with no name, "Open Food Facts has this product without all four values." | **Complete it from the label**                       |
| Incomplete, values that cannot be right | "Open Food Facts has figures for {name} that cannot all be right." or "...for this product..."                                      | **Complete it from the label**                       |
| Open Food Facts down                    | "Open Food Facts did not answer."                                                                                                   | **Try again**, **Add it from the label**             |
| Too many lookups for the server         | "Too many lookups at once. Try again in a minute."                                                                                  | **Try again**, **Add it from the label**             |
| The person's hourly limit reached       | "You have looked up many barcodes this hour. Try again later."                                                                      | **Add it from the label**                            |
| Could not confirm                       | "Could not confirm. Check your connection and try again."                                                                           | **Try again**                                        |
| Offline                                 | "Looking up a barcode needs a connection."                                                                                          |                                                      |

Every state renders in one block under the search field. The block's first row keeps its place from state to state, and the field never moves.

The own-food sheet opened from the block: title "Add a food". The barcode is filled in, except for a shop's own barcode. From an incomplete product the name and values are filled in, and the note says "Check each value against the label. Some came from Open Food Facts." From not found or a failure, the name is empty, unless the product had one, and the usual hint "Copy the values from the label." stands alone. **Copy to your foods** opens the same sheet with everything filled in and the same note. A prefilled value such as 3.125 g saves as it is when left untouched.

**The credit**, in Settings under Food data, after Fineli's paragraph: "Product data comes from [Open Food Facts](https://openfoodfacts.org), available under the [Open Database License](https://opendatacommons.org/licenses/odbl/1-0/). Hovimestari is not produced or endorsed by Open Food Facts." Each Open Food Facts food links to its own product page, as the terms ask for a product's data, and to this credit.

**Logging stays two taps.** A found product is an ordinary food in the food view: the amount, Log. A scan from the Day tab is **Log food**, the camera, the read, the amount, **Log**.

**Mobile.** The result block rows are at least 56 pixels, every button 44. The search field never moves. In barcode mode the number pad from `inputMode` is not forced, since the field takes names too. A paste is the common way to enter a long number.

## Part 2: the camera (FR-SCAN-01)

### First, a prototype on Artur's phone

The pivot plan asks for it before a design is committed (`pivot-plan.md:113`). Slice 4 starts with a throwaway page on a branch that never merges, `spike/scan-check`: one route with the `<video>`, the decoder and a line for each result, served over the local HTTPS runbook. Artur's phone must show:

1. In Safari, the prompt appears, the rear camera streams inline, and a real EAN-13 on a tub or a can reads within about two seconds at a hand's width.
2. The same in the installed app, with what happens on the next launch written down.
3. The camera light goes off when the page closes the stream and when he switches apps.

If 1 fails, slice 4 stops and the decoder choice is reopened. If only 2 fails, slice 4 ships for the browser tab, and the installed app's behaviour goes in the page doc's known gaps. The rest of slice 4 starts after his result.

### The decoder

Every iOS browser runs WebKit. Its `BarcodeDetector` is behind a flag, off by default up to iOS 27.2 (caniuse), and a WebKit report says the flagged version stopped detecting codes after Safari 17.6. So a decoder ships with the app.

| Option                                                           | Formats                                          | Size                                                        | Licence                          | Maintenance                                                                 | Verdict                                                                                                                                            |
| ---------------------------------------------------------------- | ------------------------------------------------ | ----------------------------------------------------------- | -------------------------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`zxing-wasm` reader**, ZXing-C++ in WebAssembly                | EAN-13, EAN-8, UPC-A, UPC-E and every common one | `zxing_reader.wasm` 946,598 bytes, 411 KB gzipped, measured | MIT, ZXing-C++ itself Apache 2.0 | 3.1.7, published 2026-11-15                                                 | **Recommended**                                                                                                                                    |
| `barcode-detector`, a `BarcodeDetector` polyfill on `zxing-wasm` | The same                                         | The same wasm plus a small wrapper                          | MIT                              | 3.2.4, published 2026-11-15, pins `zxing-wasm` 3.1.7                        | The standard API, but as a polyfill it hands Android to Chrome's own detector: two decoders to test. As a ponyfill it adds nothing over the reader |
| `@zxing/browser`, ZXing ported to JavaScript                     | The same                                         | Larger JavaScript, no wasm                                  | MIT                              | 0.2.1, last published 2026-07. The project calls itself in maintenance mode | Slower on a phone, and maintenance mode                                                                                                            |
| `@ericblade/quagga2`                                             | 1D codes only                                    | JavaScript                                                  | MIT                              | 1.13.0, 2026-10                                                             | Weaker on angled or small codes in reports. Fine as a fallback, not needed                                                                         |
| `html5-qrcode`                                                   | Many                                             | Bundles `@zxing/library`                                    | Apache 2.0                       | Last published 2023-04                                                      | Unmaintained                                                                                                                                       |
| Commercial SDKs (Scandit, STRICH)                                | All                                              |                                                             | Paid                             | Maintained                                                                  | A paid key, and they call home for licensing                                                                                                       |

**Recommendation: `zxing-wasm/reader`**, called as `readBarcodes(imageData, options)`. One decoder on every device, so what Chromium tests is what the iPhone runs. It is maintained, and its wasm is self-hosted.

**Loading.** Only when the scanner opens, in parallel with the camera start: `await import("zxing-wasm/reader")`, then `prepareZXingModule({ overrides: { locateFile } })` with the wasm's URL from `new URL("zxing-wasm/reader/zxing_reader.wasm", import.meta.url)`. The package exports that subpath. Turbopack, which both `next dev` and `next build` run on Next 16, emits the file under `/_next/static/media/`, which the service worker caches first, so the second open has no download and the scanner opens offline. The engineer confirms the emitted URL in dev and in the production build, and that it is served as `application/wasm`, which streaming instantiation needs. Never the default jsDelivr URL: a third-party fetch would tell a CDN who opened the scanner, and break offline. If the bundler cannot emit it, the fallback is a copy step into `public/` checked against the exported `ZXING_WASM_SHA256`, and then the wasm's path is added to `sw.js`'s cached-first paths with `CACHE_VERSION` bumped.

**Headers.** Slice 4 adds `Permissions-Policy: camera=(self), microphone=(), geolocation=()` to `next.config.ts` and pins it in `src/app/__tests__/securityHeaders.test.ts`, so a later hardening pass cannot switch the camera off without a failing test. There is no `script-src` today. A future one must carry `'wasm-unsafe-eval'`, or the decoder cannot compile. The headers test's comment says so.

### The camera stream

- `navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } } })`.
- The `<video>` is `playsInline`, `muted` and `autoPlay`. Without `playsinline`, iOS Safari does not play a camera stream inline.
- Continuous focus through `applyConstraints({ advanced: [{ focusMode: "continuous" }] })` where `getCapabilities()` lists it. A **Light** toggle where it lists `torch`. Not verified on iOS: whether WebKit reports `torch`. The toggle does not show when it does not.
- Decode about every 150 ms: draw the middle band of the frame, the area the overlay marks, into a canvas at most 960 pixels wide, read its `ImageData`, decode with the retail formats only and `tryHarder`. On the main thread in this change. Measure on the phone, and move decoding into a worker only if the swipe stutters.
- The first read wins. EAN and UPC carry a check digit that the decoder verifies.
- **Every way out stops the camera.** `useCameraStream` keeps a session number that every start takes and every stop moves on. The stream stops (`track.stop()` on every track, `srcObject = null`) when the sheet starts to close, when the page is hidden (`visibilitychange`), and on unmount. A `getUserMedia` that resolves after its session ended, such as after the person swiped the sheet away during the prompt, stops every track of the stream it got and shows nothing. A decode in flight when the session ends, or after a read already won, is dropped. Shown again with the sheet open, the camera starts again.
- No frame leaves the device. The only thing sent is the number, by part 1.

**Permissions and failures.**

| Case                                                       | Shows                                                                          | Action                             |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------- |
| No `navigator.mediaDevices`, as on plain http over the LAN | No camera button. Typing works                                                 |                                    |
| Starting, and the decoder loading with it                  | "Starting the camera…"                                                         | **Type the number**                |
| Refused (`NotAllowedError`)                                | "Hovimestari cannot use the camera. Allow it in Settings, or type the number." | **Type the number**                |
| No camera (`NotFoundError`, `OverconstrainedError`)        | "No camera was found. Type the number instead."                                | **Type the number**                |
| Camera busy (`NotReadableError`)                           | "Another app is using the camera."                                             | **Try again**, **Type the number** |
| Decoder failed to load                                     | "The scanner did not load. Type the number instead."                           | **Type the number**                |
| Scanning                                                   | The live view, the band marked, "Point the camera at the barcode."             | **Light** where supported          |

**Type the number** closes the scanner and puts focus in the search field, so the keyboard rises on a tap there.

**The installed app on iOS.** A camera permission is not kept for a Home Screen web app across launches (WebKit bug 215884, still listed as a known issue in a vendor's article updated 2026-08-27), so the installed app asks again on each launch. A camera freeze in installed apps was reported on iOS 17.5.1 (WebKit bug 275527). The app uses no hash routing, which that first bug's prompt-on-every-hash-change needs. Neither is in the app's power. The prototype checks both first.

### Where it lives

- **The button.** In the log sheet's search field, at the end, where the clear cross sits once something is typed. Empty field: a camera icon, accessible name "Scan a barcode", a 44 pixel target. Typed: the cross. One slot, so the field never changes width. Shown only where `navigator.mediaDevices?.getUserMedia` exists.
- **The sheet.** `ScannerSheet`, a `BottomSheet` stacked on the log sheet through `FoodSheetStack`, which keeps its target, titled "Scan a barcode". The video fills the body's width at 4:3, the overlay's band drawn with ink-coloured corners from the tokens, the hint line under it, **Type the number** in the footer. Focus starts on **Type the number**. It is always dismissible: nothing is typed in it, so a swipe, a tap above it or Escape closes it and stops the camera. No field, so no keyboard. From `md` it is the centred dialog.
- **A read.** A short `navigator.vibrate(30)` where it exists, which iOS lacks. The scanner closes, the search field holds the number, and the lookup runs at once, as if **Look up** were pressed. The button that opened the scanner has turned into the clear cross, so focus goes to the result block (`tabIndex={-1}`, named "Barcode {code}"), not back to the opener. The status line says "Read barcode {code}." for six seconds, so a screen reader hears it.
- **Accessibility.** The video is `aria-hidden`. The sheet's hint and failure lines are a polite live region. Every action is a button. A person who cannot aim a camera types the number.

### Testing without a phone

- **Unit, in Jest:** the decoder wrapper on real images, in a suite that starts with `/** @jest-environment node */` and passes the wasm file's bytes as `wasmBinary` through `prepareZXingModule`, since under jsdom Emscripten would fetch by URL. It generates EAN-13, EAN-8 and UPC-A images with `zxing-wasm/writer` at test time, decodes them with the reader and asserts the digits. No mock of the decoder.
- **The sheet, in Jest:** `getUserMedia` stubbed to resolve a fake stream or reject each error name. Asserts each line, and that every track's `stop` runs on close, on `visibilitychange` to hidden and on unmount. Also: a sheet closed before `getUserMedia` resolves stops every track of the stream that resolves later, and a decode result that lands after close dispatches nothing. That is the across-state property: no state of the sheet leaves a track running after the sheet is gone.
- **In a real browser:** Chromium with `--use-fake-ui-for-media-stream --use-fake-device-for-media-stream --use-file-for-fake-video-capture=<file>.y4m`. The `.y4m` is made from a generated barcode image with `ffmpeg -loop 1 -i ean13.png -t 5 -pix_fmt yuv420p ean13.y4m`, kept out of the repository. The ui-validator checks the read, the lookup that follows, the sheet's place in every state and that the camera light goes off.
- **Only the phone proves:** the permission prompt in Safari and in the installed app, the prompt on each launch, focus on a real can or tub, how fast a read comes, the torch, the swipe over a playing video, and the keyboard after **Type the number**.

### Local HTTPS on the LAN

The phone loads the dev server over plain `http://<address>:3000`. That is not a secure context, so `navigator.mediaDevices` is missing and the camera cannot run. The page and the API both need https, because an https page cannot call an http API.

| Option                                                                | Steps for Artur                                                           | What leaves his network                                              | Same-origin guard and cookies                                                                                                                                                                                                     | Verdict                                                                                       |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| **mkcert and Caddy**, two https ports in front of the two dev servers | Install two tools, make one certificate, trust its root on the phone once | Nothing                                                              | Caddy keeps `Host` and sets `X-Forwarded-Proto: https`, which `_guard.ts:34-37` reads. Over https the browser also sends `Sec-Fetch-Site`. Cookies are not `Secure` in development, and they work over https as they do over http | **Recommended**                                                                               |
| Next.js `next dev --experimental-https`                               | One flag, plus mkcert for a certificate naming the LAN address            | Nothing                                                              | Holds for the page                                                                                                                                                                                                                | Covers the web app only. The API would still be http, and an https page cannot call it        |
| Express serving https itself                                          | A certificate path in `.env`                                              | Nothing                                                              | Holds                                                                                                                                                                                                                             | TLS code in the backend that only development uses                                            |
| A tunnel (Cloudflare Tunnel, ngrok)                                   | An account, a running client                                              | Every request, sign-in and food log, through a third party           | Holds                                                                                                                                                                                                                             | Sends personal data out (NFR-PRIV-01)                                                         |
| Tailscale `serve`                                                     | An account, the app on both devices                                       | No traffic, but the machine's name goes into public certificate logs | Holds                                                                                                                                                                                                                             | Works, with an account and a client to keep. A fallback if trusting a root on the phone fails |

**Recommendation: mkcert and Caddy.** The runbook, `docs/setup/local-https.md`, written by the engineer of slice 3 from this outline, with exact commands for macOS:

1. Install: `brew install mkcert caddy`. Then `mkcert -install`, which trusts mkcert's root on the Mac.
2. Find the address: `ipconfig getifaddr en0`. On some Macs Wi-Fi is `en1`, so try `ipconfig getifaddr en1` when the first prints nothing.
3. Make the certificate into the repository's ignored folder: `mkcert -cert-file tools/local-https/certs/dev.pem -key-file tools/local-https/certs/dev-key.pem <address> localhost 127.0.0.1`.
4. Trust the root on the iPhone: `open "$(mkcert -CAROOT)"`, AirDrop `rootCA.pem` (never `rootCA-key.pem`) to the phone, then Settings, General, VPN & Device Management, the downloaded profile, Install. Then Settings, General, About, Certificate Trust Settings, turn on full trust for the mkcert root.
5. Point the apps at the https addresses. In `apps/web/.env.local`: `NEXT_PUBLIC_API_URL=https://<address>:3444/api/v1` and `NEXT_DEV_ORIGINS=<address>`. In `apps/backend/.env`: add `https://<address>:3443` to `CORS_ORIGIN`. `BACKEND_URL` stays `http://localhost:3001`, since the web server talks to the backend on the machine.
6. Start the two servers as in the local development runbook, then Caddy from the repository root: `LAN_ADDRESS=<address> caddy run --config tools/local-https/Caddyfile`. Allow incoming connections when macOS asks.
7. Open `https://<address>:3443` on the phone. Check: no certificate warning, and signing in with an email and a password works. In Safari's Web Inspector from the Mac, `window.isSecureContext` reads `true`. The camera button is checked in slice 4, once it exists.
8. To undo: stop Caddy, set the env values back, and on the phone delete the profile in VPN & Device Management.

The runbook also says, in plain words:

- **Google sign-in does not work from the phone** over this setup, because `GOOGLE_CALLBACK_URL` and `FRONTEND_URL` point at localhost. Email and password do.
- **A new address means a new certificate.** When the router hands the Mac another address, repeat steps 2, 3, 5 and 6. The root on the phone stays trusted.
- **The installed app** needs a production build, since the development server registers no service worker. `NEXT_PUBLIC_*` values are built in, so build after step 5, then start with `LOCAL_PRODUCTION_RELAY=1` as `apps/web/README.md`, "Running a production build locally", says. The production cookie is `Secure`, which holds over https.
- **mkcert's root key** on the Mac can make certificates the phone trusts. It stays on the Mac, and the profile comes off the phone when testing ends.

Committed with the runbook: `tools/local-https/Caddyfile`, and `tools/local-https/certs/` in `.gitignore`.

```caddyfile
{
	auto_https off
}

https://{$LAN_ADDRESS}:3443 {
	tls tools/local-https/certs/dev.pem tools/local-https/certs/dev-key.pem
	reverse_proxy localhost:3000 {
		header_up X-Real-IP {remote_host}
	}
}

https://{$LAN_ADDRESS}:3444 {
	tls tools/local-https/certs/dev.pem tools/local-https/certs/dev-key.pem
	reverse_proxy localhost:3001
}
```

`header_up X-Real-IP` on the web app's site lets the relay key sign-in limits on the phone's own address (`_relay.ts:37-42`), not on 127.0.0.1. Step 9 of `docs/setup/local-development.md` gets one sentence linking the new runbook for the camera.

## g) Constraints and decisions

- **The server calls Open Food Facts.** The browser never does, so Open Food Facts never sees a user's address or browser alongside what they eat (NFR-PRIV-01, section 5). The cost is the shared 15-a-minute budget, handled by the two buckets, the check digit and the cache.
- **One user's lookups never show in another's search** (0.1). Storage is shared, visibility is per user, and the rule lives in `visibleTo`. Every `found` answer has one shape whoever stored the product. The answer's speed is not hidden (section h, risks).
- **ODbL.** The stored rows are a subset of the Open Food Facts database with two transformations: kilojoules to kilocalories where no kilocalories are given, and the brand added to the name. The design keeps them separable by `source`, so an extract under ODbL is one query if share-alike is ever owed. The app shows the attribution the terms ask for. Whether the hosted app "publicly uses" a derivative database is Artur's question, in `TODO.md`, before the app opens to others.
- **Own foods first, always.** The person's own word beats any database. That is FR-SCAN-02, and it is what makes **Copy to your foods** a correction.
- **No barcode on name search.** A barcode reaches the server only through the lookup, never `/foods/search`, so the search rule and its tests stay as they are.
- **The lookup is a write.** `POST`, a mutation on the web, held in the sheet's state, never a cached query.
- **The scanner is a library-free `<video>` inside the Base UI sheet.** No component library has a camera view. The sheet around it is the wrapper.

### Rejected alternatives

| Alternative                                                                      | Why it was rejected                                                                                                                                      |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A separate "Enter a barcode" control                                             | A second way into the same lookup, with a place of its own to defend on a phone. The search field already takes text, and digits are not a name          |
| A lookup in the own-food form's Barcode field                                    | A second lookup site, and on the Recipes tab it would prefill a form the person is already filling                                                       |
| Calling Open Food Facts from the browser                                         | Sends each user's address and browser to a third party with the barcode                                                                                  |
| A copy of each product per user, editable                                        | Three workarounds and a requirement change. Weighed under section 0                                                                                      |
| Stored products in every user's search                                           | One user's lookup would change what every other user's search shows, and would tell them what someone looked up. Possible later by dropping one `EXISTS` |
| `GET /foods/lookup?barcode=` as a cached query under `["foods"]`                 | A write behind a read verb. Every food write refetches `["foods"]`, so a star press would send another lookup and flip the result block under the person |
| Refreshing a stored product from Open Food Facts on each lookup, or after N days | FR-SCAN-04 asks for no new lookup. Entries keep their own figures, so a refresh helps only future logs, which **Copy to your foods** already serves      |
| A worker for decoding from the start                                             | One more bundle entry and a message protocol before a phone has shown a need                                                                             |
| Native `BarcodeDetector` where present, wasm elsewhere                           | Two decoders that read the same code differently. One is enough                                                                                          |

### Non-questions

- Open Food Facts foods are read-only (FR-FOOD-05).
- The figures a found product logs come from the food, as every food's do. Nothing is an estimate here.
- Local HTTPS, not a deploy, for the phone (Artur, 2026-11-18).
- Scanning several products in a row is "Later" in the requirements' scope table.
- Stored products are visible only to the users who looked them up (orchestrator, 2026-11-18, as the build's default. Artur may widen it).

## h) Open questions and risks

Each of these is also an item in `TODO.md` under "Needs a decision from Artur", in plain words.

1. **Who sees a stored product in name search** (0.1).
   > **Assumption:** only the users who looked it up. One-line flip: drop the `EXISTS` from `visibleTo`.
2. **Implausible figures count as incomplete** (0.3), with FR-SCAN-05's wording widened as proposed in section 1.
   > **Assumption:** built so. One-line flip: keep such a product as it is.
3. **The section 5 wording,** "scans or types a barcode".
   > **Assumption:** the build follows FR-SCAN-06, which already allows typing. No code depends on the answer.
4. **The User-Agent.** Open Food Facts asks for a contact in it. The brief forbids personal detail in code.
   > **Assumption:** `Hovimestari/<version>` by default, and Artur sets `OFF_USER_AGENT` on Fly with a contact he chooses, or leaves it. Also optional: their API usage form. One-line flip: none needed in code.
5. **ODbL share-alike for the stored products.** Not needed while the app serves Artur alone.
   > **Assumption:** store as designed, credit as above, rows separable by source, and settle it before the app opens to others. One-line flip: store nothing and look every scan up again, which spends the rate budget and breaks FR-SCAN-04.
6. **Drinks per 100 ml** (0.5).
   > **Assumption:** read as per 100 g. One-line flip: a unit column and a line in the food view.
7. **Copy to your foods** on an Open Food Facts food (0.4). Not in `TODO.md`, since it adds a button and changes no rule.
   > **Assumption:** built. One-line flip: drop the button, the prefill stays for the incomplete path.

**Risks:**

- **Uneven data.** Names in odd case or language, wrong figures, a brand missing. The person sees the source line and the product page link on every such food, and **Copy to your foods** fixes it for them. A wrong stored row is shown only to the users who looked it up, and an operator can retire it.
- **The secure-origin requirement.** Without the runbook the phone has no camera, and typing still works. In production Vercel serves https, so this is development only.
- **Timing tells a user that someone looked a product up.** A product already stored answers from the database, with no call and no budget spent. A product nobody stored waits for Open Food Facts, which takes far longer. A cached `not_found` or `incomplete` answers fast too, for 10 minutes. So any signed-in user who looks up a barcode can tell from the wait that some user of the app looked that product up before, or that some user looked up an unknown barcode in the last 10 minutes. It never says who, or when, or how often, and the shape of the answer is the same either way. The probe is free of budget, and each one makes the product visible in the prober's own search. Closing it would mean answering stored products as slowly as a call, or spending a token on them, which costs every person a slower lookup or a spent token for a call never made. While Artur is the only user there is nobody to learn about. Before the app opens to others the `TODO.md` item on who sees a product says what holds, and Artur may decide it matters.
- **A restart resets the budgets and the cache.** They live in the backend's memory, so a restart or a deploy gives every user a full budget, fills the server's bucket and drops every cached answer. In the minute after a restart the server can send up to 20 calls, past Open Food Facts' 15. Their refusal reaches the person as "Open Food Facts did not answer." and a second try works. Deploys are rare, so this is accepted.
- **The rate budget.** The server's bucket lives in one process. A second Fly machine would double the calls past what one bucket counts, and the Fly runbook runs one. Fly's outbound IPv4 address may also be shared with other Fly apps unless a static egress address is set, so Open Food Facts may count other apps' calls against the same 15. The 503 path covers both, and the copy says to try again.
- **iOS in the installed app.** The prompt on each launch is WebKit's, unfixed as far as could be checked. The prototype tells.
- **Concurrent edits.** `feat/week-and-copy` is being built now and touches the Day tab's launcher row, a new week sheet, `lib/invalidation.ts`, `lib/queryKeys.ts`, `lib/queryOptions.ts`, `lib/api/days.ts` and `messages/en.json`, plus `packages/types/src/index.ts`, `apps/backend/README.md`, `docs/features.md`, the link map and `TODO.md`. Of these, slice 1 edits `packages/types/src/index.ts`, `apps/backend/README.md` and `TODO.md`. Slice 2 edits `lib/invalidation.ts`, `messages/en.json`, `docs/features.md` and the link map. The Recipes tab page (`docs/design/foods-page.md`) edits `OwnFoodSheet.tsx`, `FoodSheetStack.tsx`, `FoodSheet.tsx`, `messages/en.json` and `TODO.md`, and adds the `components/recipes/` callers slice 2 updates. Each slice rebases after those merge. Nothing here moves a file.

## i) Docs

- `docs/features/foods.md`: "The food catalogue" (stored products, read-only, shown to the users who looked them up), a new section "Looking up a barcode" (the order, the shop's own barcodes, storing, incomplete, taking a product down with its statement, the two budgets and the cache in How it works), "Open Food Facts" beside "Fineli" with its credit, the API table, Data (`food_lookups`, the CHECK and the index, and the rule that `food_lookups` rows go only with their user or their food), Visibility (`visibleTo`'s new branch), the services list, and "Known gaps" loses "The catalogue holds no Open Food Facts food yet".
- `docs/features/quick-logging.md`: one line that a found product logs as any food.
- `docs/app/log-sheet.md`: "The search" gains barcode mode and the result block, "A food" gains the Open Food Facts source line and **Copy to your foods**, "Adding or editing your own food" gains the start and the note, and a new section "Scanning a barcode" for part 2.
- `docs/app/settings.md`: the Food data credit.
- `docs/setup/local-https.md`, new, from `docs/_templates/setup.md`. `docs/setup/local-development.md` step 9 links it.
- `apps/backend/README.md`: the two env values, the `lib/openFoodFacts/` listing. `packages/types/README.md`: `barcode.ts`.
- Catalog, `docs/features.md`: the Foods line adds "looking up a barcode, own foods first and then Open Food Facts, scanned with the camera or typed". The log sheet page line adds scanning.
- Link map: new rows for "barcode lookup, Open Food Facts product" → `features/foods.md#looking-up-a-barcode`, "Open Food Facts, its credit and licence" → `features/foods.md#open-food-facts`, "scanner sheet" → `app/log-sheet.md#scanning-a-barcode`, "local HTTPS" → `setup/local-https.md` (Doc).
- `TODO.md`, in this design change: the six decisions of section h, items 1 to 6, under "Needs a decision from Artur", the licence item reworded and moved there from "Ready to pick up". In slice 1: the rate budget on more than one machine and a static egress address, under "Known gaps". In slice 4: "Prototype barcode scanning" is deleted once Artur's phone has answered, and its result goes in the page doc.

## j) Implementation plan

Four slices, each shippable alone. The runbook (slice 3) can land first. The contract between backend and web is `BarcodeLookupSchema`, `BarcodeLookupBodySchema` and the three error codes, landed in slice 1.

| Step | Slice             | Agent                    | Invoked by                | Work, and the files it may touch                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Exit check                                                                                                                     |
| ---- | ----------------- | ------------------------ | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 1    | 1, lookup backend | backend-engineer         | orchestrator              | `drizzle/migrations/0006_*.sql` and `meta/` (generated), `db/schema/foods.ts`, `services/foodScope.ts`, `lib/openFoodFacts/` (new: `gtin.ts`, `client.ts`, `product.ts`, `limiter.ts`, `cache.ts`, `__tests__/fixtures/` with its README), `services/writes/barcode.ts` (new), `routes/foods.ts`, `lib/env.ts`, `lib/errors.ts`, `apps/backend/.env.example`, `packages/types/src/barcode.ts` (new), `packages/types/src/foods.ts` (`macroSumWithinLimit`, the barcode schema, the comment), `packages/types/src/errors.ts`, `packages/types/src/index.ts`, their `__tests__/`, `apps/backend/README.md`, `packages/types/README.md`, `docs/features/foods.md`, `TODO.md` | Tests below. The full CI command                                                                                               |
| 2    | 2, lookup web     | frontend-engineer        | orchestrator              | Part 1's frontend table, which includes `components/recipes/RecipesTab.tsx`, plus `messages/en.json`, their `__tests__/`, `docs/app/log-sheet.md`, `docs/app/settings.md`, `docs/features.md`, `docs/design/link-map.md`                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Tests below. The full CI command                                                                                               |
| 3    | 3, the runbook    | frontend-engineer        | orchestrator              | `docs/setup/local-https.md` (new), `tools/local-https/Caddyfile` (new), `.gitignore`, `docs/setup/local-development.md`. Docs only                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | `pnpm docs:check`. The engineer runs steps 1 to 7 on a Linux equivalent where they can and says which they could not           |
| 4a   | 4, the prototype  | frontend-engineer        | orchestrator              | `spike/scan-check`, never merged: one page with the video and the decoder                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Artur's phone answers the three checks under "First, a prototype"                                                              |
| 4b   | 4, the camera     | frontend-engineer        | orchestrator              | `components/foods/ScannerSheet.tsx` (new), `components/foods/scanner/` (new: `useCameraStream.ts`, `decoder.ts`), `SearchField.tsx`, `FoodSheetStack.tsx`, `FoodSheet.tsx`, `apps/web/package.json` (`zxing-wasm`), `pnpm-lock.yaml`, `apps/web/next.config.ts` (the permissions policy), `src/app/__tests__/securityHeaders.test.ts`, `public/sw.js` only on the fallback, `messages/en.json`, their `__tests__/`, `docs/app/log-sheet.md`, `docs/features.md`, `docs/design/link-map.md`, `TODO.md`                                                                                                                                                                     | Tests below. The full CI command. The production build serves the wasm from `/_next/static/` as `application/wasm`             |
| 5    | each              | validator                | the engineer              | Against section 1                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Pass, or two cycles then escalate                                                                                              |
| 6    | 2, 4b             | ui-validator             | validator                 | Real browser at 320, 375, 390 and 1280, light and dark. Every row of both state tables. The fake camera for slice 4b                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Matches the page doc. Then Artur's iPhone over the runbook: the prompt, a read of a real product, the light, the installed app |
| 7    | each              | reviewer                 | ui-validator or validator | Diff and docs                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | No open critical or major finding                                                                                              |
| 8    | each              | documentation-specialist | orchestrator              | Catalog, feature and page docs, link map                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `pnpm docs:check` clean                                                                                                        |

Every agent logs its start and end in `logs.txt`.

**Tests, slice 1.** Never the live service: CI has no network to it and must not spend its budget. Time comes from an injected clock, never the real one.

- `gtin.test.ts`: right and wrong check digits for 8, 12, 13 and 14 digits, one published GS1 UPC-E example per expansion branch (last digit 0 to 2, 3, 4, 5 to 9) with its source cited, every in-store prefix of the table answering `in_store`, in-store numbers zero-padded to 14 digits ("0" plus a 13-digit "20…" and "00" plus a 12-digit "2…") answering `in_store`, 9 to 11 digits answering null, and 12 and 13-digit forms of one product giving one 14-digit form.
- `product.test.ts` on recorded bodies in `lib/openFoodFacts/__tests__/fixtures/`, each recorded once by hand with `curl -A "Hovimestari/<version>"` and credited in a README there to Open Food Facts under ODbL with its product page: a complete product with kcal (the Valio milk, 6408430000258: 39 kcal, 3.3, 3.1, 1.5), kJ only (164 kJ gives 39.20 kcal), a missing fat, numeric strings coerced, an array where a number belongs counted as missing, macros over 101.5 g, a macro over 100 g, no name in any language, a name that already holds the brand, a Finnish and an English name, both cut at 120, `no_nutrition_data`. Negative assertions: never a value of 0 for a missing one, and never the kJ figure as kcal.
- `limiter.test.ts` and `cache.test.ts` on a fake clock: the eleventh call in a minute is refused and a minute later the bucket has refilled. The 31st call of one user in an hour is refused with `barcode_lookup_limit` while another user still gets through. With the server's bucket empty a user's call is refused with `barcode_lookup_busy` and the user's bucket keeps its token. A user's bucket that has refilled to full is dropped by the next sweep, and the map's size goes back to 0. An answer is served from the cache at 9 minutes and a call goes out again after 10.
- `client.test.ts` against a local `node:http` server: the path and the `fields`, the User-Agent sent and that it holds no `@`, 404 and `status: 0` as not found, 503, 429, non-JSON, a body over 512 KB and a 6-second answer as unavailable, and an error message that holds no digit run of 8 or more.
- `barcode.db.test.ts` with an injected fetch: own food first even when a stored product has the barcode, the 12-digit and 13-digit forms match each other, another user's own food is never found, a deleted own food is never found, a stored product needs no second call (the stub counts calls), a wrong check digit and an in-store code make no call, two lookups at once store one row, incomplete and not found store nothing, a retired stored row answers `not_found` and makes no call, an Open Food Facts answer under a different code answers `not_found`, stores nothing and is cached, `PUT /foods/:id` on a stored product answers 403 `food_read_only`, and an account deletion leaves the stored product and removes the user's `food_lookups` rows.
- Visibility, in the same suite: user A looks a product up and gets `newlyVisible: true`. A's search finds it by name, and B's does not. B looks it up, makes no call, and gets `found` with `newlyVisible: true`, the same shape as A's first answer. Then B's search finds it. B's second lookup answers `newlyVisible: false`. An own food answers `newlyVisible: false`. B cannot log it before that lookup (the add answers 404 `food_not_found`). Two concurrent first lookups by A and B store one row and both answer `newlyVisible: true`.
- A request log test: a lookup's log line holds no digit run of 8 or more.

**Tests, slice 2.** `barcodeOf` for 7, 8, 14 and 15 digits, with spaces, with a letter. Barcode mode sends no `/foods/search` and shows no meal buttons, and leaving it brings the name search back. A lookup is sent once per press, never on typing. A food write while an answer shows (a star press, an own-food save) sends no second lookup. Across states: the search field and the result block's first row keep their place from typed to looking up to not found or failed, and the mode never flips while an answer lands. Each state of the table renders its copy and actions. Found opens the food view and Back shows the held row with no request. **Complete it from the label** opens the own-food sheet with the barcode, the name and only the values that are numbers. After it saves, Back shows the new food as found, with no request. **Copy to your foods** on a product with a 3.125 g macro saves without touching that field. With `newlyVisible: true` the next name search reads again, also when the answer landed after the sheet closed. A second press for a pending code sends nothing. A scan of a new code during a typed lookup: the first answer is dropped when it lands. A `found` that lands after the person opened a meal, or closed the sheet, opens no food view, and the held row shows when they come back to that code. An own-food save from **Add it from the label** turns the held answer into `found` only when the saved barcode matches. Saved with the barcode changed or cleared, the held answer stays. The credit renders both links.

**Tests, slice 4b.** As in "Testing without a phone". Across states: the search field's width and place are the same with the camera button and with the cross. Every track stops in every way out of the sheet, a late `getUserMedia` included. The headers test pins the permissions policy.

## What it costs and what to cut

- Slice 1: about a day and a half of agent work. Slice 2: about a day. Slice 3: an hour, plus Artur's half hour on the phone. Slice 4: half a day for the prototype and Artur's check, then one to two days.
- Cut already: serving sizes as portions, the per 100 ml unit, decoding in a worker, refreshing stored products, scanning several in a row.
- Cut next if time is short: the **Light** toggle, then **Copy to your foods** (0.4). Never cut: the server-side call, the two budgets, the check digit, the attribution, own foods first, per-user visibility.

## Resolved defaults (orchestrator, 2026-11-18, owner may veto)

- Stored products are shared rows, shown only to the users who looked them up. Veto cost: one line to show them to everyone.
- A retired stored product answers "not found" to a lookup. Veto cost: one branch.
- A typed number is looked up on a press or Enter, a scan at once. Veto cost: medium.
- Implausible figures are not stored and go to the own-food form. Veto cost: small.
- **Copy to your foods** on Open Food Facts foods. Veto cost: drop one button.
- Drinks per 100 ml are read as per 100 g. Veto cost: medium.
- No serving-size portions. Veto cost: small to medium.
- `POST /foods/lookup` with the barcode in the body. Veto cost: none, it keeps logs clean.
- 30 calls an hour per user, 10 a minute for the server, a 10-minute cache of answers not stored. Veto cost: three constants.
- Both budgets are checked before either is spent, and the user's limit has its own message. Veto cost: one error code.
- An Open Food Facts answer under a different code than the one asked for answers "not found". Veto cost: one branch.
- `newlyVisible` means the lookup made the product visible to this user, so another user's earlier lookup is never told apart by the answer. Veto cost: none in code, it is the honest reading.
- A shop's own barcodes and wrong check digits are never sent. Veto cost: one function.
- The User-Agent names the app and its version, nothing else. Veto cost: one env value.
- `zxing-wasm/reader`, self-hosted, loaded when the scanner opens. Veto cost: a decoder swap behind `decoder.ts`.
- mkcert and Caddy on ports 3443 and 3444 for local HTTPS. Veto cost: a different runbook, no code.
- Name order for a stored product: Finnish name, else the product's own, else English, with the first brand after a comma. Veto cost: one function.

## Review round 1, answered

- B1, owner decisions where he does not look: accepted. `TODO.md` now holds, under "Needs a decision from Artur", who sees a stored product, the FR-SCAN-05 wording, the section 5 wording, the User-Agent contact, drinks per 100 ml, and the licence item reworded with what the design does. Section h names them.
- B2, shared rows with no takedown: accepted as the orchestrator decided. Storage is shared, visibility is per user through `food_lookups` and `visibleTo`. A copy per user was weighed and rejected in section 0 (three workarounds and a requirement change). Takedown is `retired_at`, and a lookup answers `not_found` for a retired row. `created_at` stands in for a fetch time.
- B3, a write as a cached GET: accepted. `POST /foods/lookup` with the barcode in the body, a mutation through `useBarcodeLookup`, the answer held in the sheet's state, a test that a food write sends no second lookup, and a local turn to `found` after **Add it from the label** saves.
- B4, budgets and check digits: accepted. A per-user bucket of 30 an hour before the server's 10 a minute, both counting only real calls. `gtinOf` checks the GS1 digit, expands UPC-E, and refuses in-store numbers (8 digits starting 0 or 2, 12 starting 2 or 4, 13 starting 20 to 29, 02 or 04) with a new `in_store` answer. Cache keyed on the 14-digit form. The shared Fly egress address is named under risks. One point is noted rather than disputed: the 8-digit prefix ranges are to be checked against the GS1 text before coding, since I could not verify them.
- B5, prefills the form refuses: accepted. A prefilled value left untouched reads as its number, then takes the usual checks. The name is always checked. The incomplete name goes through the same builder. There is a test for 3.125 g.
- B6, stream leaks and inline video: accepted. Session numbers stop a late stream and drop a late decode. `playsInline`, `muted` and `autoPlay` are set. Two tests added.
- B7, `found` and newly stored: accepted. A boolean flag, defined and renamed `newlyVisible` in the delta review (D1).
- B8, parsing the body: accepted. A Zod schema with coercion, a 512 KB cap, error messages without the code or the URL, `name_en` cut at 120, `macroSumWithinLimit` exported and reused, and one `BarcodeSchema` that the own-food body uses too.
- B9, the bundler: accepted. Turbopack in both, the `application/wasm` check, and on the fallback the `sw.js` path with `CACHE_VERSION` bumped.
- B10, headers: accepted. `Permissions-Policy: camera=(self), microphone=(), geolocation=()` in slice 4b, pinned in the headers test, and a note that a future `script-src` needs `'wasm-unsafe-eval'`.
- B11, the runbook: accepted. Slice 3's engineer writes it, step 7 checks `isSecureContext` and sign-in, and it covers Google sign-in, a new address, the production build with `LOCAL_PRODUCTION_RELAY=1`, `en1` and `header_up X-Real-IP`.
- B12, scanner states and focus: accepted. Focus after a read goes to the result block, focus in the scanner starts on **Type the number**, the decoder loads under "Starting the camera…", and slice 4 starts with a prototype on Artur's phone, with what it must prove.
- B13, tests: accepted. Across-state checks in slice 2, an injected clock and factories in slice 1 with refill and expiry tests, and the node environment with `wasmBinary` for the decoder.
- B14, file lists and collisions: accepted. Slice 2 lists the `components/recipes/` caller, the collision list matches week-and-copy's real files, `useBarcodeLookup` keeps `FoodSheet.tsx` under 500 lines, 0006 is unconditional and generated by `drizzle-kit`.
- B15, the assistant tool: answered in "The lookup service": a reading key may call it, under the same per-user budget, decided in the connected AI design.
- B16, `Retry-After`: noted in section d. The web does not read it.
- B17, drinks: the `TODO.md` item says it is Artur's call and why.

## Delta review, answered

- D1, `kept` gave away another user's lookup: accepted. The flag is `newlyVisible`, read from the `food_lookups` upsert's `xmax = 0` as `writes/targets.ts:41` does, and `afterFoodNewlyVisible` invalidates searches on it, which also fixes B's stale search. A product someone else stored answers in the same shape as a first fetch. The timing side channel is named under risks with what it reveals, to whom, and why it stays open. The `TODO.md` item no longer claims nobody can tell.
- D2, the unstated invariant: accepted. `food_lookups` rows go only by their two cascades, written into "The lookup service" and the features doc's Data section. The read-back runs after the insert has committed, at READ COMMITTED, and two concurrent first lookups are spelled out under "Storing a product".
- D3, in-store prefixes, UPC-E and the stored code: accepted. `gtinOf` builds the 14-digit form first and reads the shop's own numbers on it. UPC-E is tested against published GS1 examples, one per branch. The stored barcode is the requested code's 13-digit form, and an answer under a different code answers `not_found`, because a shared row that is never refreshed must not hold another product's figures.
- D4, the held answer: accepted. A press while pending, a late `found` after the person moved on, the invalidation in the hook-level `onSuccess`, and the turn to `found` only on a matching barcode are rules in section e and named slice 2 tests.
- D5, the per-user budget: accepted. Both buckets are checked before either is taken, in one synchronous step. The per-user map drops full buckets on a sweep. A restart resetting both buckets and the cache is under risks. The user's limit has its own code, `barcode_lookup_limit`, with a line that promises no time.
