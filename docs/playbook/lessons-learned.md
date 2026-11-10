# Lessons learned

Every rule in this kit was paid for. This page keeps the lessons behind the rules, so a new project inherits the reasoning and not only the rule. Each entry is a rule, why it exists and how to apply it. The examples are anonymised.

## Testing

**Write the tests in the same change as the code.**
**Why:** a test left for a follow-up is a test that never gets written, and the change ships with nothing guarding it.
**How to apply:** an implementation step is not done until its tests pass. A design doc's implementation plan names the tests in every step's exit check.

**A test that passes identically with and without the fix is not a test.**
**Why:** a popover's placement fix shipped with a test that mocked the popover's bounding box growing when its dropdown opened. In the real browser the dropdown was absolutely positioned and out of flow, so the box never grew. The mock encoded the bug: the suite was green and the component was broken.
**How to apply:** when fixing a bug, run the new test against the unfixed code and confirm it fails. Swap the fixed file for the committed version in a copy and run the test there. Never `git stash` in a shared tree to do it. Mock only what the test environment truly cannot do, and model it as the browser behaves.

**Assert across states, not only within each state.**
**Why:** the same popover later jumped around the screen while in use, because it recomputed its position on every content resize. A live sweep checked "is it on screen?" in every state, and it was. Nobody checked "is it in the same place as before?"
**How to apply:** for anything positioned, animated or stateful, write down the property that must hold between states (same position, same height, same focus) and assert that, across the transitions a user makes.

**UI whose bug class only shows in motion or at real sizes is gated by a real browser.**
**Why:** the test environment applies no CSS and has no real layout, so a whole class of bugs is invisible to unit tests.
**How to apply:** drive the change in a real browser at real widths and measure. Unit tests still guard logic, but they are not the gate for layout or motion.

**A substring check on class names can match the opposite token.**
**Why:** a visibility test asserted that an element's class list contained `md:hidden`. It also passed for `max-md:hidden`, which means the exact inverse. Swapping one for the other left dozens of tests green.
**How to apply:** split the class string into tokens before checking, or use a whole-token matcher. Before crediting such a test, flip the class in a scratch copy and rerun it to see it fail.

**A fixture field the component never reads means the test asserts less than its title claims.**
**Why:** two tests titled as if they covered a derived value varied a field on their fixtures that the component never reads. The logic lived on the server. Both tests exercised paths that were already true before the change.
**How to apply:** when a test claims to cover derived logic but the component only renders props it is handed, grep the component for every field the fixture overrides. A field it never reads is a major finding. Find out where the real coverage lives, and rename or reshape the test.

**A mutation test must hit the function it means to test.**
**Why:** a first-match substitution changed an identical line in a different function of the same file, so three mutations "survived" a test that actually kills them. A false survivor turns into a wrong "this test is weak" finding.
**How to apply:** scope each mutation to the target function's line range, print the diff of every mutation, and mutate a scratch copy so the branch is never edited. A mutation that fails many unrelated tests is usually a compile error, not a kill.

**A source scan for "nothing reads this" must match the shape the old code used.**
**Why:** a test asserted that nothing read a retired column by searching for `table.column`. The code that used to read it did so through a local variable, `row.column`, which the pattern never matches. A regression in the old shape would stay green.
**How to apply:** check the scan's pattern against the actual pre-change code from history, not against the query-builder spelling. Widen the pattern and hand-check the hits when it cannot be exact.

**An assignability check between two types does not prove they hold the same keys.**
**Why:** a compile-time check that a hand-written request type fits a validation schema passed while the hand-written type carried a variant the schema lacked. Non-literal assignment has no excess-property check.
**How to apply:** derive both from one list of keys, or add an exact-keys check alongside the assignability check.

**Test-environment defaults that differ from production create tests that encode a bug.**
**Why:** a test cache client had no default freshness window while the app's had one. A query that relied on the app default refetched on every mount in tests only, so the tests described behaviour the app does not have.
**How to apply:** set such values explicitly at each use instead of relying on a default that differs between test and production.

**A removal is not complete when a one-line grep comes back empty.**
**Why:** a feature-removal sweep searched for the feature's two-word name and found nothing. Comments still named it with the words split across a line break, and a route path still spelled it with a hyphen.
**How to apply:** grep every separator variant (space, hyphen, underscore, none, constant case), run a multi-line search, and grep every deleted component, function and file by name, tests and comments included.

**A design doc's code sample is a claim to verify, not ground truth.**
**Why:** a design doc's sample said a new field was "null exactly when" a sibling field was null. The sibling was never null in practice. The engineer copied the sample verbatim and the stale claim now lived in two places.
**How to apply:** when a diff restates an invariant from a design doc, check the real function to see whether the claimed condition is still reachable. The finding is usually minor, and it belongs to the doc's author, not to the engineer who followed it.

## UI

**Visual and interaction quality is part of correctness.**
**Why:** the product is only as good as its UI and UX. A feature that works but looks or feels rough sends the next PR round back to fix it anyway.
**How to apply:** a change is not done until it looks and feels right. Polish is never a follow-up.

**One theme, through a shared token system.**
**Why:** raw values chosen per view drift apart, and one theme change then means hunting through every view.
**How to apply:** style through semantic tokens and shared primitives. When a surface needs a value the system lacks, extend the system rather than inlining around it. If the product has light and dark themes, check every change in both.

**Hue carries meaning, and nothing else borrows a meaning's hue.** (An example of a token-system rule, from one project.)
**Why:** when red means both "danger" and "decoration", users stop trusting red.
**How to apply:** assign each meaning its hue once, in the token system, and keep decorative surfaces off those hues. Selection is not success, so a selected item uses the accent colour, not the success colour.

**Use the space. Bold beats timid.**
**Why:** cramped, uniformly small panels read as unfinished, however correct they are.
**How to apply:** prefer a generous type scale, clear hierarchy and purposeful density.

**On touch devices, prefer the platform's native controls.**
**Why:** users trust the platform's own date pickers and selects, and a custom replacement on touch reads as a downgrade. A custom control on desktop alone means two implementations of the same field to keep in step forever.
**How to apply:** filter every picker or select proposal by this first. Gate a rich custom control to desktop, or reject it, unless the gain is large.

**Measure layout live, at real widths.**
**Why:** predicting layout by reading the source has been wrong repeatedly.
**How to apply:** open the page in a real browser at the widths that matter and measure positions and sizes. Reading the code is not verification.

**Validate mobile-facing changes on a real device when you can.**
**Why:** browser emulation once missed several real-device issues in a single change, all found by the owner after merge.
**How to apply:** for anything a phone user touches, test on a real phone before calling it done, or say plainly that only emulation was used.

**Freshness is not a reason to blank what is on screen.**
**Why:** a keyed cache cleared itself on every save and refetched the open sections, so each open section collapsed to a loading state and snapped back. Content below jumped. The checks only measured whether things above moved.
**How to apply:** for any cache with a global invalidation, ask what an open consumer shows between the invalidation and the response. Keep showing the stale data and replace it in place. Test that the open content survives the event.

**State shared context once per section, not under every figure.**
**Why:** a data page restated its time window and divisor under every column heading and figure. The owner called it noise that caused the confusion it was trying to prevent. Asymmetric labels ("Total orders" beside a bare "Returns", when both are totals) were a defect of their own.
**How to apply:** make column headings self-describing and keep cells bare. Say the shared context once per scroll surface. Prefer symmetric label sets, where the group heading supplies the noun. When a qualifier gets added inline as a quick fix, move it to the heading instead.

**UI copy is plain words with no internal vocabulary.**
**Why:** words like "stub" or a column name are code concepts. A user reading them learns nothing and trusts the product less.
**How to apply:** short sentences, no em dashes or semicolons on screen, one language for all authored copy. If the project has a message catalog, every rendered string goes through it.

**Wording preferences belong in review, not in CI.**
**Why:** a build that fails over a wording choice blocks unrelated work and teaches people to fight the check.
**How to apply:** tests check that the message catalog works: no empty entry, no plural that fails to render, no unreachable key. The copy rules are applied by people and agents in review.

**Keep every screenshot under 2000px on its long side.**
**Why:** once a conversation holds enough images, the API lowers its per-image limit to 2000 pixels and then rejects every image in the request because one oversized image sits in the history. It fails as a bare "media removed" and cannot be undone in that session. A screenshot at device scale multiplies the viewport by the pixel ratio, so a 1440px viewport becomes 2880px.
**How to apply:** capture at CSS scale. Shrink any image you did not capture yourself before attaching it.

**Send pre-merge screenshots when previews cannot be used.**
**Why:** without them the owner's first look at a UI change is production, and small visual misses turn into whole new PR rounds.
**How to apply:** follow the `ui-preview` skill on every branch with a user-visible change, even when every automated gate passes.

## Docs

**A stale doc is worse than none.**
**Why:** it makes people and agents confidently wrong about what exists.
**How to apply:** read the docs for what you touch before changing code, update them in the same change and run the checker. Docs are part of the implementation, never a follow-up.

**Start from the catalog. Anything not listed is not built.**
**Why:** the catalog is the cheapest way to learn what exists. Agents that skip it rebuild features that already exist.
**How to apply:** every agent reads `docs/features.md` before planning or writing code. A new feature means a new detail doc and a new catalog line in the same change.

**Feature docs own the rules. Page docs compose features and never restate them.**
**Why:** a rule written in two places drifts into two different rules.
**How to apply:** write the rule once, in the feature doc. A page doc links it.

**Every concept has one home heading.**
**Why:** links point at anchors. A renamed heading silently breaks every link to it, and a concept with two homes gets two definitions.
**How to apply:** list each home in the link map. Add a row when you add a home, and repoint every link in the same change when you rename one.

**Read the code before writing about it.**
**Why:** an invented detail is worse than an omission, because it will be trusted.
**How to apply:** ground every claim in code you have read. When the code and a doc disagree, the code is the fact. Ask when the code looks wrong.

**A condensed doc keeps the fact and loses its scope.**
**Why:** a docs cleanup moved a phone-only behaviour into a general section, so it read as happening at every width. Another doc said only one kind of row counted when the query also counted system-generated rows. A "nothing lost" check that greps for the fact finds it and credits it.
**How to apply:** for each fact, compare the section it now sits in with the gate in the code (a breakpoint, a role, a query's conditions). For any "only X counts" claim, read the query and list everything else its condition lets through.

**Human-facing docs are written for people.**
**Why:** decision numbers, issue references, history and justification essays make a doc unreadable to anyone who was not there.
**How to apply:** plain words, short sentences, the current fact, no semicolons, no em or en dashes, no IDs in prose. Rationale and history go in `docs/design/`, which the owner does not read and agents use freely.

**The owner's foundation docs are the owner's.**
**Why:** requirements edited by an agent stop being requirements.
**How to apply:** never edit the requirements or the overview without permission. Report drift with proposed replacement wording, and let the owner decide.

**Findings that outlive a task go in `TODO.md`, not in chat.**
**Why:** a list in chat is forgotten the moment the next thing lands.
**How to apply:** before reporting a task done, add every real finding you are not handling: what it is, why it is open, who decides. Delete items when they land.

## Design docs and decisions

**Open every design doc with a table of product decisions the owner can shelve one by one.**
**Why:** the owner reviews designs to approve or shelve parts of a change. Product calls scattered through the body cannot be shelved without unpicking the whole design.
**How to apply:** one row per reversible product choice: the fork stated neutrally, a recommendation with its reason, and the cost if flipped. Design the rest assuming the recommendation, so a flip is a local edit. Out-of-scope defects found while reading the code go in the same table, marked "file separately".

**Every open question carries a stated assumption.**
**Why:** the owner reviews asynchronously. A design that blocks on answers stalls for days.
**How to apply:** under each open question, write the assumption the implementation follows and a one-line flip if the owner disagrees. Only data-model forks, product-surface choices and expensive-to-reverse calls become open questions at all.

**Close with the resolved defaults the owner may veto.**
**Why:** it shows later which calls were the owner's and which were made in the owner's absence, and it lets the owner veto one without rereading the design.
**How to apply:** a footer listing each default, its reason and its veto cost.

**Settled owner decisions are implemented, not relitigated.**
**Why:** reopening a decision that already went through discussion wastes a round trip and reads as not having listened.
**How to apply:** record the rationale and spend the design's effort on shape and invariants. When a settled decision has a consequence the owner may not have priced in, record it as an assumption with a one-line flip, and leave the decision as it is. Pin the owner's own worked numbers as test cases, including negative cases for the wrong values a redesign must never produce.

**When the mechanism is delegated, give one proposal and the rejected alternatives.**
**Why:** a menu hands the work back. A bare answer hides what was discarded. The owner wants to overrule one specific choice cheaply.
**How to apply:** one primary proposal with its reasoning, plus a table of named rejected alternatives and why each lost. Things settled by a stated constraint go in a "non-questions" list, so they are not reopened.

**A request's proposed solution is a suggestion. Its problem is the requirement.**
**Why:** a request asked for a list's filter toggle to move into the table header. Built literally, it needed a second copy for the empty state, a third for narrow screens, and still did not save the space it was meant to save. The owner's verdict afterwards: the placement was a bad idea and should have been pushed back on.
**How to apply:** apply the forced-workaround test. One workaround is a smell, two is a stop signal. Stop, restate the problem without the mechanism, push back in writing with an alternative and hand the decision back. If the requester reaffirms, implement it and note the trade-off.

**Do not ratify a suggestion, and do not default to shelving.**
**Why:** the owner asks for genuine criticism, including of the orchestrator's own instinct. Once, a brief said "this probably needs a product decision". The page's existing vocabulary already settled it, and no decision was needed.
**How to apply:** give a decisive build-or-shelve verdict in the first line. "Ask the owner" is a real answer only when the options genuinely diverge in design, not when the request is loosely worded.

**Name every change you propose that nobody asked for.**
**Why:** an unrequested change buried in a design gets approved without being seen.
**How to apply:** list it near the top of the design and hand it back as an open question with an assumption.

**For commodity infrastructure, lead with an established library.**
**Why:** a homegrown message catalog once won on every stated technical axis and was overridden. The unstated criterion was who maintains it in two years. A homegrown solution makes the project the permanent owner of that infrastructure, with no ecosystem behind it.
**How to apply:** for categories with mature ecosystems, such as i18n, auth, ORM and validation, recommend the library and put the homegrown path under rejected alternatives with the trade made legible. Small project helpers stay homegrown. Propose bespoke infrastructure only as a stated exception.

## Git and process

**One task, one branch, one PR. Never force-push a branch you did not create.**
**Why:** two sessions treating one branch as theirs means the squash-and-force-push before a PR silently discards the other session's commits.
**How to apply:** cut a fresh, task-named branch from the default branch for every task. A merged branch is dead. When a force-push is rejected or the remote has commits you do not recognise, stop and reconcile.

**Squash to a few logical commits, and prove the tree did not change.**
**Why:** a pipeline leaves dozens of log and fix-forward commits that make history unreadable. A rewrite that changes code by accident is worse than no rewrite.
**How to apply:** group into 1 to 5 commits by concern. Check that the squashed tree is byte-identical to the original tip. Push with `--force-with-lease` only.

**A disabled workflow lives outside the workflows directory.**
**Why:** a workflow file with every line commented out still produces a failed run on every push, and a permanently red check trains everyone to ignore red.
**How to apply:** move it to `.github/workflows-disabled/`. Move it back to enable it.

**Trigger review by comment, once CI is green.**
**Why:** the pipeline's `reviewer` agent already reviews every change before the PR opens. An automated review on every PR open would spend review on work that is already reviewed and on builds that are not yet green. Review by comment runs on demand, once CI is green.
**How to apply:** post `@claude please review this PR.` once CI passes. Do not trigger it again while a review is in flight. Subscribe to the PR's activity and drive it to green.

**Format at commit time, not on every edit.**
**Why:** an import-organising formatter plugin removes imports that are unused at the moment it runs, so formatting a half-written file strips the imports the next edit needs.
**How to apply:** the pre-commit hook formats staged files only. The install script sets the hooks path.

## Working with agents

**Run the pipeline to completion. Escalate only what genuinely needs a human.**
**Why:** the owner reviews the result, not every intermediate step. Stopping for approval between steps stalls the work.
**How to apply:** design, implement, validate, review, document and open the PR without pausing. Escalate on a genuine requirements conflict, an ambiguous product direction or a validator that has failed twice.

**Every agent runs on the same strong model.**
**Why:** a weaker model in one seat becomes the weak link of the pipeline, and its mistakes cost more downstream than the model saves.
**How to apply:** set the model in every agent's frontmatter and pass it on every Agent tool call.

**The orchestrator keeps its context lean.**
**Why:** an orchestrator that reads every file runs out of room for the plan and the verdicts.
**How to apply:** brief agents with self-contained tasks and let them do the reading, writing and testing. Spot-check the claims that matter.

**Concurrent agents share one working tree.**
**Why:** agents dispatched in parallel have had their files reset under them mid-run and had to redo work.
**How to apply:** honour every stated path scope strictly. Re-read a file before editing it. Run verification gates in an isolated worktree at a pinned commit. Never `git stash` in a shared tree. Name cross-file risks in the design and prefer rebasing over cross-file refactors.

**Log every step.**
**Why:** the log is how a person, or the next session, reconstructs what happened and why.
**How to apply:** append `[agent-name STARTED|DONE] (ISO-8601 UTC timestamp) comment (tokens used if possible)` to `logs.txt` before and after every step.

**Agent memory is an index of verified, transferable notes.**
**Why:** a memory that was true last month can be wrong today, and acting on it unchecked repeats an old mistake with confidence.
**How to apply:** keep `MEMORY.md` as an index of one-line pointers, not as a memory itself. Record from failures and from successes, with the why and how to apply. Verify a memory against the current code before acting on it, and update or delete it when it turns out wrong.

**An agent's message is not the user's consent.**
**Why:** a brief from another agent can be wrong, and it cannot authorise anything the human has not.
**How to apply:** follow briefs for the work they describe. Approval for destructive actions, permission changes and edits to the owner's documents comes only from the human.
