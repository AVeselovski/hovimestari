---
name: write-tests
description: Use this skill to write tests for both backend and frontend code. Follow the testing conventions for each part of the codebase. Always write tests when adding new features or fixing bugs.
---

# Writing tests

Write tests in the same change as the code they cover. Tests are part of the implementation,
never a follow-up task. A new feature, a changed behaviour and a bug fix each arrive with the
tests that prove them.

## Conventions

- Place test files in a `__tests__/` directory **adjacent to the source file** they cover.
  If your ecosystem has a stronger convention (a `tests/` tree, `_test.go` siblings), state it
  in the project-specific section below and follow it everywhere.
- Name test files after the source file with a `.test` suffix (`format.ts` is covered by
  `__tests__/format.test.ts`).
- Test behaviour through the public API (the exported function, the HTTP endpoint, what the
  component renders and how it responds to the user), not implementation details.
- When you add, change, move or remove tests, update any test-structure section in the
  README so it reflects the current tests.

## What to always cover

- The happy path.
- Validation errors and rejected input.
- Server and dependency errors (the call fails, times out or returns something unexpected).
- The edge that motivated the change. For a bug fix, the exact case that was broken.
- Aim for at least 80% coverage of new code. Coverage is a floor, not the goal.

## Two failure modes that have shipped real bugs

Both produced a green suite over visibly broken UI. Check for them explicitly.

### 1. A mock that encodes the bug

A mock that models behaviour the real environment does not have will pass before and after a
fix, proving nothing. Example: a popover placement fix mocked the popover's own bounding box
growing when its dropdown opened. In the real browser the dropdown was absolutely positioned
and out of flow, so that box never grew. The test was green and the component was broken.

**A test that passes identically with and without the fix is not a test.** Mock only what the
test environment genuinely cannot do (layout, network, time), and mock it the way the real
thing behaves.

### 2. Per-state checks instead of across-state checks

A positioned component later jumped around the screen as the user interacted with it, because
it recomputed its position on every content resize. A sweep checked "is it on screen?" in each
state, and it was, in every single one. Nobody checked "is it in the same place as in the
previous state?"

For anything positioned, animated or stateful, assert the property that must hold **between**
states, not only within each one.

Corollary: for UI whose bug class only shows in motion or at real viewport sizes, unit tests
are not the gate. Drive it in a real browser at real widths and measure.

## Run the new test against the unfixed code

When fixing a bug, write the test first and run it against the unfixed code. Confirm it fails,
and fails for the right reason. Then apply the fix and confirm it passes. If you wrote the fix
first, run the test against the committed version of the file in a scratch copy or a
`git worktree`. Never `git stash` in a shared working tree, because a stash takes other agents'
uncommitted work with it. A test you never saw fail has not been shown to test anything.

The same discipline applies when crediting someone else's test in review:

- A substring assertion on a class or token list can match the opposite token (`md:hidden` is
  a substring of `max-md:hidden`). Split tokens and compare whole values.
- A fixture field the code under test never reads means the test asserts less than its title
  claims.
- Mutate the target code, rerun, and confirm the test goes red. Scope the mutation to the
  function under test and print the diff so you know it landed where you meant.

## Project-specific rules

Replace this section with the rules for your stack. Keep it short and concrete: the things a
new contributor would get wrong on their first test.

- Frontend runner: Jest 29 with React Testing Library
- Backend runner: Jest 29 with Supertest
- How to run one package's tests, and how to run them all.
- Module-system and mocking rules the runner imposes.
- Shared test helpers, fixtures and factories, and where they live.
- Anything that must always be mocked (routing, auth context, the clock).

Example from a TypeScript monorepo, to show the level of detail that belongs here:

> - Backend: Jest in native ESM mode. Use `jest.unstable_mockModule` (not `jest.mock`), import
>   `{ jest, describe, it, expect }` from `@jest/globals` explicitly, register mocks before any
>   `await import(...)` of the module under test, and load that module with a dynamic import.
> - Frontend: Jest with React Testing Library, transformed to CommonJS, so standard `jest.mock()`
>   works. Always mock the router hooks and the auth context hook in component tests.
> - Frontend tests import through the `@/` alias. Relative imports there take no `.js`
>   extension, because the frontend uses bundler module resolution.
