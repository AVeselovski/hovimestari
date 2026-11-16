# @hovimestari/web

The web app and installable PWA: Next.js 16 with the App Router, React 19, Tailwind CSS 4, TanStack Query and `next-intl`. It talks to the backend in `apps/backend`, directly for ordinary calls and through its own route handlers for anything that carries a refresh token. Feature behaviour lives in the [feature docs](../../docs/features.md) and the pages in the [page docs](../../docs/app/shell.md). This README covers the source layout, the session, copy, running the app and tests.

## Source structure

```text
messages/
└── en.json                     The message catalog: every string the app renders
public/
├── sw.js                       The service worker: network-first pages, cache-first assets, nothing under /api/
└── icon-192.png, icon-512.png  The app icons
src/
├── app/
│   ├── layout.tsx              The document: fonts, viewport, the pre-paint theme script, the providers
│   ├── globals.css             The design tokens, the safe-area and motion tokens, and the sheet motion utilities
│   ├── manifest.ts             The web manifest at /manifest.webmanifest
│   ├── not-found.tsx, error.tsx, global-error.tsx  The page for an unknown address and the two error pages
│   ├── fonts/                  Fraunces, Instrument Sans and JetBrains Mono, variable woff2
│   ├── auth/(guest)/           Sign in, sign up and forgot password, behind GuestGuard
│   │   └── layout.tsx          Reads on the server whether Google is offered
│   ├── auth/reset-password/    Choose a new password, open with or without a session
│   ├── (app)/                  The signed-in tabs, behind AuthGuard and inside the shell
│   │   ├── layout.tsx          AuthGuard, then the per-user query cache, then AppShell
│   │   ├── page.tsx            Day
│   │   ├── recipes/, groceries/  The two other content tabs
│   │   └── settings/           Settings: Appearance, Sign-in methods and Account, and their sheets
│   └── api/auth/               The session route handlers
│       ├── _constants.ts       Cookie names, paths, lifetimes and attributes
│       ├── _guard.ts           The same-origin guard every POST handler runs first
│       ├── _relay.ts           relay(): the call to the backend with the secret and the client address
│       ├── _session.ts         Turns a backend grant into the cookie and the browser's session
│       ├── sign-in/, sign-up/, refresh/, sign-out/   POST handlers
│       ├── google/start/, google/complete/           The two ends of Google sign-in
│       └── google/link/start/, google/link/complete/ The two ends of linking Google, bound by a nonce cookie
├── components/
│   ├── AuthGuard.tsx           Renders the app when signed in, or offline on a device with a known session, else the guest side or sign-in
│   ├── auth/                   AuthPage, the guest frame, and the offline and server-fault pages
│   ├── form/                   The form parts the guest pages and the sheets share:
│   │   ├── Field.tsx           A labelled input with one line under it for its hint or its error
│   │   ├── FormError.tsx       The announced line under a form for a refusal that belongs to no field
│   │   ├── focus.ts            focusField(): puts focus in a field by its id
│   │   └── issues.ts           firstIssues() and passwordFieldError(): a schema's or the server's error, per field
│   ├── ErrorFrame.tsx          The body of the error pages
│   ├── GuestGuard.tsx          Renders a guest page, or sends a signed-in visitor on
│   ├── FullPageSpinner.tsx     What shows while the session is restored
│   ├── GoogleSignInButton.tsx  "Continue with Google", when the deployment offers it
│   ├── Icon.tsx                The outline icon set
│   ├── QueryProvider.tsx       The query client for one signed-in user
│   ├── ServiceWorkerRegistration.tsx  Registers sw.js in production builds
│   ├── shell/                  AppShell, AppHeader, TabBar, SideRail, NavLinks, OfflineStrip, EmptyTab, tabs.ts
│   └── ui/                     Card, EmptyState, PageContainer, StableLabel, ThemeToggle, styles.ts, and the overlays:
│       ├── BottomSheet.tsx     The one sheet and dialog primitive, on Base UI's Drawer
│       ├── ConfirmDialog.tsx   A BottomSheet that asks before a consequential action
│       ├── FormSheet.tsx       A BottomSheet that holds one form: every form sheet is one
│       ├── PromptSheetBody.tsx A form sheet's body, which takes focus on a phone so no keyboard rises mid-slide
│       └── FormSheetActions.tsx  Cancel and the submit button in a form sheet's footer
├── contexts/
│   ├── AuthContext.tsx         The session: status, user, signIn, signUp, signOut, renewal and its retries, all under one lock
│   ├── ThemeContext.tsx        The theme choice, data-theme and the browser chrome colour
│   └── ProvidersContext.tsx    Whether the guest pages show Google
├── hooks/                      useErrorCopy, useOnlineStatus, useRovingChoice, useMediaQuery, useIsMobile, and the sheet hooks:
│   ├── useSheetTarget.ts       A kept-mounted sheet's open state: a fresh key per open and the control that opened it
│   ├── useRetainedValue.ts     The last non-null value, so an overlay slides out with its content
│   ├── useFormDirty.ts         Whether a form holds unsaved input
│   ├── useConfirmedDelete.tsx  A confirmation in front of a write that takes a row off the page, and the write
│   ├── useArmedAtRest.ts       A sheet's action takes a press only once the sheet is at rest on a phone
│   ├── useEntryPressGuard.ts   A press outside a sheet is refused until it has slid in
│   ├── useMainScrollLock.ts    The counted lock on <main> while an overlay is open
│   ├── useStillUnderFinger.ts  No scroll by code while a finger is on the screen
│   ├── useAnchoredPanel.ts     Holds a centred panel's top where it opened
│   └── useScrollHold.ts        Keeps a scrolled container still when its content shrinks
├── lib/
│   ├── api.ts                  The axios client: bearer token, one shared renewal on a 401
│   ├── api/                    The calls, one file per area: auth.ts, users.ts
│   ├── errors.ts               getErrorCode, getErrorStatus, AuthRequestError
│   ├── errorCopy.ts            Which error codes have catalog copy
│   ├── providers.ts            Reads GET /auth/providers on the server
│   ├── queryClient.ts          The query client's defaults
│   ├── queryKeys.ts            Every query key, from one factory
│   ├── queryOptions.ts         The options for every read
│   ├── redirect.ts             Resolves a redirect target and keeps it only when it stays on this site
│   ├── sessionMarker.ts        The non-secret flag that says this device has a known session, and its address
│   ├── invalidation.ts         What each write makes stale
│   ├── forgetDevice.ts         Drops the cached signed-in pages after the account is deleted
│   ├── googleLink.ts           The results a Google link comes back with
│   ├── focus.ts                Whether focus is still inside an overlay, so closing it puts focus back only then
│   ├── focusAfterRemoval.ts    Where focus goes when a row leaves the page
│   ├── lastInputModality.ts    Which input the reader last used, so a focus put back after a tap paints no ring
│   ├── backend.ts              The backend's URL for server code, which production refuses to guess
│   └── theme/noFlashScript.ts  The pre-paint theme script and its storage key
├── __tests__/
│   ├── setup.ts                Runs before every test file: the real catalog and a query client per render
│   ├── sheet.ts                Drives sheets through Base UI's own code: swipes, presses outside, exits, focus
│   └── formSheet.tsx           describeFormSheetContract, the checks every form sheet runs, and stubPhone
├── i18n/request.ts             Pins the catalog's locale to English
└── global.d.ts                 Types the catalog's keys
```

## The session

No browser JavaScript holds a refresh token. Signing in, signing up, renewing and signing out post to the route handlers under `/api/auth/` on this origin. They relay to the backend with `BFF_SECRET` and the browser's address, keep the refresh token in the `httpOnly` cookie `__refresh_token`, and hand the page the access token and the user. The access token lives in memory in `AuthContext`, never in storage. Every other call goes straight to the backend through `lib/api.ts` with the token as a bearer. How the relay, the guard and Google sign-in work is in [the authentication feature doc](../../docs/features/authentication.md#the-browser-session-through-the-web-server).

Rules that bind every change:

- A new route handler that accepts a POST runs `requireSameOrigin` from `_guard.ts` first. `allHandlersGuarded.test.ts` finds every handler and fails otherwise.
- A response body never carries the refresh token.
- No signed-in page puts user data in server-rendered HTML. Signed-in pages render on the device behind `AuthGuard`, which is what makes caching pages in the service worker safe.
- `BACKEND_URL` and `BFF_SECRET` are server only and never prefixed `NEXT_PUBLIC_`.

## UI copy

Every string the app renders is an entry in `messages/en.json`, read with `useTranslations` from `next-intl`. A literal in JSX, an `aria-label`, a placeholder or a title is a lint error. Keys are typed, so a misspelled key fails `tsc`.

The lint rule has two blind spots, which review catches instead: a template literal rendered in JSX, such as ``{`Signed in as ${email}`}``, and a string held in a `const` and rendered through it. Neither passes review.

An error from the API or a route handler is shown by its `code`, through `errors.<code>` in the catalog, with `useErrorCopy()`. The server's own `message` is never shown. A code with no line is listed in `CODES_WITHOUT_COPY` in `lib/errorCopy.ts` with its reason.

The catalog tests check that the catalog works: no empty entry, no code word such as "token" on screen, no plural that fails to render, no key no code can reach, and a line for every error code.

## Styling

Style only through the tokens in `src/app/globals.css` and the recipes in `src/components/ui/styles.ts`. Tailwind's own palette is switched off, and a raw palette class is a lint error. [The colour reference](../../docs/app/colors.md) says what each token is for. Light and dark both have to look right. The safe-area insets are read in `globals.css` only, as `--safe-top`, `--safe-right`, `--safe-bottom` and `--safe-left`.

## Sheets and dialogs

Every overlay is `BottomSheet`, `ConfirmDialog` or `FormSheet` from `src/components/ui/`, never a hand-built one. Below `md` it is a bottom sheet with a drag handle, and from `md` a centred dialog. [The sheet primitives](../../docs/app/shell.md#the-sheet-primitives) state every convention they keep, and `docs/design/mobile-ui-lessons.md` says why.

To add a form sheet, such as logging a food:

1. Write it as a `FormSheet`. Pass `dirty` from `useFormDirty`, `submitting`, `onSubmit` and `formError`, and render the fields from its render prop, giving the first field the `autoFocus` it hands you. `FormSheet` does the rest: dismissal only while clean and idle, the keyboard, the body that takes focus on a phone, the footer and the in-flight guard.
2. Put other `BottomSheet` options in `sheet`, and a secondary action such as a delete in `footerStart`.
3. In the caller, keep it mounted with `useSheetTarget`: render it while `shown` is set, with `key={shown.key}`, `open={isOpen}` and `returnFocusTo={shown.opener}`.
4. Run `describeFormSheetContract` from `src/__tests__/formSheet.tsx` in its test.

A confirmation is a `ConfirmDialog`. One in front of a write that takes a row off the page goes through `useConfirmedDelete`, which renders the dialog and moves focus once the row is gone.

## Commands

| Command                                       | What it does                                                         |
| --------------------------------------------- | -------------------------------------------------------------------- |
| `pnpm --filter @hovimestari/web dev`          | The development server on port 3000, on Turbopack. No service worker |
| `pnpm --filter @hovimestari/web build`        | A production build into `.next`                                      |
| `pnpm --filter @hovimestari/web build:verify` | The same build into `.next-build`, safe to run beside a dev server   |
| `pnpm --filter @hovimestari/web start`        | Serves the production build on port 3000                             |
| `pnpm --filter @hovimestari/web typecheck`    | Generates the route types, then runs `tsc`                           |
| `pnpm --filter @hovimestari/web lint`         | ESLint, with the copy and palette rules                              |
| `pnpm --filter @hovimestari/web test`         | Jest                                                                 |

`pnpm env:init` at the repository root writes `.env.local` from `.env.example`, with the same `BFF_SECRET` the backend's `.env` gets. The backend must be running for sign-in to work. [The local development runbook](../../docs/setup/local-development.md) has the full setup.

### Running a production build locally

Service worker and install checks need a production build. In production the relay sends only the `x-real-ip` header Vercel sets, so on your own machine start the build with `LOCAL_PRODUCTION_RELAY=1`, which lets it fall back to the loopback address. Vercel ignores the flag.

Never set `LOCAL_PRODUCTION_RELAY` on a deployed host. On a host other than Vercel it would key every sign-in on one address, so one person's failed attempts would lock out everyone.

```bash
pnpm --filter @hovimestari/web build
LOCAL_PRODUCTION_RELAY=1 pnpm --filter @hovimestari/web start
```

The production cookie is `Secure`. Browsers accept it on `http://localhost`, and on no other plain-HTTP host.

## Tests

Tests live in `__tests__/` next to the source. Jest 29 through `next/jest`, with React Testing Library.

- Component tests mock `next/navigation` and `useAuth`. `src/__tests__/helpers/auth.ts` has `fakeAuth(status)` and `testPassword()`, which makes a password at run time, so no test holds a literal one.
- Every `render` and `renderHook` gets the real catalog and its own query client from `src/__tests__/setup.ts`. Never mock `next-intl`.
- The default environment is jsdom plus Node's `Response`, `Request` and `Headers`. `fetch` is not provided, so a test that reaches the network stubs it.
- Route handler suites start with `/** @jest-environment node */` and build requests with `browserRequest()` from `src/app/api/auth/__tests__/support.ts`.
- `src/app/__tests__/safeAreas.test.ts` fails when a file other than `globals.css` reads the safe-area insets.
- `src/__tests__/sheet.ts` drives sheets through Base UI's own code: `swipeSheetDown`, `pressOutsideSheet`, `holdSheetExits`, `controlSheetAnimations`, `confirmArmed`, `trackFocus`. `formSheet.tsx` has `describeFormSheetContract` and `stubPhone`.
- Layout, motion and the service worker are checked in a real browser against a production build. Unit tests do not show them.
