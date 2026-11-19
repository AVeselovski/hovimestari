---
name: Copy sheet (PR 3d slice B-web)
description: What the copy sheet's build and fix round taught: date inputs raise no keyboard, commit before mutation runs, refusals in the footer, fieldset min-w-0, held exits to prove the toast waits, sheet-owned ids, accent is the error colour
type: project
---

- **Base UI's keyboard provider ignores `type="date"`** (`KEYBOARD_INPUT_TYPES` in `DrawerVirtualKeyboardProvider`). A form sheet of a date and boxes cannot pass the contract's keyboard check. `describeFormSheetContract` now takes `keyboardField: null`, which asserts the form holds no keyboard field instead. Do not add a text field to satisfy a test.
- **Commit before a mutation run.** Auto mode refused `git checkout -- <file>` on a file with uncommitted work (it would have lost the work). Commit, mutate with python or sed, run, then restore with `git checkout --`.
- **Proving "cleanup before the toast"**: the cleanup's mock request is called synchronously inside the copy, so "no toast at call time" passes even when the cleanup is fire-and-forget. Hold the cleanup's answer with a deferred and assert no toast and the sheet still busy until it resolves.
- **A reserved empty line under a control read as a 26 px gap** on the production build (the owner's density rule). Give a refusal-only line no room (`hidden` until it shows) when it sits mid-form.
- **Copy ids belong to the sheet, never `pendingIds`**: `forgetSeen` frees an id on any read of a day holding it, and the target is usually the read-ahead next day. Key the id by `date|sourceId`, keep every id sent with its date, and drop ids from "sent" when the press sent nothing (offline, held).
- **A fieldset grows to its widest unbreakable content** (`min-inline-size: min-content`). Every fieldset needs `min-w-0`, and a name in a sheet wraps (`line-clamp-2 break-words`) rather than `truncate`. jsdom cannot see it: measure body `scrollWidth` in a browser with a 60-character name.
- **Proving "the toast waits for the slide-out" needs `holdSheetExits()`.** Without it jsdom ends the exit at once, so a MutationObserver that counts dialogs when the toast appears passes with `announce()` called directly. The toast itself is `role=dialog`; exclude `[data-toast]` when counting sheets.
- **A refusal that belongs to no field goes in the FormSheet footer** (`setFormError({ line, cause: null })`), never mid-body: a mid-body line moves the list under the finger as it shows and clears.
- **In this app the accent is also the error colour** (`inputClass` has `aria-invalid:border-accent`, `docs/app/colors.md`). A reviewer coming from finanssi may flag an accent invalid border as "selection colour"; it is correct here.
- **`env -u NODE_ENV exec pnpm ...` fails with 127**: `exec` is a shell builtin. Unset in the shell, then `exec`.

**Why:** each cost a rerun or would have shipped a test that proves nothing.
**How to apply:** before any form sheet without text fields, any write with an id the client mints, and any mutation run.
