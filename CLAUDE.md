# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Hovimestari is a food planner and food log for people who bring their own calorie and protein targets. Artur owns the requirements and makes the product decisions.

## Tech stack

| Layer            | Technology                                            |
| ---------------- | ----------------------------------------------------- |
| Web frontend     | Next.js (App Router), React, TypeScript, Tailwind CSS |
| Mobile           | The web app, installed as a PWA                       |
| Backend          | Node.js, Express, TypeScript                          |
| Database         | PostgreSQL                                            |
| ORM              | Drizzle ORM                                           |
| Connected AI     | Model Context Protocol server, mounted on the backend |
| Food data        | Fineli open data, Open Food Facts                     |
| Email            | Resend                                                |
| Authentication   | JWT (access and refresh tokens), Google OAuth 2.0     |
| Containerisation | Docker                                                |
| Cloud            | Fly.io (backend and Postgres), Vercel (web)           |
| CI/CD            | GitHub Actions                                        |
| Testing          | Jest, React Testing Library, Supertest                |

The stack is the one `finanssiappisV2` runs, on purpose. Its auth, its connected AI module and its mobile shell are lifted from there, not rewritten. `docs/design/pivot-plan.md` names what to lift and from where.

- Frontend: Next.js (App Router), React, TypeScript, Tailwind CSS, shipped as an installable PWA
- Backend: Node.js, Express, TypeScript, PostgreSQL through Drizzle ORM, with an MCP endpoint for connected AI assistants

## Where the code is today

**The repository is mid-pivot.** The stack above is the target. The code in `apps/api`, `apps/web`, `packages/shared` and `infra/` is the earlier app: a single-household meal planner on Fastify, Vite and one JSONB row, with no accounts. It still builds and its tests still pass.

- Do not extend the earlier app. No new feature goes into it.
- The first task of the pivot replaces it with the new scaffold. `docs/design/pivot-plan.md` holds the build order, what to salvage from the earlier app and what to lift from `finanssiappisV2`.
- `docs/design/legacy-brief.md` is the earlier project brief, kept for reference while salvaging. It describes nothing that binds new work.
- `docs/requirements.md` is a draft until Artur confirms it. Raise anything in it that looks wrong. He has accepted `docs/overview.md`.

Delete this section when the scaffold lands and the earlier app is gone.

## Product rules that bind every change

These come from `docs/overview.md` and `docs/requirements.md`. They are here because breaking one is easy to do by accident.

- **No advice.** Nothing the app shows or returns says what a user's targets or intake should be. No default targets, no calculators, no judgement words on a day. The app reports figures against the user's own numbers. A connected assistant may set targets for its user. That is the user's own assistant acting, and the app adds no view of its own.
- **No inference.** The app calls no language model and stores no model provider key. AI reaches the app only through a user's connection key, over MCP.
- **No chat in the app.**
- **Figures come from foods.** A recipe's figures are computed from ingredients that point at foods. A day's figures are computed from its entries. The only typed-in totals are a saved meal's and a user's own food's label values.
- **The assistant gets what the screen gets.** A connected assistant's tools call the same read and write services the REST routes call. A tool selects and renames fields and computes nothing.
- **A feature ships with its assistant tools.** A change that adds something a user can do on screen adds the matching MCP tool in the same change, unless the requirements keep it out of an assistant's reach.
- **No prices.** The app does not know what food costs.

## Docs

The `docs/` directory holds the context and the requirements for the code:

- `docs/overview.md`: the product description, user stories and reference data. It frames what is being built.
- `docs/requirements.md`: the functional requirements, by feature area. **Source of truth.** Reference it often. Never change it without explicit permission from Artur.
- **`docs/features.md`: the catalog of every feature the app has, one or two sentences each, with a link to its detail doc.** Start here. It is the cheapest way to find out whether something is already built and where it is documented. Anything not listed is not built.

Two detail layers answer different questions. A page composes several features, and a feature appears on several pages.

- `docs/features/<feature>.md`: **what a feature is and how it works**. Its behaviour, rules, computation, API and data model. A feature's rules live here and nowhere else.
- `docs/app/<page>.md`: **what a page is**. What the page is for, what it shows, its layout and how it composes features. It links the feature docs for their rules and never restates them.

### Keeping docs current

Docs are only useful while they are true. A stale doc is worse than none, because it makes agents confidently wrong about what exists.

- **Before changing code, read the feature doc and the page doc for what you touch (find them through `docs/features.md`). Update them in the same change, and run `pnpm docs:check` on the docs you changed.**
- **Keep the catalog current.** Work that adds, removes or changes a feature's behaviour updates its detail doc and its line in `docs/features.md`, in the same change. A new feature means a new detail doc and a new catalog line.
- **Keep the link map current.** Every concept has one home heading, listed in `docs/design/link-map.md`. A new home heading adds its row in the same change. A renamed one repoints every link to it in the same change.
- This is part of the implementation, like tests. It is never a follow-up.

## Repository layout

pnpm workspaces. Today the workspaces are the earlier app: `apps/api` (Fastify API), `apps/web` (Vite web UI) and `packages/shared` (Zod schemas), with a compose stack in `infra/`. The scaffold replaces them with:

- `apps/backend`: the Express API and the MCP endpoint. Source layout and commands: `apps/backend/README.md`.
- `apps/web`: the Next.js web app and PWA. Source layout and commands: `apps/web/README.md`.
- `packages/types`: API request and response shapes and Zod schemas shared by both.

The root scripts are the same before and after the scaffold: `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm docs:check`. CI runs exactly these.

Module and build rules, from the scaffold on:

- **Full ESM everywhere.** Every `package.json` has `"type": "module"`.
- **The backend uses `NodeNext` module resolution**, which requires explicit `.js` extensions on relative imports (`import { foo } from './foo.js'` for `foo.ts`).
- **The web app uses `Bundler` resolution.** Do **not** use `.js` extensions on relative imports there, because its bundler does not resolve them.
- **The backend Docker image builds with the repository root as its context**, because it copies workspace siblings such as `packages/types`.

**Formatting runs once, at commit time.** `.githooks/pre-commit` runs `pnpm exec prettier --write --ignore-unknown --log-level warn` over the staged files, not on every edit. Import-organising formatter plugins remove imports that are unused at the moment they run, so formatting a half-written file strips imports the next edit is about to use. The install or `prepare` script runs `git config core.hooksPath .githooks`, so every clone uses the hook.

## Testing

**Always write tests** when adding new code. Do not leave tests for a follow-up task.

| Area     | Runner                             | Notes                                                                                                                                                                                    |
| -------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend | Jest 29 with React Testing Library | `next/jest` transforms to CJS, so use standard `jest.mock()`. Mock `next/navigation` and `useAuth` in component tests.                                                                   |
| Backend  | Jest 29 with Supertest             | Native ESM, so use `jest.unstable_mockModule` with a dynamic `await import()`. Import `{ jest }` from `@jest/globals` explicitly. Requests go through Supertest against the Express app. |

These runners arrive with the scaffold. The earlier app's tests run on Vitest until it is removed.

- Tests live in `__tests__/` next to the source file, in files named `*.test.ts` or `*.test.tsx`. Run one workspace with `pnpm --filter <app> test`, or one file by passing its path.
- Run everything with `pnpm test`.
- The `write-tests` skill holds the detailed patterns and examples. The `/add-tests` command (`.claude/commands/add-tests.md`) invokes it.

### Two failure modes that ship real bugs

Both produce a green suite over visibly broken UI. Check for them explicitly.

**1. A test whose mock encodes the bug.** A mock that models behaviour the browser does not have passes before and after a fix, proving nothing. Example: a popover's first placement fix mocked the popover's own bounding box _growing_ when its dropdown opened. In the real browser the dropdown was absolutely positioned and out of flow, so the box never grew. The mock was green and the component was broken. **A test that passes identically with and without the fix is not a test.** When fixing a bug, run the new test against the unfixed code and confirm it fails.

**2. Verifying per-state correctness instead of across-state correctness.** The same popover later jumped around the screen while in use. It recomputed its position on every content resize, so it moved on open, on filter and on selection. A live sweep checked "is it on screen?" in each state, and it was, in every one. Nobody checked "is it in the _same_ place as in the previous state?" For anything positioned, animated or stateful, assert the property that must hold **between** states, not just within each one.

Corollary: for UI whose bug class only shows in motion or at real viewport sizes, unit tests are not the gate. Drive it in a real browser and measure.

**Keep every screenshot under 2000px on its long side.** Once a conversation holds enough images, the API lowers its per-image limit to 2000 pixels and then rejects _every_ image in the request, new ones, small ones and the human's own attachments alike, because one oversized image sits somewhere in the history. It fails as a bare "media removed" with no hint of the cause, and it cannot be undone within that session. Watch the device pixel ratio: a screenshot taken at device scale multiplies the viewport by it, so a 1440px-wide viewport lands at 2880px. Capture at CSS scale (Playwright's `scale: "css"`, its default). Shrink any image you did not capture yourself before you attach it, for example with `sips -Z 1800 <file>` on macOS.

## Documenting

Significant changes are reflected in the README files they touch. Updating this file is encouraged when it gives better guidance for future work.

### Who owns which document

| Document                                                                                                                  | Owner  | Rule                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/requirements.md`, `docs/overview.md`                                                                                | Artur  | The foundation. Never edit without explicit approval from Artur. When they drift from what is built, say what is wrong and propose the wording. Artur decides.                                                 |
| `README.md` files, `docs/features.md`, `docs/features/`, `docs/app/`, `docs/setup/`, `docs/_templates/`, `docs/playbook/` | Claude | Yours to keep true and clean. The human-facing rules below apply in full. Runbooks in `docs/setup/` are run by hand, so their steps stay exact. The playbook holds the reasoning behind the rules, for people. |
| `docs/design/`                                                                                                            | Claude | Your workspace. Artur does not read it. Persist whatever you or a future session needs.                                                                                                                        |
| `TODO.md`                                                                                                                 | Shared | The running list of open items. See below.                                                                                                                                                                     |

### TODO.md

Findings that outlive a task go in `TODO.md`, not in a chat message. A list in chat is forgotten the moment the next thing lands. That is the whole reason this file exists.

Writing to it is part of finishing work, like tests and docs. Whenever a task turns up something real that you are not doing now, add it before you report the task done: a defect you chose not to chase, a cleanup the review flagged, a naming question only Artur can settle, a gap you decided to leave. Say what it is, why it is open, and who decides. File it under one of the three sections: needs a decision from Artur, ready to pick up, or known gaps deliberately unbuilt. Delete items when they land. The file lists what is open, never what was done.

### Human-facing docs

README files, `docs/features.md`, `docs/features/`, `docs/app/`, `docs/setup/` and `docs/playbook/` are written for people, not as agent memory. The full standard is in `.claude/agents/documentation-specialist.md`: the shape of a feature doc and a page doc, tone, linking, length and what goes where. `pnpm docs:check [files]` checks it, with its scope set in `docs/check-docs.config.json`. The five tone rules:

- Plain words, short sentences. One idea per sentence.
- No semicolons and no em or en dashes outside code.
- State the current fact. No history, no migration narratives.
- No decision numbers, requirement IDs or issue numbers in prose.
- Say what a thing is, not what it is not.

A README section says what the thing is, names the key files, shows how to do the common task and states the rules that bind you. A source-tree listing gives one line per file, saying what it is.

Process language (decision numbers, slice numbers, citations) belongs in `docs/design/`, code comments, commit messages and PR bodies. Plans and design docs go in `docs/design/`, never in `docs/app/` or `docs/features/`.

## UI and UX come first

**Smooth interaction and a beautiful, intuitive UI are vital. The product is only as good as its UI and UX.** What this means in practice:

- Treat visual and interaction quality as part of correctness, not polish to defer. A feature that works but looks or feels rough is not done.
- The UI is bold and confident. It uses the space available to it rather than huddling in cramped, timid panels. Prefer a generous type scale, clear hierarchy and purposeful density over uniform smallness.
- One theme, everywhere. Style through the shared design-token system and shared primitives, never ad-hoc raw values per view. If a surface needs a colour or spacing the system lacks, extend the system. Do not inline around it. The tokens live in `apps/web/src/app/globals.css`, for example a stylesheet of custom properties or a theme module. `docs/app/colors.md` documents them, saying what each token is for.
- Light and dark themes are both first-class. Every change must look right in both. Never hardcode a colour that only works in one.
- The phone comes first. Design every screen for a phone held in one hand, then widen it. Logging a food is the most-used path in the app and gets the shortest route.
- On touch devices, use the platform's native controls (date pickers, selects) unless there is a strong reason not to. A custom control on desktop alone means two implementations of one field to keep in step forever.
- Measure layout live, at real widths, in a real browser. Reading the source to predict layout has been wrong often enough that it does not count as verification.
- Validate mobile-facing changes on a real device when you can. Emulation has missed several real-device issues at once.

**The design direction is a working direction.** Artur confirmed it for now. Follow it as it stands and expect it to change:

- **Identity carries over from the earlier app.** Nordic kitchen counter: warm paper background, dark forest-green ink, an oxblood accent. Display type is Fraunces, body type is Instrument Sans, figures and lists use JetBrains Mono. The palette values are in `docs/design/legacy-brief.md` under Design language. The dark theme is new and is designed with the first screens.
- **Layout follows a four-tab phone shell**, in the manner of the reference screens from the pivot conversation: a day or plan tab, a recipes tab, a groceries tab and settings. Below the `md` breakpoint, dialogs are bottom sheets.
- **No gradients, no glass effects, no decorative shadows.**
- **Hue carries meaning, and nothing else borrows a meaning's hue.** Energy, protein, carbohydrates and fat each get one hue, chosen in the first UI design doc and listed in `docs/app/colors.md`. From then on no decorative surface uses those hues. Selection uses the accent, because selected is not the same as on target.
- **A gauge states a position, never a verdict.** A day under its protein floor is shown as a distance, not as a failure. No red for "over" and no green for "good". This is the no-advice rule in visual form.

## UI copy

User-facing UI strings are written for humans: plain words, short sentences. No em dashes and no semicolons on screen. No internal vocabulary: words like "stub", "echo" or a table's column name are code concepts, not things a user should read. Code comments are exempt. Docs follow the standard under Human-facing docs. This rule is about what renders in the app.

**UI copy is English.** Do not mix words from another language into it, and do not add translated copy piecemeal. Proper nouns with no real equivalent are the exception, such as S-kaupat and rahka. Food names are data, not copy: they follow the user's food-name language. Formatting dates and numbers for a user's locale is rendering, not copy, and is separate from this rule.

**No judgement words.** Copy never calls a day good, bad, over, failed or on track. It states figures and distances. See Product rules.

From the scaffold on, every rendered string is an entry in the message catalog `apps/web/messages/en.json`, read through `next-intl`, and a hardcoded string in a component is a lint error. The copy rules are a matter for you and for review, not for the build: a wording preference should not fail CI. What tests check is that the catalog **works**: no empty entry, no key that no code can reach, and no plural form that fails to render, because a malformed plural prints its raw key path on screen.

## Commit convention

Use conventional commit prefixes with a capital first letter followed by a colon: `Feat:`, `Fix:`, `Docs:`, `Chore:`, `Refactor:`, `Test:`. Example: `Fix: resolve 401 retry loop in api interceptor`.

## Requirements vs. proposed solutions

Issues and requests usually carry **two** things: a problem, and a proposed solution. Only the problem is the requirement. The proposed solution is a suggestion from someone wearing a product hat, and it is your job, as architect, engineer and designer, to evaluate it on its merits rather than deliver it literally.

**The test: if making the proposed solution work requires workarounds, the solution is wrong, not the codebase.** Workarounds look like extra mount sites, duplicate controls, empty-state special cases, patches for a state where the host element does not render, responsive splits that exist only to rescue the placement, or "we disable that behaviour here so this can work". One is a smell. Two is a stop signal.

When you hit that signal:

1. **Stop.** Do not engineer around it to make the stated design survive. That is how a product ends up misshapen and the code ends up full of smells.
2. **Separate the problem from the placement.** Restate what the request is actually trying to achieve, stripped of the suggested mechanism.
3. **Push back in writing, with an alternative.** Flag the proposed approach as a blocker, explain concretely which workarounds it forces, and propose a design that solves the same problem without them. Prefer alternatives that reuse existing architecture over ones that add machinery.
4. **Hand the decision back to the human**, then implement whichever they pick.

Pushing back is expected and welcome. It is not obstruction, and "the issue said to do it this way" is not a justification for shipping a design you can see is bad. Equally, do not use this as licence to redesign things that are working: the bar is _forced workarounds_, not personal preference. If the requester reaffirms their original approach after hearing the objection, that is their call. Implement it and note the trade-off.

Worked example (anonymised): a request asked for a list's filter toggle to move into the table's Actions column header to save vertical space. Implementing it literally needed a second copy for the empty state, because the table header does not render with zero rows. It needed a third copy for narrow screens, because sticky columns were disabled there and the icon sat off-screen. And on narrow screens it still spent the row the request wanted to reclaim. Three mount sites to defend one placement. The right answer was to put the toggle in the global app header next to the other view controls: a control of the same class, always present, no workarounds.

## Agents

When working with code, ALWAYS use the relevant agents. **Every agent runs on `opus`**, the strongest model available: pass that model on every Agent tool call, and every definition in `.claude/agents/*.md` carries `model: opus` in its frontmatter. The orchestrating session plans, briefs the agents, checks their work and keeps its own context lean. The agents do the reading, writing and testing. For small and contained changes, invoke the agents directly. For bigger topics, run the full pipeline, starting with `architect`. `docs/requirements.md` is the source of truth. Reference it often, and do not change it without explicit permission from Artur.

The pipeline runs autonomously to completion: design, implement, validate, review, document, open the PR. Do not stop for approval between steps. Escalate only on a genuine requirements conflict or an ambiguous product direction.

The hand-off chain is the same for every change:

1. The orchestrator invokes `architect`. The architect writes the design doc and returns it to the orchestrator. It invokes no other agent.
2. At the orchestrator's call, `reviewer` reviews the design doc before implementation, for up to about three rounds.
3. The orchestrator invokes the engineers. Each engineer invokes `validator` automatically when it is done.
4. On a pass, `validator` invokes `ui-validator` when the change is user-visible, and `reviewer` otherwise. On a fail, it sends the findings back to the engineer. `ui-validator` invokes `reviewer` when it is done.
5. After the reviewer passes, the orchestrator invokes `documentation-specialist`, then squashes the branch and opens the PR.

Log every agent step to `logs.txt` in the repo root, before and after: `[agent-name STARTED|DONE] (ISO-8601 UTC timestamp) comment (tokens used if possible)`.

Always create a new branch for a new task. Name it `feat/short-description` or `fix/short-description`, lowercase with hyphens.

Agents with `memory: project` in their frontmatter keep notes in `.claude/agent-memory/<agent>/`. `MEMORY.md` there is an index, not a memory. A memory records only what the code cannot show: decisions and their why, owner preferences, risks that came true and gotchas that cost a round trip. Verify a memory against the code before acting on it.

### Branches are single-use: one task, one branch, one PR

Several agent sessions may work this repository at the same time. The failure mode is two sessions treating the same branch name as theirs: the squash-and-force-push step before a PR silently discards the other session's commits. The rules that prevent it:

- **One branch per task, named for the task**, cut fresh from `origin/master` when the task starts. Do not reuse a session-assigned or long-lived working branch across unrelated tasks.
- **A branch is dead once its PR merges.** Follow-up work, even a one-line fix to the same feature, starts a new branch from the new `master`. Never stack new commits on a merged branch's history.
- **Never force-push a branch you did not create in your current session.** If a force-push is rejected or the remote has commits you do not recognise, stop and reconcile. Do not `--force` past it, because another session's work may be on the other side.

Concurrent agents may also share one working tree. Honour any path scope a brief states, even for harmless edits. Re-read a file before editing it, because it may have changed since you read it. Run verification gates that matter in an isolated `git worktree` at a pinned commit. Never `git stash` in a shared tree, because a stash takes other agents' uncommitted work with it.

Every agent that touches a feature is responsible for the feature catalog: read `docs/features.md` before planning or writing code to find out what already exists, and leave it accurate when the work lands.

- **architect**: plans features, designs systems and writes the technical design doc in `docs/design/` before implementation begins. Call it before writing code for any non-trivial change. It reads `docs/features.md` first, validates the request against the requirements and states which feature and page docs the work must update. It returns the design to the orchestrator.
- **backend-engineer**: writes backend code and its tests from the design doc, and updates the docs it touches in the same change. Invokes `validator` when done.
- **frontend-engineer**: writes frontend code and its tests from the design doc, and updates the docs it touches in the same change. Invokes `validator` when done, and says whether the change is user-visible.
- **validator**: validates the code against the requirements and the design. Reports pass or fail and changes nothing itself. On fail it sends the findings back to the engineer, at most two cycles, then escalates to Artur. On pass it invokes `ui-validator` for a user-visible change and `reviewer` otherwise. Runs automatically after every implementation.
- **ui-validator**: validates user-visible changes in a real browser at real widths: visual correctness, accessibility, UX, and drift from the page doc. Runs after `validator` passes and invokes `reviewer` when done. It fixes small presentational issues itself and lists each fix in its report. Anything that changes behaviour or structure goes back to `frontend-engineer`, and that fix runs through `validator` again.
- **reviewer**: reviews the diff for quality, maintainability and adherence to the design doc, with a severity on every finding. Reviews the docs in the diff too. Runs after `validator`, or after `ui-validator` for a user-visible change. At the orchestrator's call it also reviews the design doc before implementation.
- **documentation-specialist**: owns `docs/features.md`, the feature docs, the page docs, the playbook, the link map and the docs checker. Engineers update the docs in the same change. The documentation-specialist reviews them against the standard. The orchestrator invokes it after the reviewer passes.

## Pull requests

**UI changes require pre-merge screenshots** when preview deployments cannot be used for validation. Before a PR that changes anything user-visible is merged, send curated screenshots from `screenshots` to Artur in chat for visual sign-off. The `ui-preview` skill has the steps. Never commit screenshots.

**Always squash a branch's commits into a small number (typically 1 to 5) of logically grouped commits before opening its PR.** The pipeline produces many small commits: log entries, checkpoints, fix-forward commits from validation and review. Group by concern, such as "design doc", "backend", "frontend" and "docs", not by chronological accident. The squashed tree must be byte-identical to the original tip, and the push uses `--force-with-lease`, never a bare `--force`. The `/squash` command (`.claude/commands/squash.md`) has the exact procedure.

After opening any PR, follow the post-PR checklist in the `pr-description` skill: once CI is green, trigger the `@claude` review with a comment, subscribe to the PR's activity, and drive the PR to green.
