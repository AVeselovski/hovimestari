---
name: Recipes R2a (tab segments, recipe page, editor)
description: What the R2a slice cost a round trip: jsdom has no structuredClone, a held today ask eats presses, segment state vs a mocked router, dark shots reusing a stored light theme, <main> keeping the list's scroll, figure cells wrapping at 320, Playwright click scrolling, two "Amount" labels, the catalog typegen
type: project
---

- **jsdom has no `structuredClone`.** A fake server that cloned with it threw inside `getRecipe`, and the page showed its offline line, not a test error. Clone with JSON in test fakes.
- **A press right after mount can land while `useToday().holding` is true** (TodayProvider asks for today as the tree mounts). A star or archive press then does nothing. In a test, press inside a `waitFor` that checks the outcome, or wait for the ask first.
- **Segment state seeded from `?show=` must not record the user's own choice as "seen".** With `router.replace` mocked, setting `seen` on a choice made the next render reset to the URL's segment. Track only the URL value seen; a choice writes the URL.
- **`[role=tab]` behind an open sheet is aria-hidden**: query tabs from the DOM by text when a sheet is open.
- **A stored Playwright session carries `hovi-theme`.** The init script that set the theme only when absent kept "light" from the first login, so "dark" shots were light. Set it unconditionally per context.
- **`<main>` is the one scroller and Next keeps its scroll across a route change.** A recipe page opened from a scrolled list opened scrolled, hiding Back under the sticky title. The page scrolls main to the top on mount, and the list restores the row's scroll on Back (`lib/recipeNav.ts`).
- **Playwright's `click` scrolls the target into view first**, so a "scroll kept on Back" check reads the scroll at the press, not the one set before it.
- **Mono figures wrap at 320 in a three-column table.** "1095 kcal" broke to two lines and grew the card 24 px when stepping. `whitespace-nowrap` and `text-sm` on a phone, measured at 2, 3, 4, 5, 37 and 100 servings.
- **Two fields labelled "Amount" in one sheet** made Playwright's `getByLabel` ambiguous, and a screen reader too. Give each field its own name ("Number" for the written amount).
- **New catalog keys fail `tsc` until `npx next typegen`** rewrites `messages/en.d.json.ts`; deleting that file breaks setup.ts until it is generated again. ICU `{count}` types as string: use `{count, number}` or a plural to pass a number.
- **The orphan-key test cannot follow `t(variable)`.** Namespaces read by a variable key go in `DYNAMIC_KEY_NAMESPACES` with their call site.

**Why:** each cost a run or a wrong screenshot on this branch.
**How to apply:** before R2b, R4a or any page under the Recipes tab, and before taking theme screenshots with a stored session.
