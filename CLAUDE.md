# Hovimestari

A local-first household butler. Phase one is a weekly meal-planner and shopping-list generator for ordering groceries from S-Kaupat. Future phases extend the butler metaphor — Telegram interface, AI-assisted recipe import, eventually whatever else a small household wants automated.

This document is the project brief. It captures architectural decisions, the user model, the phased roadmap, and design language so any fresh Claude Code session has full context.

## The household

Two adults, Finland (Helsinki). One developer (the primary builder), one partner. Weekly grocery delivery via S-Kaupat lands every **Thursday**.

**Meal habits:**

- Developer skips breakfast. First meal is lunch.
- Partner eats breakfast — Greek yogurt with banana, sometimes fried eggs with ruisleipä.
- Either may work from home 0–2 days a week, so weekday lunch demand fluctuates. The pragmatic answer: cook dinners that double as next-day lunches (4 servings = 2 dinner + 2 lunch).
- Friday and Saturday evenings usually eating out — no dinner planned by default, but toggle-able for "we're staying in this week" with a special-occasion recipe and wine.
- Saturday and Sunday: slow brunch. Eggs, bacon or raakamakkara, croissants or bagels, pensasmustikka.
- Optional small after-work snack on weekdays — not planned for explicitly.

**Cooking philosophy:** Not afraid to cook, but allergic to decision fatigue and complex setups. Prioritize quick recipes. Two dinners per week is the default; both should produce leftovers.

## Architecture

**Local-first, single-household, no auth.** The two users share a fridge and a Wi-Fi network; the trust model matches reality. This eliminates the entire auth/user-management problem space.

**Container-based deployment.** A `compose.yaml` runs the stack: API + web UI + (eventually) Telegram bot worker. Initially runs on whichever workstation is most often on; the endgame is a **Mac mini** as an always-on home server.

**Access:**

- Phase 1: LAN-only. Both phones and laptops on the same home network reach the UI by IP or `.local` hostname.
- Phase 2: Tailscale on phones + the Mac mini for remote access without exposing the service publicly. No public domain needed initially; can add Caddy + DNS-01 cert later if PWA/notifications require HTTPS.

**No cloud dependencies for the core path.** Anthropic API is used for AI features when needed, but the system functions fully without it (local LM Studio fallback, or AI features simply unavailable). Database, UI, and core logic all live locally.

## Tech stack

Choices made for boring-and-durable over novel, with a side of "transfers to other projects I work on."

- **Language:** TypeScript end-to-end. Shared types across API and web via a `packages/shared` package.
- **API:** [Fastify](https://fastify.dev). Chosen for synergy with a work project also using it — learning compounds. Excellent TypeScript story, schema-first validation pairs naturally with shared Zod schemas, mature plugin ecosystem.
- **Database:** **Postgres 16** in a container. The state schema starts as a single row holding a JSONB blob mirroring the artifact's shape; we add proper tables only when a feature actually needs them. Chosen over SQLite because the project is likely to grow past phase 3 (recipe search, cook-history analytics, ingredient queries), and starting on Postgres avoids a future migration. Operational cost on a Mac mini is negligible — one more container, 30–50 MB idle RAM. Migrations via [node-pg-migrate](https://github.com/salsita/node-pg-migrate) or Drizzle (decide during scaffolding).
- **Web UI:** Vite + React + Tailwind, ported from the existing artifact. Built as a static bundle, served by the API container or a separate nginx container.
- **PWA:** Manifest + service worker so both phones can install to the home screen and have offline read access.
- **AI integration:** An `LLMProvider` interface (see below). Anthropic SDK and an OpenAI-compatible client for LM Studio are the two day-one implementations.
- **Telegram (Phase 2):** [grammY](https://grammy.dev) running in a Node worker container, talking to the same API as the web UI.
- **Reverse proxy:** Caddy in front of everything once HTTPS becomes useful.

**Rejected, explicitly:** Next.js (overkill, server-rendering not needed), Hono (interesting but no transfer value to other projects), Express (showing its age, no native async, no built-in validation), SQLite (tempting for the zero-ops single-file aspect, but the project is likely to grow into features that genuinely want SQL — better to skip a future migration), Prisma (heavy for our shape; revisit if/when schema normalizes hard), tRPC (Fastify + Zod schemas + a thin fetch wrapper is enough), Firebase/Supabase (we own the data).

## Repository layout

```
hovimestari/
├── apps/
│   ├── web/                 # Vite + React UI
│   │   ├── src/
│   │   │   ├── components/
│   │   │   ├── lib/
│   │   │   └── App.tsx
│   │   └── package.json
│   ├── api/                 # Fastify REST API
│   │   ├── src/
│   │   │   ├── routes/
│   │   │   ├── db/          # Postgres access layer + migrations
│   │   │   ├── llm/         # LLMProvider + implementations
│   │   │   └── index.ts
│   │   └── package.json
│   └── bot/                 # Telegram bot (Phase 2)
├── packages/
│   └── shared/              # Zod schemas, shared types
├── infra/
│   ├── compose.yaml
│   ├── Caddyfile            # (later)
│   └── postgres-data/       # named Docker volume mount, gitignored
├── .env.example
├── package.json             # pnpm workspaces
├── CLAUDE.md                # this file
└── README.md
```

Package manager: **pnpm** with workspaces.

## Data model

**Phase 1 — single JSONB blob in Postgres.** The whole household state lives in one row:

```sql
CREATE TABLE household_state (
  id          INT PRIMARY KEY DEFAULT 1,
  state       JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT singleton CHECK (id = 1)
);
```

JSONB gives us proper indexing and operators (`->`, `->>`, `@>`, `jsonb_path_query`) for the day we want to query into the blob without normalizing yet.

The shape of `state`:

```typescript
type State = {
  recipes: Recipe[];
  stapleGroups: StapleGroup[];
  staples: Staple[];
  plan: Plan;
};

type Recipe = {
  id: string;
  name: string;
  time: number;                   // minutes
  servings: number;
  category: 'common' | 'special'; // everyday vs special-occasion
  keepsOvernight?: boolean;       // optional warning hint
  ingredients: Ingredient[];
  lastUsed?: string;              // ISO date, for shuffle rotation
};

type Ingredient = {
  name: string;
  amount: string;
  unit: string;
  category: AisleCategory;        // produce, bakery, meat-fish, etc.
};

type StapleGroup = {
  id: string;                     // 'weekly', 'brunch', 'inlaws', ...
  name: string;                   // 'Viikkovakiot', 'Brunssi', ... (display, Finnish)
  enabled: boolean;               // include this group this week?
  order: number;                  // display ordering
};

type Staple = {
  id: string;
  groupId: string;
  name: string;
  amount: string;
  unit: string;
  category: AisleCategory;
  enabled: boolean;             // individual override within group
};

type Plan = {
  selectedRecipeIds: string[];  // mix of common + special freely
};
```

**Phase 2+ — normalize when needed.** When recipe search, cook history charts, or per-ingredient analytics become real features, extract `recipes`, `ingredients`, and `cook_log` into proper tables. Until then, JSONB with Postgres's JSON operators as an escape hatch is plenty.

**Backups:** `pg_dump` cron job nightly to a Time Machine'd or Dropbox-synced folder. Three independent copies (live DB + local snapshot + cloud sync) is appropriate paranoia. A simple compose service running `postgres:16` with a named volume + a small `pg_dump` sidecar (or a cron on the host) does the job.

### Deferred — separate cooking name and shopping name on Ingredient

Some Finnish ingredient terms are precise cooking units that don't map to any S-Kaupat SKU: `valkosipulinkynsi` (clove of garlic — you buy the whole bulb), `inkivääripala` (piece of ginger — you buy the root), `sitruunan kuori` (lemon zest — you buy the lemon). Renaming the ingredient to the purchasable form loses recipe clarity ("hienonna valkosipulinkynnet" no longer matches "valkosipuli 1 kpl" in the ingredient list); leaving it as-is means the shopping-list search returns nothing.

The structural fix is to stop sharing the field. Add optional `shoppingName?: string` (and probably `shoppingAmount?: string` / `shoppingUnit?: string`) overrides on `Ingredient`. Recipe view keeps the cooking term, shopping list uses the override when set with `name`/`amount`/`unit` as the fallback. The recipe-from-image LLM can pre-fill the overrides for a small known allowlist of these patterns; user can edit either side in the recipe editor.

Deferred because the workaround — manually replacing the ingredient at import-preview time with the purchasable form — is acceptable until this bites in real use multiple times. Revive once we've used the app for a while and have a feel for how common the long tail is. When that day comes:

- Schema lives next to the existing optional Ingredient fields (the same place the unit / amount additions would have to go anyway).
- Shopping-list builders fall back to `name`/`amount`/`unit` when the override is absent, so existing data needs no migration.
- LLM canonicalization rule joins the existing brand-strip and `X tai Y` merge rules — same prompt section, same retry-with-Anthropic path on low confidence.

## AI layer

The single most important architectural decision: **the model is swappable**. Everything that calls a model goes through an interface:

```typescript
interface LLMProvider {
  name: string;
  chat(messages: ChatMessage[], opts?: ChatOpts): Promise<ChatResponse>;
  vision?(image: Buffer, prompt: string): Promise<ChatResponse>;
  // tools support optional; structured outputs via Zod schema
}
```

Two implementations at day one:

- `AnthropicProvider` — calls the Claude API. Used for harder tasks: vision, conversational refinement, anything where quality matters.
- `LMStudioProvider` — calls a local LM Studio server's OpenAI-compatible endpoint. Used for fast/cheap tasks and offline fallback.

**Routing strategy** — a `Router` decides which provider to use per task:

| Task                                            | Default       | Why                                       |
| ----------------------------------------------- | ------------- | ----------------------------------------- |
| Parse a typed recipe (Finnish text → structured) | Local         | Cheap, fast, models handle this fine      |
| Parse a recipe from a photo                     | Anthropic     | Vision quality matters, photos vary wildly|
| Parse a voice note                              | Local Whisper + local LLM | Cost adds up if frequent          |
| Categorize ingredients to aisle                 | Local         | Repetitive, well-defined                  |
| Conversational butler interaction               | Local first, fall back to Anthropic on low-confidence or tool-use failures | Most chat is mundane; complexity is rare |
| "Plan my week with these constraints" reasoning | Anthropic     | Multi-step reasoning still favors the bigger model |

The router exposes per-task overrides via env var (`HOVI_FORCE_PROVIDER=anthropic` for debugging). Each provider call logs token usage so we can see cost over time.

Add a confidence signal where possible — for structured outputs, if the local model returns invalid JSON or low-confidence categorization, the router automatically retries on Anthropic. This is the "infer when to use which" goal.

### Deferred — two-step pipeline (local-vision path)

Real-world testing of Phase 2b found that Haiku and Qwen-VL 9B fail on tricky vision inputs the same way: brand prefixes retained, "X tai Y"-joined rows not merged, occasional hallucinated ingredient. Sonnet handles the same image cleanly. The cause is capacity, not prompting — smaller VLMs have less attention budget to integrate canonicalization rules while also doing pixel-level OCR. The shipped fix was to default the vision path to Sonnet via `ANTHROPIC_VISION_MODEL`.

A **two-step pipeline** addresses the same problem without needing a bigger model:

1. **Vision call** — extract layout-preserving raw text from the image. Single objective: OCR.
2. **Text call** — apply canonicalization rules (strip brands, merge `X tai Y`, emit recipe JSON) using a stronger *text-only* model.

This is the **local-vision path**: Qwen-VL 9B for OCR, Qwen 3.5 9B (already validated on the text canonicalization path) for parsing. The bet: two capable-enough local models in series beat one larger one, fully offline.

Deferred because the single-call Anthropic path with Sonnet works today, and the two-step adds a new task type, an intermediate result, and a second router pass — real surface-area for a problem we don't have on the Anthropic path. Revive when local-first vision becomes a priority (wanting recipe imports to work fully offline, or Anthropic vision cost starts to sting). Rough sketch when that day comes:

- New task, e.g. `recipe-from-image-twostep`, opted into via `HOVI_TWOSTEP_VISION=1` or routed automatically when `HOVI_FORCE_PROVIDER=local` and the local vision model is known-weak.
- Step 1's raw text is passed through the router a second time for canonicalization + JSON, hitting the existing text providers.
- Keep the single-call Anthropic path as the default — it works, and the two-step would be ~2x round-trips for no quality gain there.

## Phased roadmap

### Phase 0 — Scaffold (one evening)

- pnpm monorepo
- `compose.yaml` with Postgres + API + Web (Postgres on a named volume)
- API: `GET /state`, `PUT /state` (whole-blob, optimistic-locking via `updated_at`)
- Web: stub React app that fetches and renders something from the state
- Both phones can load it over LAN

### Phase 1 — Port the artifact (one weekend)

- Port the React UI to the `apps/web` Vite project
- Replace all `window.storage.get/set(STORAGE_KEY)` calls with `fetch('/api/state')`
- Optimistic UI updates with debounced PUTs
- Seed the database with the recipes + staple groups + staples below
- PWA manifest + minimal service worker (cache shell, network-first for /api)
- **Done = both of you can use it daily over Wi-Fi, parity with the artifact + the new groups/categories model**

### Phase 2 — AI recipe import (one weekend)

- `POST /recipes/from-image` — accepts a photo, returns a draft `Recipe` for preview
- `POST /recipes/from-text` — paste a recipe URL or text blob
- `POST /recipes/from-audio` — voice note → transcribed → parsed
- UI: a "+" button on the Reseptit tab that opens a sheet with three input modes
- Preview UI shows the parsed recipe with edit fields before saving (including the common/special category)
- `LLMProvider` interface and both implementations
- Router with the table above

### Phase 3 — Telegram bot

- `apps/bot` container, grammY-based
- Hardcoded allowlist of two Telegram user IDs in env
- "Tool-using" architecture: every incoming message goes to the LLM with the household state and a set of tools (`list_recipes`, `shuffle`, `add_staple`, `toggle_staple_group`, `mark_week_complete`, `save_recipe_from_image`, etc.). The bot is mostly glue.
- Both web UI and bot hit the same API endpoints — single source of truth
- Notifications: Wednesday-evening "ready to plan?" nudge

### Phase 4 — Whatever comes next

Calendar integration, weather-aware planning ("cold this week → soup heavy"), pantry tracking via barcode scan, energy bill scraping, the actual butler stuff. Out of scope for now; the architecture supports it.

## Design language

The artifact's visual identity is intentional and should carry forward. Don't redesign — port.

**Mood:** Nordic kitchen counter. Warm paper background, dark forest-green ink, oxblood-red accent. Serif display face with subtle character contrasted against a clean grotesque body face.

**Palette (CSS variables):**

```css
--paper:   #f6efe1;
--paper-2: #efe6d2;
--ink:     #1d2e22;
--berry:   #a13838;
--muted:   #7a6e58;
--rule:    #d8c9aa;
```

**Typography:**

- Display: **Fraunces** (variable, optical sizing)
- Body: **Instrument Sans**
- Mono (shopping list): **JetBrains Mono**

**Layout principles:**

- Mobile-first; the primary user surface is a phone at Wednesday-evening sofa-time
- Bottom tab bar: Suunnitelma · Reseptit · Vakiot · Lista
- Dashed rule under the header echoes a receipt
- Small-caps tracked uppercase for section labels (`letter-spacing: 0.2em`)
- All UI copy in Finnish

**Don't:**

- Add gradients, glassmorphism, shadows beyond functional ones
- Switch to a generic UI library aesthetic (shadcn defaults, Material, etc.) — use the components as scaffolding but restyle to the palette
- Localize away from Finnish — that's part of the identity

## UI behavior

### Suunnitelma tab

- Hero shows count of currently-selected recipes
- Two shuffle buttons side by side: **Arvo 2** and **Arvo 3**. Both call the same shuffle with different `n`. No hidden settings, no slider, no "advanced." If you ever want four, talk to the bot.
- "Valitut" list of currently-picked recipes with a remove button each
- "Vakiopaketit" section with a toggle per staple group (Viikkovakiot, Brunssi, anything user-created)
- Recipe grid split into two sections (Finnish labels in UI, English values in code):
  - **Reseptit: Arki** (`category === 'common'`) — the everyday pool, what `Arvo` picks from
  - **Reseptit: Erikois** (`category === 'special'`) — special-occasion recipes, never auto-shuffled, picked manually for staying-in weekends

### Reseptit tab

- All recipes, grouped by category (Arki / Erikois in the UI; `common` / `special` in code)
- Each recipe shows name, time, servings, ingredient count
- Edit and delete per recipe
- "Uusi" button → recipe editor (in Phase 2, also accepts photo/voice/url)
- Editor includes: name, time, servings, category (Arki/Erikois), optional `keepsOvernight` hint, ingredients with per-ingredient aisle category

### Vakiot tab

- Sectioned by staple group
- Each group has: name, enabled toggle, items list, "+ Lisää tuote" button, "+ Uusi ryhmä" at the top of the tab
- Each staple can be individually enabled/disabled within a group (useful when you still have half a thing in the fridge)
- Groups can be created, renamed, reordered, deleted

### Lista tab

- Computed from current plan + enabled staples in enabled groups
- Grouped by aisle in S-Kaupat shopping order (produce → bakery → meat-fish → dairy → frozen → pantry → drinks → other)
- Sorted alphabetically within each aisle (Finnish locale)
- Tap-to-check (ephemeral, visual only)
- "Kopioi" — copies list to clipboard for pasting into S-Kaupat search
- "Viikko valmis — nollaa" — stamps `lastUsed` on cooked recipes, clears the plan

## Shopping list generation

1. For each enabled `StapleGroup`, take its enabled staples
2. For each `selectedRecipeId`, add all its ingredients
3. Merge by `(category, normalized_name)` — when a key collides, concatenate amounts as `"X + Y"` (don't try to do unit math; "2 + 1 kpl" is readable)
4. Group by aisle category
5. Sort within each group alphabetically (Finnish locale)

## Shuffle algorithm

When the user taps **Arvo 2** or **Arvo 3**:

1. Filter recipes to `category === 'common'`
2. Sort by `lastUsed` ascending (null/never-cooked first)
3. Take the oldest `max(5, n * 2)` as candidates
4. Randomly pick `n` from those candidates

Result: cycles through the library, prefers under-used recipes, but has enough randomness to feel non-deterministic. Special recipes are never shuffled — they're selected manually for a weekend-in.

## Seed data

### Staple groups

1. **Viikkovakiot** — enabled by default, the always-there things
2. **Brunssi** — enabled by default but trivially toggleable for "no brunch this weekend" or "in-laws coming, doing dinner instead"

Users add more groups as life demands (e.g. "Vieraat", "Grillaus", "Joulu").

### Staples — Viikkovakiot group

- Ruisleipä (1 pkt, bakery) — enabled
- Kreikkalainen jogurtti (1 iso prk, dairy) — enabled
- Banaani (6 kpl, produce) — enabled
- Munat (10 kpl, dairy) — enabled
- Voi (1 pkt, dairy) — enabled
- Maito (1 l, dairy) — enabled
- Kahvi (1 pss, pantry) — disabled by default

### Staples — Brunssi group

- Pekoni (1 pkt, meat-fish)
- Raakamakkara (1 pkt, meat-fish)
- Croissantit (4 kpl, bakery)
- Pensasmustikka (1 rasia, produce)
- Munat lisää brunssiin (6 kpl, dairy)

### Recipes — common (everyday, lunch-doubling candidates)

UI label: "Reseptit: Arki". All 4 servings, 15–35 min:

1. **Lohikeitto** (25 min) — lohifilee 400g, perunaa 4kpl, porkkana 2kpl, sipuli 1, purjo ½, tilli 1 nippu, ruokakerma 2dl, kalaliemikuutio 1. `keepsOvernight: true` (improves overnight, but soup → mark separately if user prefers not to pack)
2. **Jauheliha-tomaattipasta** (20 min) — naudan jauheliha 400g, pasta 400g, tomaattimurska 1tlk, sipuli 1, valkosipuli 2 kynttä, parmesan, oregano. `keepsOvernight: true`
3. **Broileri-kookoscurry** (25 min) — broilerin fileesuikale 400g, kookosmaito 1tlk, punainen currytahna 1prk, paprika 1, sipuli 1, basmatiriisi 3dl, limetti 1. `keepsOvernight: true`
4. **Uunilohi & juurekset** (35 min) — lohifilee 500g, bataatti 2, porkkana 3, punasipuli 1, sitruuna 1, tilli 1 nippu. `keepsOvernight: true`
5. **Tonnikalapasta** (15 min) — pasta 400g, tonnikala vedessä 2tlk, tomaattimurska 1tlk, kapris 1prk, valkosipuli 2 kynttä, persilja. `keepsOvernight: true`
6. **Kanapyttipannu** (25 min) — broilerin fileesuikale 400g, perunaa 6, sipuli 1, paprika 1, munat 4 (paistettaviksi päälle), punajuuri säilyke 1prk. `keepsOvernight: true` (minus the fried egg, which is per-serving)
7. **Aasialainen nuudelipannu** (20 min) — munanuudelit 250g, broilerin fileesuikale 300g, parsakaali 1, porkkana 2, soijakastike, tuore inkivääri, valkosipuli 2 kynttä. `keepsOvernight: true`
8. **Lihapullat & muusi** (25 min) — lihapullat 1pkt (valmiit), perunaa 8, maito 2dl, puolukkahillo 1prk, kurkku 1. `keepsOvernight: true`
9. **Halloumi-kvinoa-bowl** (20 min) — halloumi 2pkt, kvinoa 2dl, kirsikkatomaatti 1 rasia, kurkku 1, punasipuli 1, sitruuna 1, tuore minttu/persilja. `keepsOvernight: true`
10. **Härkis-bolognese** (25 min) — härkis 1pkt, tomaattimurska 1tlk, sipuli 1, valkosipuli 2 kynttä, pasta 400g, parmesan. `keepsOvernight: true`

### Recipes — special (Friday/Saturday staying-in dinners)

UI label: "Reseptit: Erikois". 3 to seed the category, expand from there:

1. **Naudan sisäfilepihvi punaviinikastikkeella & lohkoperunat** (45 min) — naudan sisäfile 400g, perunaa 6, voita, sipuli 1, valkosipuli 2 kynttä, punaviiniä 2dl, tuore timjami, ruokakerma 1dl
2. **Linguine alle vongole** (30 min) — linguine 400g, sinisimpukat 1kg, valkoviiniä 2dl, valkosipuli 4 kynttä, persilja, chili, oliiviöljy, sitruuna 1
3. **Tortilla-ilta** (rento, 30 min) — tortillat 8, valmis pulled chicken tai härkis 400g, salsa, guacamole-ainekset (avokado 2, limetti, korianteri, sipuli), kermaviili, juustoraaste, jalapeno-säilyke

Each recipe's ingredients carry an aisle category mapping to one of: produce, bakery, meat-fish, dairy, frozen, pantry, drinks, other. The artifact's `meal-planner.jsx` in conversation history has the exact serialized structure for the common ten; use that as the porting reference. For the special three, the categories are obvious enough to assign during scaffolding.

## Conventions

- **Commits:** Conventional Commits (`feat:`, `fix:`, `chore:`, etc.). One logical change per commit.
- **Branches:** Trunk-based. `main` is always deployable.
- **Code style:** Prettier defaults. ESLint with `@typescript-eslint/recommended`.
- **Comments:** Code should be readable without them. Comments explain *why*, never *what*.
- **Tests:** Vitest for unit tests on shopping-list generation, shuffle, LLM provider routing, group/staple toggling. End-to-end skipped for now — manual testing of the UI is fine at this scale.
- **Secrets:** `.env` (gitignored), `.env.example` (committed with placeholders). All config via env vars, no hardcoded constants for anything deployment-specific.
- **Language in code:** English for code, types, comments, commit messages. Finnish for UI strings and the seed data.

## Explicitly out of scope

Worth listing what we are *not* building so the temptation passes silently:

- **Multi-tenant / multi-household.** One household per deployment. If a friend wants this, they run their own instance.
- **Auth / login.** Network-level access control only. Tailscale handles "outside the LAN."
- **Cloud deployment.** Local-first means local-only. No Vercel, no Fly, no Railway.
- **Mobile apps.** PWA is the answer. App Store and Play Store are not.
- **S-Kaupat API integration.** Doesn't exist publicly; the "favorites list in S-Kaupat" + clipboard handoff is the accepted UX.
- **A general-purpose recipe app.** Hovimestari serves this household. Generality is a future-problem, not a v1-problem.
- **A configurable shuffle count beyond 2 and 3.** Two buttons is the answer. The bot handles edge cases.

## Working with Claude Code on this project

A few notes for any session picking this up:

- **Start small.** Phase 0 first. Get `docker compose up` to a working state with a hello-world API and a Vite app that pings it before doing anything else.
- **Port, don't reimagine.** The artifact's UX is decided. When porting, change as little as possible — the goal is parity-plus-the-new-data-model, then evolve.
- **Don't add abstractions until the second time you need them.** One LLM provider is fine until we add the second. One database table is fine until we need the second.
- **Keep the README current.** Anyone (including future-you) should be able to clone the repo and run `docker compose up` to a working state, with the steps in the README.
- **Commit often, push often.** This is a hobby project; we won't always finish in one session.

When in doubt about a design call, lean toward: simpler, more local, more boring, more reversible.

### Mandatory workflow: architect → developer → reviewer

Any work that counts as a **project phase** (Phase 0/1/2/…) or a **feature request** (a new capability, a non-trivial UI change, anything that touches more than ~2 files) MUST go through three subagents, in order. Trivial fixes (typo, single-line bug, doc tweak) are exempt — use judgement; if you're unsure whether the work qualifies, run the flow.

The agents live in `.claude/agents/`:

1. **`hovimestari-architect`** — Designs the plan. Read-only. Output: a markdown plan with goal, files to touch, key decisions, non-goals, acceptance check, risks.
2. **`hovimestari-developer`** — Executes the architect's plan. Writes code and runs the acceptance check. Does NOT commit unless told to.
3. **`hovimestari-reviewer`** — Independently re-runs the acceptance check and reviews the diff against the plan and this brief. Output: APPROVE or REQUEST CHANGES with specific findings.

Flow rules:

- **Never skip a step.** Don't write code before the architect plans. Don't commit before the reviewer approves.
- **Show the architect's plan to the user before dispatching the developer.** The user gets a chance to redirect cheaply, before any code is written. Implicit approval is fine for small steps inside an already-approved phase.
- **Pass the architect's plan verbatim to the developer.** Don't paraphrase it.
- **If the reviewer requests changes**, send the findings back to the developer (not a fresh architect pass) unless the findings reveal a design flaw — then re-architect.
- **The main session orchestrates, it does not implement.** Prefer spawning subagents over doing the work in the main context. The main context is for routing, summarizing back to the user, and holding the long-horizon thread.
- **Keep the main context focused.** Ask subagents for short summaries. Don't pull large file contents or command output into the main context unless you need it to make a decision.

### Branch hygiene: check before committing

Long sessions cycle through multiple PRs. The trap: a PR gets merged, the conversation continues onto the next item, and the next commit lands on the already-merged branch. The PR for the next item then either fails to open or contains a polluted history (old merged commits plus the new one).

**Before every commit, verify:**

1. `git branch --show-current` — what branch am I on?
2. `git status` — are there unrelated stale changes?
3. Has the PR for the *previous* item already been merged? If yes, the current branch is **dead** — do NOT commit on it.

**When starting a new feature/fix/phase that is logically separate from the last one:**

1. `git fetch origin master` — pull latest base.
2. `git checkout master && git pull --ff-only origin master` — get onto a clean base.
3. `git checkout -b claude/<short-kebab-name>` — create a fresh branch for this unit of work.
4. Do the work, commit, push with `-u origin claude/<short-kebab-name>`.
5. Open the PR from that branch.

**One PR = one logical unit of work = one branch.** Reusing a branch across merged PRs is the failure mode that has bitten this project multiple times. If in doubt, branch — branches are free.

**If the harness instructions name a specific working branch** (e.g. "develop on branch `claude/exciting-ride-dumti`"), that name is a *default starting point*, not a forever-binding. Once a PR off that branch is merged, the next unit of work starts a new branch with a name describing it. Tell the user the new branch name.

**Recovery if a branch already contains merged-and-rebased commits before your new work:**

- `git fetch origin master` then `git rebase origin/master` will skip already-applied commits (git detects them by patch-id even if SHAs differ from rebase-merging).
- Then `git push --force-with-lease` to update the PR.
- Never `--force` without `--lease`.
