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

| Step                                     | Branch                       | Pull request | State                                                                                                         |
| ---------------------------------------- | ---------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------- |
| Brief, workflow kit, requirements        | `feat/pivot-brief`           | #27          | merged 2026-11-15                                                                                             |
| 1a. Backend scaffold and auth API        | `feat/scaffold-backend-auth` |              | design final after two review rounds (`docs/design/scaffold-and-auth.md`), backend-engineer implementing PR 1 |
| 1b. Web scaffold, auth pages, shell, PWA | `feat/scaffold-web-shell`    |              | waits for 1a to merge                                                                                         |
| 1c. Account settings on sheets           | `feat/account-settings`      |              | waits for 1b to merge                                                                                         |
| 2. Targets and foods                     |                              |              | not started                                                                                                   |
| 3. Days and quick logging                |                              |              | not started                                                                                                   |

## Notes for the next wake-up

- PR 1 squash: two historical commits hold literals a secrets scanner flags, so the squashed history must not reproduce them. `5ef35e8` has an old agent memory line with a Postgres password assignment. `354b44d` (the verbatim lift) has a Basic auth header in the lifted `authenticate.test.ts`. Build the squashed commits from the final tree by path, and leave that one test file out of the verbatim-lift commit.

- GitGuardian scans every pull request and fails on any literal password, even a throwaway one in a comment. Use trust authentication for throwaway databases and no committed literal secrets anywhere, tests included.
- A successful CI run does not always send an event. After a push, check the pull request's check runs directly.
- The `@claude` review answers within a minute or two of the comment.
