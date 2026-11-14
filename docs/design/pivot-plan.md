# Pivot plan

The agents' working plan for turning the earlier Hovimestari into the app `docs/overview.md` and `docs/requirements.md` describe. This file is the architect's starting point. It is not a design doc: each step below still gets its own design doc from `docs/design/_design-doc-template.md`.

Written 2026-11-10 from the pivot conversation with Artur. Update it as steps land. Delete it when the MVP is complete.

## What changed and why

The earlier app was a local-first, no-account weekly meal planner for one household, with LLM-assisted recipe import. It stopped earning its keep when Artur moved five days a week onto a meal delivery service (Calori) and started a body recomposition. What he needs now is macro-aware planning and logging for the remaining meals.

Decisions Artur made in that conversation, in his words where it matters:

- **Closing the gap is the product.** "Closing the gap can mean however from 0, or from fixed meals." Calori is not an integration. It is the current source of fixed meals, entered by the user.
- **The user brings the targets.** A daily kcal range and a protein range with the lower bound as the floor. "The app is not for the helpless, but people knowing what they need." No defaults, no calculators. "We're not a nutritionist."
- **No budget, no prices.** He finds the "around budget" premise of the reference app (Mise) sketchy.
- **Deterministic macros.** Figures are computed from a food database (Fineli open data first), never produced by a model.
- **Store availability is a non-issue for now.** No live store data. Keep the earlier app's S-kaupat search linking and manual tick-off. K-Ruoka and Lidl linking later.
- **BYOAI the finanssi way.** The app has no AI of its own. It exposes an MCP server, and the user connects their own assistant with a scoped key. "I don't think we need any in-app chats. I'd avoid that as much as possible." The earlier in-app inference features (recipe from photo, recipe from text) go away: the user hands the photo to their own assistant.
- **A calorie counter when needed.** Quick logging of a single food, with barcode scanning, because "not all rahka are the same, and amounts differ".
- **Hosted, with login.** Same auth, backend and hosting approach as `finanssiappisV2`, "whatever gets us moving faster".
- **PWA first.** A store app wrapper only once the app is more or less feature complete, and no dedicated desktop variant.
- **Targets over MCP.** A connected assistant may change the user's targets. The app still gives no advice: the assistant is the user's own.
- **This workflow kit.** The agent pipeline, docs system and playbook come from `my-agentic-workflow`.

Mise (the reference app) screens that informed the information architecture: a plan tab with day cards, a recipe detail with macros per serving and an ingredients and instructions toggle, a grocery list grouped by aisle with "needed" amounts, an edit-plan mode with move and double up, and a preferences page. Take the layout ideas. Do not take the budget, the generated content or the visual style.

## Settled on 2026-11-10

Artur answered these after reading the first summary of the drafts:

- Accounts are personal. No shared household.
- An entry has no planned or eaten state. A future date is a plan, a past date is a log. "Let's keep it simple."
- A connected assistant may change targets.
- A connected assistant may delete recipes, saved meals and the user's own foods, but only with the user's approval. Artur: "Lesson learned from finanssi.app - let it do it, but requiring approval from user." Finanssi keeps deletion out of an assistant's reach altogether, and that turned out too strict.
- UI copy is English.
- The earlier app's visual identity carries over, for now.
- Artur read the overview and the requirements on 2026-11-14 and signed both off. Wording can be ironed out during development. From here the usual rule holds: agents do not edit either without his permission.
- Targets cover calories and protein now. Later, carbohydrates and fat get optional ranges too, and the user chooses what to track: calories only, calories with every macro, or part of it. Design the targets model in step 2 so that adding a macro is a new row or column, not a rewrite.
- The build order is the orchestrator's call. Recipes come before barcode scanning, because recipes unlock the gap and the plan, and step 3 already covers logging a food by search.

## Assumptions the drafts still make

Each is an open question in `TODO.md`. Do not treat them as settled.

- The grocery list buys for planned servings, adjustable per recipe on the list.

## Build order

Each step is one or more PRs through the full pipeline. A step is usable on its own. Every step from 3 on ships its MCP tools with it (NFR-AI-03).

1. **Scaffold and auth.** Replace the earlier app with `apps/backend` (Express, Drizzle), `apps/web` (Next.js) and `packages/types`. Lift auth from finanssi. Turborepo, Jest, ESLint, the message catalog, the mobile shell and bottom sheet, the PWA manifest and service worker, CI with a Postgres service, Fly and Vercel runbooks. Done when a person can sign up, sign in and see an empty signed-in shell on a deployed URL. The earlier app's code is removed in this step, after the salvage list below is carried over or parked in `docs/design/`.
2. **Targets and foods.** Targets with dated changes and the first-run gate (FR-TGT). The Fineli import and food search, own foods, portions, favourites (FR-FOOD).
3. **Days and quick logging.** Entries, totals, the gauge, the week view, the quick-log flow, saved meals (FR-DAY, FR-LOG, FR-MEAL). **This is the first version Artur can use daily**, as a calorie counter next to Calori.
4. **Connected AI.** Lift the MCP module from finanssi. Keys, the settings section, read tools and write tools for everything built so far, the change record, the app rules (FR-AI). From here Artur's own assistant can bulk-enter Calori meals.
5. **Recipes.** The editor with food-linked ingredients, computed figures, scaling, tags, cover image (FR-REC), with their MCP tools. From here an assistant can turn a recipe photo into a recipe.
6. **Barcode scanning.** Camera scan, Open Food Facts lookup, label entry (FR-SCAN).
7. **The gap.** Gap figures and ranked suggestions (FR-GAP).
8. **Grocery list.** From planned recipes, with the salvaged merge and S-kaupat linking (FR-GROC).

## What to lift from finanssiappisV2

The repository is `AVeselovski/finanssiappisV2`. A session needs it attached to read it. Lift means copy and adapt, keeping the tests. Its "vault" becomes the user here, because Hovimestari has no shared space.

Read `docs/design/mobile-ui-lessons.md` in this repository before anything in the web app. It distils finanssi's mobile lessons and says which UI pieces to lift, adapt or replace.

Read these first. They describe the behaviour better than the code does:

- `docs/features/authentication.md` and `docs/features/connected-ai.md`
- `docs/design/bring-your-own-ai.md`, `docs/design/issue-282-byoai-slice-1.md`, `docs/design/issue-300-byoai-slice-2.md`
- `docs/app/mobile-responsive-shell.md`
- `apps/backend/README.md` and `apps/web/README.md`
- `infra/README.md` and `infra/runbooks/`

Backend, under `apps/backend/`:

- Auth: `src/routes/auth.ts`, `src/lib/jwt.ts`, `src/lib/passport.ts`, `src/lib/oauthStateCookie.ts`, `src/lib/email.ts`, `src/middleware/authenticate.ts`, `src/middleware/authRateLimits.ts`, and the schemas `src/db/schema/users.ts`, `refresh-tokens.ts`, `password-reset-tokens.ts`.
- App skeleton: `src/app.ts`, `src/index.ts`, `src/lib/env.ts`, `src/lib/errors.ts`, `src/lib/failureOf.ts`, `src/lib/pgErrors.ts`, `src/middleware/error.ts`, `src/middleware/requestLog.ts`, `src/middleware/uuidParam.ts`, `drizzle.config.ts`, `jest.config.ts`, `Dockerfile`, `fly.toml`.
- Connected AI: all of `src/mcp/` (`router.ts`, `auth.ts`, `server.ts`, `result.ts`, `writeBrake.ts`, `appRules.ts`, `tools/`, and the tests, which include the import-boundary test and the app-rules stamp test), `src/lib/accessTokens.ts`, `src/routes/accessTokens.ts`, `src/routes/accessEvents.ts`, `src/db/schema/vault-access-tokens.ts`, `vault-access-events.ts`, `src/services/reads/context.ts`, `src/services/writes/context.ts`, `src/services/writes/events.ts`, and `src/scripts/mcpSmoke/` (the parity check CI runs against a seeded database).
- The pattern to keep: REST routes and MCP tools both call `src/services/reads/` and `src/services/writes/`. A tool computes nothing.

Web, under `apps/web/`:

- Auth: `src/app/auth/`, `src/app/api/auth/` (the three route handlers that own the refresh cookie), `src/contexts/AuthContext.tsx`, `src/components/AuthGuard.tsx`, `GuestGuard.tsx`, `GoogleSignInButton.tsx`, `src/lib/api.ts`, `src/lib/errors.ts`.
- Data layer: `src/components/QueryProvider.tsx`, `src/lib/queryClient.ts`, `queryKeys.ts`, `queryOptions.ts`, `invalidation.ts`.
- Shell: `src/components/ui/BottomSheet.tsx` and the other primitives in `src/components/ui/`, `src/hooks/useIsMobile.ts`, `useMediaQuery.ts`, `useMainScrollLock.ts`, `src/contexts/ThemeContext.tsx`, `src/lib/theme`.
- Connected AI settings: `ConnectedAiSection.tsx`, `CreateConnectionSheet.tsx`, `ConnectionActivitySheet.tsx` under `src/app/(app)/vaults/[vaultId]/settings/_components/`, with `src/lib/accessTokensApi.ts` and `src/lib/mcpConnection.ts`.
- Copy: `src/i18n/`, `messages/en.json` structure, the catalog tests and the lint rule in `eslint.config.js`.

Do not lift: anything about vaults and members, invitations, Drive, tax, budgets or transactions.

Finanssi does not have a PWA manifest or service worker. Those come from the earlier Hovimestari (below).

## What to salvage from the earlier app

From the audit of 2026-10-30. Line counts are approximate.

- **`apps/web/src/lib/shoppingList.ts` and its 32 tests.** The merge and aisle-ordering logic. It takes the whole old `State` object, so it needs a narrower input. Merging moves from `category::name` to the food id.
- **`apps/web/src/lib/skaupat.ts` and `useShoppingListUrls.ts`.** S-kaupat search links and saved list links.
- **`apps/web/src/lib/amount.ts` and its tests.** Amount parsing and recipe scaling.
- **`apps/web/public/manifest.webmanifest`, `sw.js`, the icons and `fonts/`.** The PWA shell and the self-hosted typefaces.
- **`apps/api/src/routes/images.ts` and `apps/web/src/lib/imagePreprocess.ts`.** Cover image validation (JPEG only, size cap, header check) and client-side downscaling. Storage and per-user access control are new.
- **Recipe editor and detail UI.** `RecipeEditor`, `RecipeDetail` and the list tab are reference for interaction details Artur already likes, not code to port as is.
- **The canonicalisation rules in the LLM prompts** under `apps/api/src/llm/tasks/`. Strip brand prefixes, merge "X tai Y" rows, collapse duplicate ingredients. The prompts are not carried over, because the app runs no inference. The rules are worth restating in the MCP app rules, so a connected assistant importing a recipe follows them.
- **The design language** in `docs/design/legacy-brief.md`.

Not carried over: the LLM provider and router layer, the single JSONB state row and `/state` routes, `useStateStore`, staple groups, the shuffle, the compose stack as a deployment, and the seed recipes. The seed recipes have no gram weights or food links, so they cannot be imported as they are.

## Known risks to settle in design

- **Fineli specifics are unverified.** `fineli.fi` sat behind a bot challenge during research. The licence (reported as CC BY 4.0), the current release, the download location and the table layout come from community repositories (`mafredri/fineli-sql`, `ArttuOll/FinerEli`), not from THL. Confirm on the source before designing the import. Also confirm that the release carries portion sizes and that energy needs converting from kilojoules.
- **Open Food Facts licence.** Its database is under ODbL. Keeping looked-up products in the catalogue may make part of the catalogue a derived database. Read the terms and decide how products are stored and credited before step 6. Its API also asks for an identifying User-Agent and has rate limits.
- **Barcode scanning in an installed PWA on iOS.** Safari has no built-in barcode detector, so scanning needs a library that decodes camera frames. Camera access inside an installed PWA has had platform bugs. Prototype on Artur's own phone before committing to a design.
- **Raw and cooked weights.** Fineli lists raw and cooked forms of many foods. A recipe weighs ingredients raw and a plate is weighed cooked. The design for recipes must say which the user is asked for and make the choice visible.
- **Food search quality.** Fineli names are formal ("Rahka, maustamaton, rasvaton"). Search has to rank the everyday match first. Trigram or full-text search in Postgres is likely enough.
- **Next.js version.** Finanssi runs Next 15 while the `developing-nextjs` skill describes Next 16. Pick the version at scaffold time and correct the skill if needed.
- **How a deletion is approved.** FR-AI-17 says nothing is deleted on an assistant's request until the user approves. Two mechanisms fit. The app can hold the request as pending and show it to the user, who approves or declines in the app. Or the assistant can be told to ask in its own conversation and wait for a yes, as finanssi's server instructions do for every write. Only the first is something the app can enforce, because the app cannot see the assistant's conversation. The Connected AI design doc picks one and puts the choice among the resolved defaults Artur may veto. Removing an entry from a day needs no approval.
- **Image storage on Fly.** Decide between a volume and object storage before step 5.
