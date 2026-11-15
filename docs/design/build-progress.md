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

The planned hand-over is after build step 3 in `docs/design/pivot-plan.md`: sign in, set targets, search foods, log a day, see both totals. That is the first version worth running locally. Go further only if step 3 lands with nothing that needs Artur's eyes.

## State

Updated 2026-11-15 20:50 UTC. Three checkouts are in use, one per piece of work in flight.

| Step                                            | Branch and checkout                                   | Pull request | State                                                                                                                                                                                                                                          |
| ----------------------------------------------- | ----------------------------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Brief, workflow kit, requirements               | `feat/pivot-brief`                                    | #27          | merged                                                                                                                                                                                                                                         |
| 1a. Backend scaffold and auth API               | `feat/scaffold-backend-auth`                          | #28          | merged                                                                                                                                                                                                                                         |
| 1b. Web scaffold, auth pages, shell, PWA        | `feat/scaffold-web-shell` in `/home/user/hovi-web`    |              | built, validated (PASS), ui-validated (PASS with findings), reviewed (approve after fixes). frontend-engineer on fix cycle 1 with 16 items. Next: re-check by reviewer and ui-validator, documentation-specialist, squash, pull request, merge |
| 1c. Account settings on sheets                  | `feat/account-settings`                               |              | not started. Waits for 1b. Design is PR 3 in `docs/design/scaffold-and-auth.md`                                                                                                                                                                |
| Fix: a lost refresh response signs the user out | `fix/lost-refresh-response` in `/home/user/hovi-auth` |              | architect writing `docs/design/session-renewal.md`. Then design review, backend-engineer, validator, reviewer, pull request. Must land before the hand-over                                                                                    |
| 2a. Targets and foods backend                   | `feat/targets-foods` in `/home/user/hovimestari`      |              | built (372 tests). validator and reviewer running at `86eb804`. Next: fixes, documentation-specialist, squash, pull request, merge                                                                                                             |
| 2b. Fineli importer                             | `feat/fineli-import`                                  |              | not started. Cut from `master` after 2a merges. Design in `docs/design/targets-and-foods.md`                                                                                                                                                   |
| 2c. Targets web                                 | `feat/targets-web`                                    |              | waits for 1b, 1c and 2a                                                                                                                                                                                                                        |
| 2d. Foods web                                   | `feat/foods-web`                                      |              | waits for 2c                                                                                                                                                                                                                                   |
| 3. Days and quick logging                       |                                                       |              | design not started. Start the architect once 2a is merged                                                                                                                                                                                      |

## Notes for the next wake-up

- Artur must download the Fineli open data zip himself, in a browser, into `apps/backend/data/fineli/` before he tests locally. The site blocks automated requests. He has been told twice. Say it again at the hand-over.
- WebKit is not installed in this container, so nothing has run in Safari's engine. The first Safari check is Artur's iPhone.
- When resuming an agent would mean reloading a very large context, start a fresh one with a precise brief instead.

- GitGuardian scans every commit of a pull request and fails on any literal password or credential-shaped string, even in a comment, a test or an agent memory note. A base64 Basic auth header counts. Build squashed history from the final tree by path so an old commit's literal does not survive.
- A successful CI run does not always send an event. After a push, check the pull request's check runs directly. CI takes about 90 seconds.
- The `@claude` review answers within a minute or two of the comment. Verify each finding against the code before acting. On #28 its one medium finding was a false positive, answered on the pull request with a trace and reported to Artur, who has the last word on it.
- The remote refuses branch deletion through `git push --delete`. Merged branches stay on GitHub for Artur to delete.
- Two checkouts are in use: the main one for design work and fixes, and the worktree `/home/user/hovi-web` for the web pull request. Each needs its own `pnpm install`.
