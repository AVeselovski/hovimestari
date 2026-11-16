# The app shell

The frame every signed-in screen sits in: a page title at the top, four tabs, and the page in between. On a phone the tabs are a bar at the bottom. From a tablet's width up they move to a rail on the left. Each tab page owns its own content, and the frame never changes to add one.

## In detail

### The tabs

**Day** opens first, at `/`. **Recipes**, **Groceries** and **Settings** follow. The current tab is drawn in the accent colour. Day, Recipes and Groceries say "Nothing here yet." until later steps fill them, and promise nothing about what is coming.

### The header

The current tab's name in the display face, large, over a dashed rule like the edge of a receipt. It stays in the same place on every tab, and so does the tab bar. Only the page between them scrolls.

### Offline

When the device is offline, or the server cannot be reached, one line under the header says "You are offline." It never covers the page and goes away when the connection returns. This holds on a device that was signed in. A device that was signed out, or never signed in, sees [the sign-in side](../features/installable-app.md#without-a-network) offline, never the tabs.

### When the server is at fault

When the server answers but cannot check the session, the tabs give way to a page titled "Something went wrong" that says "Hovimestari could not check your session. Try again in a moment." with a **Try again** button. Nobody is signed out.

### Sheets and dialogs

A task that needs a few fields or a confirmation opens over the page. On a phone it is a sheet that slides up from the bottom, with a drag handle at its top: a finger drags it down to close it. From a tablet's width up the same content is a dialog centred over the page. Its title stays at the top, its buttons stay at the bottom, and only what is between them scrolls.

A sheet with nothing typed into it closes on a swipe, a tap outside it or Escape. Once something is typed, all three are refused and the sheet springs back, so a stray gesture never throws away what was typed. **Cancel** always closes. While a save runs, nothing closes it.

### On a phone

The tab bar runs across the bottom: four equal cells, an icon over each label, each cell at least 56 pixels tall and a quarter of the screen wide. On an iPhone with a home indicator, the bar pads itself clear of it. The header pads itself clear of the status bar.

## How it works

### Route and entry

The signed-in routes are in `apps/web/src/app/(app)/`. Its layout wraps them in `AuthGuard`, then a query cache keyed by the signed-in user, then `AppShell`. `AuthGuard` decides what renders from the auth context's state:

- While the session is restored, a spinner.
- Without a session, nothing, while it sends the visitor to sign-in with [the redirect](../features/authentication.md#the-redirect-after-sign-in) for the path they opened. After signing out on this tab it sends them to the sign-in page the sign-out named.
- While the server is out of reach, the shell on a device with a known session, so the app opens offline. On any other device, `OfflineSignedOut` from `apps/web/src/components/auth/SessionStates.tsx`, titled "Not signed in" under the one offline line.
- On a server fault, `SessionProblem` from the same file, whose button calls the context's `retry`.

Between the query cache and the shell sits [the first-run gate](../features/targets.md#the-first-run-gate). An account without targets sees [the first-run page](first-run.md) in place of the shell, on the same address.

No signed-in page puts user data in its server-rendered HTML. Each renders on the device, behind the session, which is what lets the service worker cache pages.

### Layout

`AppShell` in `apps/web/src/components/shell/` is the full height of the viewport (`h-dvh`). `<main>` is the only scroll container, so the header and the tab bar never move. An open sheet locks `<main>` alone.

- Below `md`: `AppHeader`, `OfflineStrip`, `<main>`, then `TabBar`.
- From `md`: `SideRail` at the left, 14rem wide, with the wordmark and the same four links, and the header, the offline line and `<main>` beside it.
- `TabBar` is `md:hidden` and `SideRail` is `hidden md:flex`. Both are mounted and CSS shows one, so the first paint is right at any width.
- From `md` every tab shares one centred 40rem column, the header's, so the title sits at the same place on all four and the header's rule spans exactly the content under it. `PageContainer` holds the column and the one horizontal gutter.
- The rail's wordmark sits on the page title's baseline.
- The header, the tab bar and the rail sit at z-index 30, under the sheets at 50. The ladder is in `apps/web/src/components/ui/styles.ts`.

`tabs.ts` lists the four tabs, their paths and icons, and `tabOf()` names the tab a path belongs to.

### The sheet primitives

Every sheet and dialog is `BottomSheet` in `apps/web/src/components/ui/BottomSheet.tsx`, one wrapper around Base UI's `Drawer` (`@base-ui/react`, pinned to 1.8.0). Below `md` it hangs from the bottom edge. From `md` the same element is a centred panel, by CSS alone, so nothing remounts when the width crosses `md`. `ConfirmDialog` is a `BottomSheet` with Cancel and one action, labelled by its caller at rest and while it runs. `FormSheet` in `apps/web/src/components/ui/FormSheet.tsx` is a `BottomSheet` that holds one form: it takes the fields as a render prop, and the form's state and submit from its caller. It owns the dismissal rule, the focus policy, the form's id, the footer, the line for a refusal under the form, the hidden address password managers pair with a password, and a guard that ignores a second submit while the first one runs or while the promise its submit returned is pending. A secondary action, such as a delete, goes in `footerStart` and takes a row of its own in the footer above Cancel and Save. The slot stays enabled while a save runs, so its button locks itself. The other `BottomSheet` options pass through `sheet`: the panel width, which defaults to `md:max-w-sm`, `titleClassName` for the title's reserved room, `holdScroll`, a `headerNote`, a `stacked` sheet and `onClosed`. What a save does, and what follows it, stays with the sheet: it calls `onSaved`, then `onClose`.

Every form is a `FormSheet` and every confirmation is a `ConfirmDialog`. No screen builds an overlay of its own. A confirmation in front of a write that takes a row off the page uses `useConfirmedDelete`, which holds the target, the busy state, the failure shown inside the dialog and where focus goes after. The conventions every sheet keeps:

- **It stays mounted.** A caller renders the sheet while `useSheetTarget` (or `useRetainedValue`) holds the last open, drives `open`, and gives every open a fresh key. Base UI plays the slide only for a root that mounted closed, and a sheet that unmounts has nothing to slide out. A second tap on the opener while the sheet is open does nothing.
- **Dismissal.** `dismissible` is false while a form is dirty or saving, and Escape, the backdrop and the swipe are then refused with the sheet sprung back to rest. On Android the back gesture is refused once and then navigates, which is Base UI's behaviour and is kept.
- **Focus.** On a phone the sheet's body takes focus as it opens (`PromptSheetBody`), so no keyboard rises while the sheet is still moving. From `md` the first field takes it. A `ConfirmDialog` opens on Cancel, so Enter never confirms by accident. Every opener passes `returnFocusTo`, because WebKit never focuses a tapped button, and the sheet puts focus back there the moment it closes. A focus ring shows only after a keyboard close (`lib/lastInputModality.ts`). While a save runs its button is `aria-disabled`, not disabled, so a keyboard press on Save keeps focus there and inside the dialog, and a second press sends nothing.
- **Entry guards.** A tap outside is refused until the sheet is at rest (`useEntryPressGuard`). A destructive button takes a press only once the sheet is at rest, at least 500 milliseconds after it opened, and only for a press that started then (`useArmedAtRest`).
- **Keyboard.** A form sheet passes `keyboardAware`. Base UI's `Drawer.VirtualKeyboardProvider` keeps the focused field in view, and the footer pads by `--drawer-keyboard-inset`, so Save rides above the keyboard. The submit button sits in the footer, outside the form, and reaches it by its `form` attribute, so Enter in a field still submits. `useStillUnderFinger` holds the body still under a finger, so a tap is never lost to a scroll.
- **Stacking.** A sheet passed in `stacked` opens on top of its parent. Below `md` the parent shrinks about its top edge and still shows a strip above the one on top, and dragging the top sheet brings the parent back. A stacked sheet skips the `<main>` lock its parent already holds.
- **Scroll lock.** `useMainScrollLock` locks `<main>`, counted, and puts back its exact scroll position, because Base UI's own lock targets the document, which never scrolls here.
- **Size.** Below `md` a sheet stands at least `--sheet-min-height` tall above the home indicator and stops 1.5rem short of the top inset. Its two buttons are equal halves at least 44 pixels tall. From `md` the panel's top holds where it opened, so an error line grows it downward and nothing above moves (`useAnchoredPanel`). From `md` the panel sizes to its content up to 1rem short of the viewport above and below.
- **Fields.** Text is 16 pixels, so iOS never zooms. A number is a `DecimalField` and a date a `NativeDateInput`, both in `apps/web/src/components/ui/`, and [Numbers and dates](../../apps/web/README.md#numbers-and-dates) says how to use them. No field has a placeholder.
- **Nothing moves.** Every line under a field, every line that follows what a field holds, and a title that can change keep the room of their longest form at 320 pixels wide, whether or not they hold anything. A form keeps two lines for a refusal that belongs to no field. So a sheet rests in the same place before and after an error, and a line that appears moves nothing below it. `NativeDateInput` takes that room as `lineRoom`, and a title that changes takes it through `titleClassName`.

Every form sheet runs `describeFormSheetContract` from `apps/web/src/__tests__/formSheet.tsx`, the shared checks for all of the above that jsdom can see. The motion and the real geometry are checked in a browser.

### Safe areas

The header pads by `--safe-top` and the side insets, the tab bar by `--safe-bottom` and the side insets, the rail by `--safe-top` and `--safe-left`, the page gutter by the side insets, and a sheet's footer by `--safe-bottom`. The tokens come from `globals.css`, which is the only file that reads the device's insets.

### Data and refresh

The shell reads nothing from the server. The offline line follows `useOnlineStatus` and the auth context's `offline` state.

### Known gaps

- The safe areas are checked with injected insets in an emulator. A notched iPhone in standalone mode has not been checked yet.

## Features on this page

- [Authentication](../features/authentication.md): the session every tab sits behind.
- [Installable app](../features/installable-app.md): the offline line, the cached pages and the safe areas.
- [Appearance](../features/appearance.md): the theme every tab paints in.
