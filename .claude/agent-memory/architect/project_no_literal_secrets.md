---
name: No literal secrets in committed files
description: GitGuardian scans every PR and fails on any literal password, even a throwaway one in CI, compose, env examples, tests or docs
type: project
---

The repository runs a GitGuardian secret scan on every pull request. It flagged even a commented-out Postgres password variable in the CI workflow file (2026-11-15).

**Why:** a failed secret check blocks the PR, and finanssi's patterns (connection URLs with a password in them, `.env.test.example` with test JWT secrets) trip it.

**How to apply:** throwaway databases use `POSTGRES_HOST_AUTH_METHOD: trust` and password-less URLs. Test secrets and test passwords are generated at run time (`randomBytes`, `randomUUID`), never written in a file. `.env.example` secrets stay empty, filled by `pnpm env:init`. Runbooks generate secrets inline with `openssl rand -hex 32`. Check every design that adds config, fixtures or docs against this.
