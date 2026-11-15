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

### On a phone

The tab bar runs across the bottom: four equal cells, an icon over each label, each cell at least 56 pixels tall and a quarter of the screen wide. On an iPhone with a home indicator, the bar pads itself clear of it. The header pads itself clear of the status bar.

## How it works

### Route and entry

The signed-in routes are in `apps/web/src/app/(app)/`. Its layout wraps them in `AuthGuard`, then a query cache keyed by the signed-in user, then `AppShell`. `AuthGuard` decides what renders from the auth context's state:

- While the session is restored, a spinner.
- Without a session, nothing, while it sends the visitor to sign-in with [the redirect](../features/authentication.md#the-redirect-after-sign-in) for the path they opened. After signing out on this tab it sends them to plain sign-in.
- While the server is out of reach, the shell on a device with a known session, so the app opens offline. On any other device, `OfflineSignedOut` from `apps/web/src/components/auth/SessionStates.tsx`.
- On a server fault, `SessionProblem` from the same file, whose button calls the context's `retry`. A first-run gate for later steps goes between the query cache and the shell.

No signed-in page puts user data in its server-rendered HTML. Each renders on the device, behind the session, which is what lets the service worker cache pages.

### Layout

`AppShell` in `apps/web/src/components/shell/` is the full height of the viewport (`h-dvh`). `<main>` is the only scroll container, so the header and the tab bar never move. The sheets that arrive later lock `<main>` alone.

- Below `md`: `AppHeader`, `OfflineStrip`, `<main>`, then `TabBar`.
- From `md`: `SideRail` at the left, 14rem wide, with the wordmark and the same four links, and the header, the offline line and `<main>` beside it.
- `TabBar` is `md:hidden` and `SideRail` is `hidden md:flex`. Both are mounted and CSS shows one, so the first paint is right at any width.
- From `md` every tab shares one centred 40rem column, the header's, so the title sits at the same place on all four. Settings' content is capped at 36rem inside it, left-aligned with the title. `PageContainer` holds the widths and the one horizontal gutter.
- The rail's wordmark sits on the page title's baseline.
- The header, the tab bar and the rail sit at z-index 30, under the sheets at 50.

`tabs.ts` lists the four tabs, their paths and icons, and `tabOf()` names the tab a path belongs to.

### Safe areas

The header pads by `--safe-top` and the side insets, the tab bar by `--safe-bottom` and the side insets, the rail by `--safe-top` and `--safe-left`, and the page gutter by the side insets. The tokens come from `globals.css`, which is the only file that reads the device's insets.

### Data and refresh

The shell reads nothing from the server. The offline line follows `useOnlineStatus` and the auth context's `offline` state.

### Known gaps

- The safe areas are checked with injected insets in an emulator. A notched iPhone in standalone mode has not been checked yet.

## Features on this page

- [Authentication](../features/authentication.md): the session every tab sits behind.
- [Installable app](../features/installable-app.md): the offline line, the cached pages and the safe areas.
- [Appearance](../features/appearance.md): the theme every tab paints in.
