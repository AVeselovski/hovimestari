Your goal is to update any vulnerable dependencies in the project.

Do the following:

1. Run `pnpm audit` to identify vulnerable dependencies.
2. Apply the fixes that a plain update resolves (for example `npm audit fix`, `pnpm audit --fix`, or `yarn npm audit` followed by an upgrade). Do not take major-version upgrades without asking first.
3. Run the test suite, typecheck and lint to make sure the updates did not break anything.
4. Report what was updated and anything left unresolved, with the reason.

The audit command differs per ecosystem. Use the one that matches `pnpm`. Examples: `npm audit`, `pnpm audit`, `yarn npm audit`, `pip-audit` or `uv pip audit` for Python, `cargo audit` for Rust, `govulncheck ./...` for Go.
