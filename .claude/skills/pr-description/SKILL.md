---
name: pr-description
description: Writes pull request descriptions. Use when creating a PR, writing a PR, or when the user asks to summarize changes for a pull request.
---

When writing a PR description:

1. Run `git diff master...HEAD` to see all changes on this branch.
2. Write a description following this format:

## What

One sentence explaining what this PR does.

## Why

Brief context on why this change is needed.

## Changes

- Bullet points of specific changes made
- Group related changes together
- Mention any files deleted or renamed

## Test Plan

Create a checklist of manual testing steps to verify the changes work as intended.

## After creating the PR (required checklist)

1. **Trigger the review manually.** There is no automated review on PR open. The
   review-on-open workflow is parked in `.github/workflows-disabled/claude-code-review.yml`,
   outside the workflows directory, so GitHub never tries to run it. The live workflow
   (`.github/workflows/claude.yml`) only fires on `@claude` comments. Once CI is green,
   post a comment: `@claude please review this PR.` Do not re-trigger while a review is
   in flight. A PR is not review-complete until that review has run and its findings
   are addressed or explicitly answered.
2. **Subscribe** to the PR's activity so review findings and CI failures reach the session.
   Some Claude Code harnesses provide a `subscribe_pr_activity` tool for this. Skip this step
   when the tool is absent. Either way, drive the PR to green.
3. **UI changes only:** confirm the `ui-preview` skill ran. Pre-merge screenshots must
   have been sent to the owner in chat, and the PR body must note it. If not, do it
   before asking for or expecting a merge.
