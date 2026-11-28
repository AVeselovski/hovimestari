# Git and pull requests

How branches, commits and pull requests work in a repository that several agent sessions share. The binding rules are in `CLAUDE.md`. This page explains them and links the procedures.

## Branches

**One task, one branch, one PR.** Cut the branch fresh from `origin/<default branch>` when the task starts. Name it for the task: `feat/short-description` or `fix/short-description`, lowercase with hyphens.

**A branch is dead once its PR merges.** Follow-up work, even a one-line fix to the same feature, starts a new branch from the new default branch. Never stack new commits on a merged branch's history.

**Never force-push a branch you did not create in your current session.** If a force-push is rejected, or the remote has commits you do not recognise, stop and reconcile.

Why: several sessions can work the same repository at once. If two of them treat the same branch name as theirs, the squash-and-force-push before a PR silently discards the other session's commits. A fresh, task-named branch per task makes that collision unlikely, and the force-push rule stops it when it happens anyway.

## Commits

Conventional prefixes with a capital first letter and a colon:

- `Feat:` a new feature or behaviour
- `Fix:` a bug fix
- `Docs:` documentation only
- `Chore:` tooling, dependencies, logs
- `Refactor:` a change that keeps behaviour
- `Test:` tests only

Example: `Fix: resolve 401 retry loop in api interceptor`.

Formatting runs at commit time. `.githooks/pre-commit` formats the staged files. It does not run per edit, because an import-organising formatter plugin removes imports that are unused at the moment it runs, so formatting a half-written file strips the imports the next edit needs. The install script sets `git config core.hooksPath .githooks` so every clone runs the hook.

## Squash before the PR

The pipeline produces many small commits: log entries, checkpoints, fix-forward commits from validation and review. Before opening the PR, squash them into a small number of logical commits, typically 1 to 5, grouped by concern ("design doc", "backend", "frontend", "docs"), never by chronological accident.

The `/squash` command (`.claude/commands/squash.md`) has the exact procedure. Its guarantees:

- The squashed tree is byte-identical to the original branch tip. `git diff <original-tip> <squashed-tip> --quiet` reports nothing. A squash is a history rewrite and never changes code.
- The push uses `--force-with-lease`, never a bare `--force`.
- No fixes ride along. If something in the diff looks wrong, ask first.
- The tests, typecheck and lint run again after the rewrite.

## The PR description

The `pr-description` skill (`.claude/skills/pr-description/SKILL.md`) writes it: What, Why, Changes and a Test plan checklist.

## After opening the PR

The checklist lives in the `pr-description` skill. In short:

1. **Trigger the review by comment once CI is green.** Post `@claude please review this PR.` The `@claude` workflow (`.github/workflows/claude.yml`) runs only on such comments. Do not trigger it again while a review is in flight. A PR is not review-complete until that review has run and its findings are fixed or answered.
2. **Subscribe to the PR's activity**, so review comments and CI failures reach the session.
3. **Drive the PR to green.** Fix CI failures and review findings on the same branch.
4. **For a UI change, merge on green and report what to try.** Once CI is green and the review is answered, the PR merges. The report says what changed on screen and what to open and try in the app.

Why by comment: the pipeline's `reviewer` agent already reviews every change before the PR opens. An automated review on every PR open would spend review on work that is already reviewed and on builds that are not yet green. Review by comment runs on demand, once CI is green.

## Parked workflows live outside the workflows directory

A workflow file in `.github/workflows/` with every line commented out still produces a failed run on every push, because GitHub tries to parse it and finds no valid workflow. A disabled workflow lives in `.github/workflows-disabled/` instead, where GitHub never looks. Its README there says why. To turn one back on, move it into `.github/workflows/`.

## A UI change merges on green

A PR that changes anything user-visible merges once CI is green, the `@claude` review is answered and the pipeline's own checks have passed: the validator, the ui-validator in a real browser at real widths, and the reviewer. The owner then tests the merged change live, in the app, and sends feedback. That feedback starts a new branch.

The message that reports the merge tells the owner what changed on screen and what to open and try. The `ui-preview` skill (`.claude/skills/ui-preview/SKILL.md`) has the steps:

- Name each changed surface in the words the app shows, and say what is new there.
- Give the path to each change and what to try there, with the states worth trying.
- Attach a few screenshots as an aid, each with a line saying what it shows. Reuse the ui-validator's, or capture them in a real browser with realistic data.
- Keep every screenshot under 2000px on its long side, and never commit them.

Why: the owner judges a screen by using it. Taste and intent show in use, with real data and a real phone in hand.
