---
name: Food search near list
description: Gotchas from the "Other matches" list (foods with all words but one) in the food finder's results: hand-written searchFoods mocks, state kept in a child that unmounts, proving across-state position in a browser, reading rects before scrolling.
type: project
---

- **Every suite answers `searchFoods` by hand, about twenty of them.** `tsc` catches a missing field only where the mock is typed, and a seeded `{ foods: [] }` cache entry throws at the next food write.
  **Why:** the first run of the shape change left two seeded caches that only failed at runtime.
  **How to apply:** when the search answer changes shape, grep `searchFoods` and `foodSearch(` across every `__tests__` folder before trusting the typecheck.
- **State about a query belongs beside the `useQuery`, not in the child that renders its data.** The results unmount whenever the field drops under two characters, while the observer keeps the last answer as placeholder data. State in the child was set afresh at the next mount and named the new text over the old rows. The validator found it in a browser with answers held 2 s.
  **Why:** the first test only extended a text, so the child never unmounted and the suite was green.
  **How to apply:** for anything that says which text or id the data on screen answers, test the path through the empty state (clear, then type) with the next answer deferred.
- **Across-state proof in a browser without a second query.** Route `**/foods/search**` in Playwright and fulfil the real answer with `near: []`: the same foods with and without the list under them.
  **Why:** no real text gives the same foods in both states.
  **How to apply:** use a route that rewrites the real answer whenever a state depends on a field the server decides.
- **Read every rect before scrolling the body in a sweep.** An object literal built after `body.scrollTop = scrollHeight` reads scrolled tops, and a `p` matched by its text also matches the sr-only count line.
  **Why:** the first sweep reported first-row tops of -868 and took the spoken count for the visible line.
  **How to apply:** compute tops into constants first, then scroll, and leave `.sr-only` out of text matches.
