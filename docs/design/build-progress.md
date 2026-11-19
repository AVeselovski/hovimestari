# Build progress

The orchestrator's own state for the autonomous build. A session that resumes after a usage limit, a context reset or a replaced container reads this first. Keep it short and true. Update it at every hand-off, and push it.

## Standing instructions from Artur (2026-11-15)

- "Create PRs, review them, merge them, open new ones and so on. Full autonomy until you feel you reached a point of me needing to spin the local env and test it all locally."
- The orchestrator may merge its own pull requests once CI is green and the `@claude` review has run and its findings are addressed. Merge with a merge commit.
- Agents run on `opus`. The orchestrating session plans, briefs, checks and keeps its own context lean.
- Hosting is not set up. Everything runs locally. The scaffold writes the Fly.io and Vercel runbooks and Artur runs them later.
- UI screenshots are still sent to Artur in chat for the record, but a merge does not wait for his sign-off during the autonomous run.
- Stop and tell Artur when: the app is ready for him to run and test locally, a requirement conflicts with what is being built, or a decision only he can make blocks the next step.

## How resuming works

A scheduled task named "Continue Hovimestari build" (`trig_01Bt57gUR7tYJ1LES2BRNffG`) wakes the orchestrating session every hour. On waking: read this file, run `git status` and `git log --oneline -5`, list open pull requests, then continue. Disable the task at the hand-over point.

Agents in this environment cannot start other agents. The orchestrator runs every hand-off itself: engineer, then `validator` and `reviewer` (both read-only, so they can run side by side), then `documentation-specialist`.

Agent definitions for this project are in `.claude/agents/`. If the Agent tool offers roles from another repository, tell the agent in its brief to read `/home/user/hovimestari/.claude/agents/<role>.md` and `/home/user/hovimestari/CLAUDE.md` and to work from those.

The container has no Docker daemon. Run `/home/user/start-local-postgres.sh` to start a throwaway Postgres 16 on `localhost:5432`, user `postgres`, trust auth. If the script is gone, the binaries are in `/usr/lib/postgresql/16/bin` and must run as the `postgres` user with a data directory under `/var/lib/postgresql`.

## Hand-over point

Artur tested the first version locally on 2026-11-17 and 2026-11-18 and gave two rounds of feedback, all of it merged (pull requests #42 to #54). On 2026-11-18 he asked to resume the autonomous build: "once you're done with fix rounds, can you continue onto next topics and resume hardcore autonomy feature set progress".

The next hand-over is when build step 4 in `docs/design/pivot-plan.md` (connected AI over MCP) works end to end and he can connect his own assistant. Stop earlier on a requirement conflict or a decision only he can make.

## State

Updated 2026-11-19 by the orchestrator on `feat/connection-keys`. Pull requests #27 to #66 are merged.

| Step                                                 | Branch                                                       | State                                                                                                                                                                                                                                                                         |
| ---------------------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Targets model, slice 2: a user with no targets       | merged (#57)                                                 | done                                                                                                                                                                                                                                                                          |
| 3d: the week view, then the copy sheet               | merged (#60, #64)                                            | done                                                                                                                                                                                                                                                                          |
| The Recipes tab's page for saved meals and own foods | merged (#63)                                                 | done                                                                                                                                                                                                                                                                          |
| Barcode, part 1: look a product up by a typed number | merged (#61, #66)                                            | done. Artur was told on 2026-11-19                                                                                                                                                                                                                                            |
| Barcode, part 2: the camera scan                     | `spike/scan-check` (never merges), then a branch from master | the local HTTPS runbook is merged (#59). The prototype page for Artur's phone is on `spike/scan-check`, with its steps in `docs/design/scan-check.md` on that branch. The scanner (slice 4b in `docs/design/barcode.md`) is built without waiting for his result, as he asked |
| Connected AI (build step 4 in the pivot plan)        | one branch per slice                                         | designed in `docs/design/connected-ai.md` (#65). Slice 1, keys: `feat/connection-keys`, in review. Then 2a (endpoint, auth, brakes, rules), 2b (read tools), 3 (Settings section): hand-over A, read-only. Then 4a, 4b, 5: hand-over B, writing. Then 6, deletions            |

Artur set this order on 2026-11-18: "Yes to the new order, keep "Recipes", local HTTPS". Tell him when the barcode lookup and then the camera scan are on master, because only his phone can prove the camera, and carry on without waiting.

Open with Artur, none of it blocking: his yes on the requirement wordings listed in `TODO.md` (FR-DAY-04, FR-DAY-08, FR-GAP-01, FR-AI-06, three overview sentences, one clause on FR-TGT-07), the energy cap on own foods, and the iPhone checks in `TODO.md`. FR-TGT-03 and FR-TGT-07 are approved and in `docs/requirements.md`. The column names "Eaten" and "Planned" for the two readings wait for his word too.

## Notes for the next wake-up

- Read finanssi through git, never from its working tree: `git -C /home/user/finanssiappisv2 fetch origin master`, then `git -C /home/user/finanssiappisv2 show origin/master:<path>`. The checkout there was a single old commit, and a fix finanssi already had was rebuilt from a guess because of it.
- Artur must download the Fineli open data zip himself, in a browser, into `apps/backend/data/fineli/` before he tests locally. The site blocks automated requests. He has been told twice. Say it again at the hand-over.
- WebKit is not installed in this container, so nothing has run in Safari's engine. The first Safari check is Artur's iPhone.
- When resuming an agent would mean reloading a very large context, start a fresh one with a precise brief instead.

- GitGuardian scans every commit of a pull request and fails on any literal password or credential-shaped string, even in a comment, a test or an agent memory note. A base64 Basic auth header counts. Build squashed history from the final tree by path so an old commit's literal does not survive.
- A successful CI run does not always send an event. After a push, check the pull request's check runs directly. CI takes about 90 seconds.
- The `@claude` review answers within a minute or two of the comment. Verify each finding against the code before acting. On #28 its one medium finding was a false positive, answered on the pull request with a trace and reported to Artur, who has the last word on it.
- The remote refuses branch deletion through `git push --delete`. Merged branches stay on GitHub for Artur to delete.
- Two checkouts are in use: the main one for design work and fixes, and the worktree `/home/user/hovi-web` for the web pull request. Each needs its own `pnpm install`.
