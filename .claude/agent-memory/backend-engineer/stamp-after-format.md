# Stamp a feature doc after the pre-commit formatter has run

The pre-commit hook runs prettier over staged docs. It reflows markdown tables when a cell grows, which changes the doc's SHA-256 after `APP_RULES_SOURCES` was stamped from the unformatted file. `appRules.test.ts` then fails in the next full run. Format the doc first (`pnpm exec prettier --write <doc>`) and stamp after, or re-read the hash after the commit. Cost a round trip on the week's average (2026-11-20).
