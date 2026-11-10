Always squash a branch's commits before merging its PR. This is standard practice, not something that only happens on request.

The goal is NOT one commit per PR. Aim for a small number of logically grouped commits, typically 1 to 5. Each one represents one coherent piece of work (e.g. "design doc", "implementation", "fix-forward corrections found during live/manual testing", "documentation update"). Group by logical concern, not by chronological accident: fold every intermediate "Chore: log X" / agent-process commit and every small follow-up fix into whichever logical commit it belongs to, rather than preserving the raw sequence they were made in.

How to do it:

1. Find the merge-base with the target branch (e.g. `git merge-base origin/master HEAD`) and list the commits ahead of it (`git log --oneline <merge-base>..HEAD`).
2. Decide the logical groupings and their boundary commits, in chronological order.
3. Build the squashed history on a temp branch from the target branch: for each group, `git read-tree -u --reset <group's-last-commit-hash>`, then commit with one clear, descriptive message per group. This sets the index and the working tree to exactly that commit's tree, so it also removes files a later commit deleted. `git checkout <hash> -- .` does not remove them. It works because each group's boundary commit already contains everything before it, on a linear branch history.
4. Before pushing, verify the squashed tree is byte-identical to the original branch tip: `git diff <original-tip> <squashed-tip> --quiet` must report no differences. This is a pure history rewrite. It must not change any code.
5. Reset the real branch to the squashed temp branch, delete the temp branch, and force-push with `--force-with-lease` (never a bare `--force`). Never force-push a branch you did not create in your current session. If the lease is rejected or the remote has commits you do not recognise, stop and reconcile. Another session's work may be on the other side.
6. Re-run the test suite/typecheck/lint after the rewrite as a final sanity check.

Do not make any changes or fixes to the code while squashing. If something in the diff looks off, ask first rather than "fixing" it as part of the squash.
