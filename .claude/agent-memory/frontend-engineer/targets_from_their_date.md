---
name: Targets from their date (slice 1 web)
description: Owner decisions and gotchas from making a day before the first targets change a normal day without targets, and from the range face change
type: project
---

- **Owner decision, 2026-11-18: range lines set the figures and the unit in mono, "to" in the body face** ("'to' should not be monospace, the figures on both sides should"). He did not mention the unit, so it stays mono. Settings' rows and the Day summary's range label share `rangeFigure` (`components/figures/rangeParts.tsx`) through a `<num>` catalog part. Mixing the two faces at the same size changed no line box and no glyph top (measured at 320 and 390, both themes). Elsewhere a unit after a big figure is body face. Do not "fix" the range unit to match without asking him.
- **The frame must predict the layout.** A day without targets is shorter (64 px at 390, 80 at 375, 96 at 320), so the frame reads the cached changes (`noTargets.ts`). A day answering null while the cache says covered is `pending`: it holds the row's room, empty, and fetches the targets once per date. Never show a wrong start date.
- **`invalidateQueries` does not reach a `useQuery({ enabled: false })` observer.** In a suite without the gate nothing refetches. Use `client.fetchQuery({ ...targetsQuery(), staleTime: 0 })` for a one-off read. TodayProvider's own ask on mount also counts in `getTargets` call counts.
- **A button that must keep focus across a state change sits outside the state ternary**, at a fixed child slot (`TargetsSection`: `{data ? rows : unavailable}{data && <button>}`). Removing the first change used to flip the branch and drop focus to `<body>`.
- **The shell environment beats the env files** for `next build`, `next start` and the dotenv backend. Verify the port baked into the bundle with `grep -rl localhost:<port> apps/web/.next/static`. This corrects the older note in log_sheet_gotchas.md.
- **A Turbopack build panic, "ModuleId not found … invariant-error.js"**, came from a stale `.next`. `rm -rf .next` with no server on it, then build again.
- **A browser script that removes data is not rerunnable**, and a removed first change also takes the targets off the days you meant to show "with targets". Take the with-targets shots on a day after every change the run removes.
- **`getByText("1900 to 2200 kcal")` stops matching once a line is split into parts.** Match with a function on the element's whole `textContent`.
- **A refresh helper's `invalidateQueries` reads only days on screen, and a targets change is saved where none is.** Every cached day was only marked stale, so the Day tab opened today at 220 with no gauges and grew to 284 (measured at 390 against a build without the fix). `afterTargetsChange` now also calls `refetchQueries({ type: "inactive" })` on the days, only those with a `queryFn`: a day an entry write put in the cache by `setQueryData` has none, and refetching it retries and never settles, which hangs `FirstRunTargets`' await. Check other "after X" helpers the same way when X is saved off the Day tab.
- **The test setup sets `asyncUtilTimeout` to 5000, the same as Jest's test timeout.** A `waitFor` that never passes then fails as "Exceeded timeout", not by its assertion. Give a call-count `waitFor` its own shorter `{ timeout }` when the failure message matters (a mutation proof).
- **`pkill -f "next start"` leaves `next-server` holding the port.** Kill by pid after checking `/proc/<pid>/cwd`. The backend is three processes (tsx, node, esbuild).

**Why:** each cost a rerun or a wrong screenshot in this slice.
**How to apply:** read before slice 2 (`none` kind, Set targets, Settings' empty state) and before any change to range lines.
