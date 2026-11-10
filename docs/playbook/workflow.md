# The workflow

How a change moves from a request to a merged pull request. The rules that sessions must follow are in `CLAUDE.md`. Each agent's own instructions are in `.claude/agents/`. This page is the whole picture for a person reading it end to end.

## The orchestrating session

The session a person talks to is the orchestrator. It does four things:

- **Plans.** It decides whether a change is small enough to hand straight to an engineer, or big enough to start with the architect.
- **Briefs.** It gives each agent a self-contained task: the goal, the design doc, the files it may write, and what to report back.
- **Checks.** It reads each agent's report, spot-checks the claims that matter and decides the next step.
- **Keeps its own context lean.** The agents do the reading, writing and testing. The orchestrator holds the plan and the verdicts, not the code.

Every agent runs on the same strong model, set in its frontmatter and passed on every Agent tool call. A weaker model in one seat becomes the weakest link of the whole pipeline.

## The pipeline

Small, contained changes go straight to the engineer, then the validator, the ui-validator when the change is user-visible, and the reviewer. Anything non-trivial runs the full pipeline, in this order.

The hand-offs are fixed. The orchestrator invokes the architect, which returns its design to the orchestrator. The architect has no Agent tool, so it never invokes anyone. At the orchestrator's call, the reviewer reviews the design doc before implementation, for up to about three rounds. The orchestrator then invokes the engineers. Each engineer invokes the validator. The validator invokes the ui-validator for a user-visible change and the reviewer otherwise, and the ui-validator invokes the reviewer when it is done. After the reviewer passes, the orchestrator invokes the documentation-specialist.

### 1. architect

- **Reads first.** The feature catalog (`docs/features.md`), then the feature and page docs the request touches, then `docs/requirements.md`.
- **Validates.** It compares the request with the requirements. Aligned means design it. Gaps or moderate deviations mean design it with stated assumptions. A real conflict with the requirements or the product's direction means stop and write an escalation report instead of a design.
- **Judges the proposed mechanism.** A request carries a problem and a proposed solution. Only the problem is the requirement. If the proposed solution forces workarounds, the architect pushes back in writing with an alternative.
- **Writes the design doc** in `docs/design/`, from `docs/design/_design-doc-template.md`: product decisions the owner may shelve on top, then the technical design, then the resolved defaults the owner may veto.
- **Hands the design back** to the orchestrator, with the implementation plan mapped to agents and the list of docs the work must update. The orchestrator runs the pipeline from there.

At the orchestrator's call, the reviewer reviews the design doc before implementation, for up to about three rounds on a large change.

### 2. backend-engineer and frontend-engineer

- **Implement** the design with clean, minimal code that follows the project's conventions. Test first where it fits.
- **Write the tests in the same change.** A bug fix comes with a test that fails on the unfixed code.
- **Update the docs in the same change:** the feature doc, the page doc and the catalog line for what they touched, and they run the docs checker on them.
- **Hand off** to the validator, and say whether the change is user-visible.

### 3. validator

- **Checks** that the code meets the requirements and the design, looks for bugs and edge cases, and runs the tests.
- **Checks the docs.** A change to behaviour, copy or layout without the matching doc change is a fail finding.
- **Reports pass or fail** with a short list of findings. It changes nothing itself.
- **On fail**, it sends the findings back to the engineer and validates again. After two failed cycles it escalates to the owner.
- **On pass**, it hands off to the ui-validator for a user-visible change, or to the reviewer otherwise.

### 4. ui-validator

- **Runs the app in a real browser at real widths**, phone and desktop, in every theme the product has.
- **Checks** visual correctness, accessibility, usability and adherence to the token system.
- **Compares the page with its page doc:** the regions and their order, the copy as rendered and the phone presentation. Every drift is a finding that says whether the page or the doc is wrong.
- **Measures across states**, not only within each one: whether something stays where it was when the state changes.
- **Fixes small presentational issues itself:** copy, spacing, a token, an aria attribute. It lists every fix in its report, because the reviewer reviews the whole diff afterwards.
- **Sends anything else back.** A finding that changes behaviour or structure goes to the frontend-engineer, and the engineer's fix runs through the validator again.
- **Captures the screenshots** that the `ui-preview` skill sends to the owner.
- **Hands off** to the reviewer.

### 5. reviewer

- **Reviews the diff**, not the whole codebase, for correctness, maintainability, readability, duplication and adherence to the design doc.
- **Gives every finding a severity:** `critical`, `major`, `minor` or `nit`, with a location, the impact and a concrete fix.
- **Reviews the docs in the diff** against the standard, and checks that the tests would fail without the change.
- **Reports its findings.** Critical and major findings go back to the engineer and are fixed before the PR. Minor ones are fixed or go to `TODO.md`.

### 6. documentation-specialist

- **Runs after the reviewer passes**, invoked by the orchestrator.
- **Owns** the feature catalog, the feature docs, the page docs, the playbook, the link map and the docs checker.
- **Reviews** the docs the engineers changed against the standard in `.claude/agents/documentation-specialist.md`, and fixes them until the checker reports nothing.
- **Reports drift** in `docs/requirements.md` or `docs/overview.md` to the owner with proposed wording, and never edits those two files.

## Running to completion

The pipeline runs autonomously, from design to an open PR, without stopping for approval between steps. The owner reviews the result, not every intermediate step.

Escalate only when it is genuinely needed:

- The request conflicts with the requirements or the product's direction.
- The product direction is ambiguous and the options diverge in design, not merely in wording.
- The validator has failed twice on the same change.

Everything else becomes a stated assumption in the design doc or a resolved default the owner may veto. A design that blocks on the owner's answers stalls for days.

## Logging

Every agent step appends two lines to `logs.txt` at the repository root, one when it starts and one when it finishes:

```
[agent-name STARTED|DONE] (ISO-8601 UTC timestamp) comment (tokens used if possible)
```

The log is how a person, or a later session, reconstructs what happened and why. The squash before the PR folds the log commits into the logical commits.

## Concurrent agents share one tree

Several agents can run at the same time, often against the same working tree. Files can change under an agent mid-task. The rules:

- **Honour the path scope.** A brief that says "write only to these files" means it, even for a harmless typo fix elsewhere. Report the typo instead.
- **Re-read before editing.** A file read minutes ago may have changed.
- **Isolate the gates that matter.** Run a verification gate in a separate `git worktree` at a pinned commit, so a concurrent edit cannot change what is being verified.
- **Never `git stash` in a shared tree.** It takes other agents' uncommitted work with it.
- **Name cross-file risks in the design.** When a design touches a file another agent is editing, say so, and prefer rebasing over a cross-file refactor.

## What done means

A change is done when all of these hold:

- Tests are written in the same change and pass, and a bug fix's test fails on the unfixed code.
- The feature docs, page docs, catalog line and link map are updated, and the docs checker reports zero findings on them.
- Findings that outlive the task are in `TODO.md`, each with what it is, why it is open and who decides.
- Every agent step is in `logs.txt`.
- The branch is squashed into 1 to 5 logical commits and its tree is byte-identical to the original tip.
- The PR is open with a description from the `pr-description` skill.
- The `@claude` review has been triggered once CI is green, the session is subscribed to the PR's activity, and the PR is driven to green.
- For a UI change, curated screenshots have been sent to the owner in chat before merge, and the PR body says so.

The details of branches, commits and PRs are in [git and PRs](git-and-prs.md). The reasoning behind most of these rules is in [the lessons learned](lessons-learned.md).
