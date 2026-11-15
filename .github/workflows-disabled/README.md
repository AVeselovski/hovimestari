# Parked workflows

This directory holds GitHub Actions workflows that are switched off. GitHub only reads
`.github/workflows/`, so a file here never runs.

## Why parked workflows live here

Commenting out every line of a workflow does not disable it. A file in `.github/workflows/`
with every line commented out is one GitHub cannot parse, so it creates a failed run on every
single push. Such a file sits quietly red for as long as it exists, and it trains everyone to
ignore a red check.

To switch a workflow off, move it here. To switch it back on, move it to
`.github/workflows/` and uncomment it.

## What is parked here

`claude-code-review.yml` reviews every pull request automatically when it opens or changes.
It is parked because the pipeline's `reviewer` agent already reviews every change before the
PR opens. An automated review on every PR open would spend review on work that is already
reviewed and on builds that are not yet green. Review by comment runs on demand, once CI is
green: comment `@claude please review this PR.` and the live `.github/workflows/claude.yml`
runs the review.

Restore it only if the project moves to review on open.
