---
name: Recipes R4a (the as made sheet)
description: What the R4a slice (2026-11-22) cost a round trip or decided: three submit guards behind one double-press test, a hook guard TanStack already gives, the sign-up limiter in sweeps, POST /foods makes its own id, measuring a sheet mid-slide, the catalog's middle dot, toasts under a sheet, the 44 px row in the entry sheet
type: project
---

- **A double press on a form sheet's submit is stopped three times**: `FormSheet`'s own check, `useSubmitGuard.run`, and the sheet's `saving`. A mutation of one or two leaves the test green. To see it red, switch all three off, and say so in the report.
- **`client.fetchQuery` joins a read already out for the same key**, so a "busy" ref in a hook that reads before it opens a sheet tested green without it. It was removed. `useSheetTarget.open` already ignores a second open.
- **A failed read behind an open sheet must not be a toast**: the toast is under the sheet. `useCookSheet` takes `onReadFailed` and each host says it where its failures show (footer, status line, toast).
- **About ten sign-ups from 127.0.0.1 trip the backend's limiter.** A sweep that makes an account per width fails at the eleventh with `register 429`. Stop the backend by PID and start it again, then go on.
- **`POST /foods` ignores a sent id** and answers its own. Use the answer's id for a later `DELETE`.
- **A rect read while a sheet slides in is off by the slide.** Measure rows relative to the sheet body's own top, plus its `scrollTop`, and hold late reads with `page.route` and a sleep to prove "nothing moves as they land".
- **The date the day rows show is `formatDayShort`**, and the catalog's " · " renders tight in Instrument Sans everywhere. It is not a bug of a new string.
- **Decided: the row says "1 serving as made" only while `cook.differs`**, with no dot, so Activity's dot-separated line can say the same words. The entry sheet names the batch either way.
- **Decided, and filed for Artur: the as made sheet's three departures** (opening servings as text since attach cannot change them, the other servings last, Add servings adds under itself). The fourth, a first row that cannot be removed, was dropped in the fix round. Check `TODO.md` before R4b changes any of them.
- **The entry sheet's two actions share one row since the fix round** (see `recipes_r4a_fix_round.md`). R4b's Edit as made belongs in that row.
- **`FoodSheet.tsx` is at 500 lines, the limit.** The next change there has to fold its view mapping first.
- **A reserved line per row was not used for a batch's marks**: a left-out row keeps every line it showed instead, and a changed-then-left-out row says "Left out. Recipe: 60 g". A row that becomes changed still grows 20 px.

**Why:** each cost a run, a wrong first design or a claim that had to be corrected in R4a.
**How to apply:** before R4b (editing a batch), before any hook that reads before opening a sheet, and before a browser sweep that seeds more than ten accounts.
