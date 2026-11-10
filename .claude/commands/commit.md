Your goal is to stage, commit, and push your changes to the remote repository. Do not make any changes or fixes to the code without permission. If something looks off, ask first. NEVER commit unless asked to.

Do the following:

1. Stage only the files you changed: `git add <paths>`. Never `git add .` or `git add -A`. In a shared working tree they stage other agents' half-finished work.
2. Run `git commit -m "Your commit message"` to commit the changes with a descriptive message.
3. Run `git push origin your-branch-name` to push the changes to the remote repository.

Conventions for commit messages:

- Use one of these prefixes, with a capital first letter and a colon: `Feat:`, `Fix:`, `Docs:`, `Chore:`, `Refactor:`, `Test:`. Example: `Fix: resolve 401 retry loop in api interceptor`.
- If the unstaged changes contain separate logical changes, split them into multiple commits for clarity.
- Keep the message concise but descriptive of the change.

If on `master`, do the following:

1. Run `git checkout -b prefix/description` to create a new branch from `master` (`feat/short-description` or `fix/short-description`, lowercase with hyphens).
2. Stage only the files you changed: `git add <paths>`.
3. Run `git commit -m "Your commit message"` to commit.
4. Run `git push -u origin prefix/description` to push the new branch.

Never push directly to `master`.
