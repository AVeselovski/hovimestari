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
│   ├── globals.css             The design tokens, the safe-area and motion tokens, and the sheet, toast, gauge and footer utilities
│   ├── manifest.ts             The web manifest at /manifest.webmanifest
│   ├── not-found.tsx, error.tsx, global-error.tsx  The page for an unknown address and the two error pages
│   ├── fonts/                  Fraunces, Instrument Sans and JetBrains Mono, variable woff2
│   ├── auth/(guest)/           Sign in, sign up and forgot password, behind GuestGuard
│   │   └── layout.tsx          Reads on the server whether Google is offered
│   ├── auth/reset-password/    Choose a new password, open with or without a session
│   ├── (app)/                  The signed-in tabs, behind AuthGuard and inside the shell
│   │   ├── layout.tsx          AuthGuard, then the per-user query cache, then the first-run gate, then AppShell
│   │   ├── page.tsx            Day: renders DayTab inside Suspense, since it reads ?date=
│   │   ├── recipes/, groceries/  The two other content tabs
│   │   └── settings/           Settings: Targets, Food names, Appearance, Sign-in methods, Account and Food data, and their sheets
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
│   ├── account/                SignOutButton, DeleteAccountButton and DeleteAccountSheet, shared by Settings and the first-run page
│   ├── day/                    The Day tab:
│   │   ├── DayTab.tsx          One day: the date from ?date= or today, the state frame, the entry sheet's mount
│   │   ├── DayHeader.tsx       The date bar and the launcher, kept at the top while the day scrolls under them, with the hairline
│   │   ├── DateBar.tsx         Previous day, the day's label over the native date input, Next day
│   │   ├── DayLauncher.tsx     "Log food" or "Add to plan", which opens the log sheet on the day shown
│   │   ├── DaySummary.tsx      Both readings, the distances, carbohydrates and fat, and the two notes, each line in its reserved room
│   │   ├── noTargets.ts        Whether a day, loaded or still loading, shows without targets, and from which date
│   │   ├── Gauge.tsx           Draws one gauge from gaugeGeometry: track, band, fills, end-cap, ticks
│   │   ├── gaugeGeometry.ts    Every position on a gauge, in per cent of the track, as a pure function
│   │   ├── EntryList.tsx       "Entries", Mark all eaten, the rows and the empty line
│   │   ├── EntryRow.tsx        One entry: its state mark and the button that opens the entry sheet
│   │   └── MarkEatenButton.tsx The 44px state mark: the circle that marks, the check, the dashed circle
│   ├── entries/                The entry sheet and its fields:
│   │   ├── EntrySheet.tsx      A FormSheet on one entry: Eaten or Planned, the amount, its figures, the date, Remove entry
│   │   ├── AmountField.tsx     A food's amount: the unit chips and one number field
│   │   ├── MealCount.tsx       A saved meal entry's count of meals
│   │   ├── EstimateFields.tsx  An estimate's name, four figures and note
│   │   ├── FigureFields.tsx    Four typed figures two by two, with one shared line under them
│   │   ├── StateChoice.tsx     Eaten or Planned, with Eaten unavailable on a future date
│   │   ├── portionLabel.ts     A portion's name for a reader
│   │   ├── amount.ts           An amount as typed: grams or a count, its parsing, its grams and chip switches
│   │   └── entryForm.ts        The sheet's fields, the PATCH of changed fields, its exact inverse and the preview
│   ├── figures/                MacroFigures, the four figures in rows or in one row, and MacroDot, the dot in a macro's hue
│   ├── foods/                  Foods on the web, and the log sheet that holds them:
│   │   ├── FoodSheet.tsx       The log sheet: the status line, the search, a food's and a meal's view, the archived meals, Log, and the sheets stacked on it
│   │   ├── useSheetNavigation.ts  The sheet's views as a stack, with each one's scroll and the row that opened the next
│   │   ├── FoodSheetStack.tsx  The own-food, portion, saved meal and estimate sheets and the delete confirmations, stacked on the log sheet
│   │   ├── SearchField.tsx     The search field pinned in the sheet's header, "Search foods and meals"
│   │   ├── FoodSearchView.tsx  Browse lists, results with the meals that match first, no results, offline and failure
│   │   ├── FoodRow.tsx         One food in a list: names, energy and protein or a meta line, the star and "Yours", and a trailing control
│   │   ├── FoodDetail.tsx      A food's view: the header with Back, the name and the star, and the detail with figures and portions
│   │   ├── Per100gFigures.tsx  The four figures per 100 g, through MacroFigures
│   │   ├── FavouriteButton.tsx The star: a 44px toggle with aria-pressed
│   │   ├── FoodSourceLine.tsx  Where a food's figures come from, with the link to the Fineli credit
│   │   ├── useFavourite.ts     Marking a favourite optimistically, and rolling back on a failure
│   │   ├── OwnFoodSheet.tsx    Add or edit an own food, with its delete
│   │   ├── PortionSheet.tsx    Add or edit an own portion, with its delete
│   │   └── ownFoodForm.ts      The two forms' fields, their parsing and the shared schemas
│   ├── log/                    Logging in the log sheet:
│   │   ├── StatusLine.tsx      The header's first line: the day the sheet logs to, or for a moment a failure or a note
│   │   ├── CreateActions.tsx   "New saved meal" and "Add an estimate", the first controls while browsing
│   │   ├── RecentList.tsx      The recent items, each with its last amount and "+"
│   │   ├── heldList.tsx        Open lists hold their order and rows while they can be pressed
│   │   ├── SavedMealList.tsx   The saved meals while browsing: the source chips, each meal with "+", Archived meals
│   │   ├── SourceChips.tsx     "All" and one chip per source, one row that scrolls sideways
│   │   ├── mealFilter.ts       Meals whose name or source holds every typed word, folded, and the sources they name
│   │   ├── SavedMealRow.tsx    One saved meal in a list, a button that opens its view, and a trailing control
│   │   ├── LogAgainButton.tsx  The 44px "+", with its busy ring
│   │   ├── AgainButton.tsx     A "+" named for what it adds, on the sheet's one-press add
│   │   ├── againItems.ts       What "+" adds for a food or a meal: its last amount
│   │   ├── amountLabel.ts      How an amount reads: "200 g", "2 × Medium piece · 110 g", "1 meal"
│   │   ├── browseLogging.ts    What the browse lists need to log again and to open a food or a meal
│   │   ├── useLogAgain.ts      The one-press add: its pending id, held while its failure shows, one at a time
│   │   ├── useLogForm.ts       A food's or a meal's log: prefill, chips, figures, state, its id and its submit
│   │   ├── LogBlock.tsx        The log form: chips and amount or meals, the figures, Eaten or planned
│   │   ├── LogFooter.tsx       The pinned footer: the refusal line and Log or Add to plan
│   │   ├── MealView.tsx        A saved meal: the log block, its figures per meal, Edit, Archive or Restore, Delete
│   │   ├── ArchivedMealsView.tsx  The archived meals, read when the view opens, each with Restore
│   │   ├── useMealActions.ts   Archiving and restoring a meal, one at a time, with the failure on the status line
│   │   ├── SavedMealSheet.tsx  A new meal (Save and log, or Save meal) or an edit, stacked on the log sheet
│   │   ├── EstimateSheet.tsx   Add an estimate, stacked on the log sheet
│   │   ├── mealSends.ts        A new meal pressed again after a send that could not confirm: the latest press decides
│   │   ├── useFormFields.ts    A form's values and refusals, a change clearing its field's refusal
│   │   └── mealForm.ts         The two sheets' fields, read with the shared schemas
│   ├── auth/                   AuthPage, the guest frame, and the offline and server-fault pages
│   ├── form/                   The form parts the guest pages and the sheets share:
│   │   ├── Field.tsx           A labelled input with one line under it for its hint or its error
│   │   ├── FormError.tsx       The announced line for a refusal that belongs to no field, above a page form's button or in a sheet's footer
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
│   ├── targets/                Targets on the web:
│   │   ├── TargetsGate.tsx     The first-run gate: the spinner, the first-run page or the shell inside TodayProvider
│   │   ├── TodayProvider.tsx   The app's today: the server's, moved by any newer answer, asked again by the device's clock
│   │   ├── FirstRunTargets.tsx The first-run page: the first targets, Sign out and Delete account
│   │   ├── TargetsSheet.tsx    A dated targets change: new targets from a picked date, or an edited change under its date, the days they apply to, removal
│   │   ├── TargetRangeFields.tsx  The four target fields, as two ranges with a shared line under each
│   │   ├── NotAdviceNote.tsx   The note that the app gives no nutrition or medical advice
│   │   ├── targetForm.ts       parseTargetFields(): the fields through parseDecimalInput and the shared schema
│   │   └── targetLines.ts      Which days a save or a removal changes, from the list of changes
│   └── ui/                     Card, EmptyState, PageContainer, StableLabel, ThemeToggle, styles.ts, the fields and the overlays:
│       ├── NativeDateInput.tsx The platform's date field, uncontrolled so iOS's Reset can empty it
│       ├── DecimalField.tsx    A number field with its unit inside: text with an inputMode, never type=number
│       ├── BottomSheet.tsx     The one sheet and dialog primitive, on Base UI's Drawer
│       ├── closingSheet.ts     A closing sheet swallows presses: every one until its exit ends, then one near the closing press for 500 ms
│       ├── ConfirmDialog.tsx   A BottomSheet that asks before a consequential action
│       ├── FormSheet.tsx       A BottomSheet that holds one form: every form sheet is one
│       ├── Toast.tsx           ToastProvider, ToastRegion and useToast: one toast at a time, under the sheets
│       ├── PromptSheetBody.tsx A form sheet's body, which takes focus on a phone so no keyboard rises mid-slide
│       └── FormSheetActions.tsx  Cancel, the submit button and the secondary action's row in a form sheet's footer
├── contexts/
│   ├── AuthContext.tsx         The session: status, user, signIn, signUp, signOut, renewal and its retries, all under one lock
│   ├── ThemeContext.tsx        The theme choice, data-theme and the browser chrome colour
│   └── ProvidersContext.tsx    Whether the guest pages show Google
├── hooks/                      useErrorCopy, useOnlineStatus, useRovingChoice, useMediaQuery, useIsMobile, useDebouncedValue, useFoodNameLanguage, and:
│   ├── useToday.ts             The app's today and the state of the check that keeps it current
│   ├── useEntryActions.ts      Every write to an entry from the Day tab and the log sheet, its cache update, its toast and its undo
│   ├── entryActions.ts         The types and plain helpers useEntryActions shares
│   ├── useAddActions.ts        The adds of useEntryActions: an entry, Save and log, their toasts and undo
│   ├── useKnownOffline.ts      Whether the app knows it is offline: no network, or the server out of reach
│   ├── useFailureLine.ts       The line for a failed write, in a form or on the log sheet's status line
│   ├── useSubmitGuard.ts       A form's in-flight guard: a submit is refused while the last one's promise is pending
│   ├── useSheetTarget.ts       A kept-mounted sheet's open state: a fresh key per open, the control that opened it and what it opens on
│   ├── useRetainedValue.ts     The last non-null value, so an overlay slides out with its content
│   ├── useFormDirty.ts         Whether a form holds unsaved input
│   ├── useConfirmedDelete.tsx  A confirmation in front of a write that takes a row off the page, and the write
│   ├── useArmedAtRest.ts       A sheet's action takes a press only once the sheet is at rest on a phone
│   ├── useEntryPressGuard.ts   A press outside a sheet is refused until it has slid in
│   ├── useMainScrollLock.ts    The counted lock on <main> while an overlay is open
│   ├── useStillUnderFinger.ts  No scroll by code while a finger is on the screen
│   ├── useNativeTapWhileKeyboardDown.ts  While the keyboard is down, a tap on a sheet's text field is the browser's own
│   ├── useAnchoredPanel.ts     Holds a centred panel's top where it opened
│   ├── useHeldSheetHeight.ts   Holds a phone's bottom sheet at the height it opened at
│   ├── useScrolledUnder.ts     Whether <main> is scrolled from its top, so content sits under a header that stays
│   └── useScrollHold.ts        Keeps a scrolled container still when its content shrinks
├── lib/
│   ├── api.ts                  The axios client: bearer token, one shared renewal on a 401
│   ├── api/                    The calls, one file per area: auth.ts, users.ts, targets.ts, settings.ts, foods.ts, days.ts, entries.ts, log.ts, savedMeals.ts
│   ├── newId.ts                A new version 4 UUID, built by hand where the browser has no randomUUID, as over plain http
│   ├── shownDay.ts             The day the Day tab last showed by its address, where the Day link leads back to
│   ├── pendingIds.ts           A one-press add's id, kept until its answer, a day that holds it, or a minute, and held while its failure shows
│   ├── failure.ts              What a failed write says: OfflineError, unconfirmed(), failureLine()
│   ├── errors.ts               getErrorCode, getErrorStatus, AuthRequestError
│   ├── errorCopy.ts            Which error codes have catalog copy
│   ├── decimalInput.ts         parseDecimalInput(): a typed number with a comma or a point, no sign, no grouping
│   ├── localDate.ts            YYYY-MM-DD arithmetic in UTC, formatDay() and formatDayShort() in the device's language, todayIn() and dayLabel()
│   ├── targetFormat.ts         formatTarget(): a target's figure, with no digit grouping
│   ├── foodFormat.ts           formatKcal(), formatMacroGrams() and formatGrams() for display, and formatDecimalForField() for a saved value as typed
│   ├── entryFormat.ts          formatCount(): a portion or meal count for display
│   ├── deviceTimeZone.ts       Stores the device's time zone on the account once per app start, failures dropped quietly
│   ├── providers.ts            Reads GET /auth/providers on the server
│   ├── queryClient.ts          The query client's defaults
│   ├── queryKeys.ts            Every query key, from one factory
│   ├── queryOptions.ts         The options for every read
│   ├── redirect.ts             Resolves a redirect target and keeps it only when it stays on this site
│   ├── sessionMarker.ts        The non-secret flag that says this device has a known session, and its address
│   ├── foodCache.ts            Edits to the cached food reads from a write's own answer
│   ├── mealCache.ts            Edits to the cached saved meal lists and recent items from a meal write's own answer
│   ├── revealRefused.ts        Brings a form sheet's first refused field, its label and line where they fit, into view in its body
│   ├── invalidation.ts         What each write makes stale
│   ├── forgetDevice.ts         Drops the cached signed-in pages after the account is deleted
│   ├── googleLink.ts           The results a Google link comes back with
│   ├── focus.ts                Whether focus is still inside an overlay, so closing it puts focus back only then
│   ├── focusAfterRemoval.ts    Where focus goes when a row leaves the page
│   ├── lastInputModality.ts    Which input the reader last used, so a focus put back after a tap paints no ring
│   ├── backend.ts              The backend's URL for server code, which production refuses to guess
│   └── theme/noFlashScript.ts  The pre-paint theme script and its storage key
├── __tests__/
│   ├── setup.ts                Runs before every test file: the real catalog, a query client per render, the pinned locale
│   ├── helpers/locale.ts       Pins the locale tests format with to en-US, and setTestLocale for another
│   ├── sheet.ts                Drives sheets through Base UI's own code: swipes, presses outside, exits, focus
│   └── formSheet.tsx           describeFormSheetContract, the checks every form sheet runs, and stubPhone
├── i18n/request.ts             Pins the catalog's locale to English
└── global.d.ts                 Types the catalog's keys
```

## The session

No browser JavaScript holds a refresh token. Signing in, signing up, renewing and signing out post to the route handlers under `/api/auth/` on this origin. They relay to the backend with `BFF_SECRET` and the browser's address, keep the refresh token in the `httpOnly` cookie `__refresh_token`, and hand the page the access token and the user. The access token lives in memory in `AuthContext`, never in storage. Every other call goes straight to the backend through `lib/api.ts` with the token as a bearer. How the relay, the guard and Google sign-in work is in [the authentication feature doc](../../docs/features/authentication.md#the-browser-session-through-the-web-server).

Rules that bind every change:

- A new route handler that accepts a POST runs `requireSameOrigin` from `_guard.ts` first. `allHandlersGuarded.test.ts` finds every handler and fails otherwise.
- A GET handler cannot run that guard, because a link from another site can start one. The same test lists every GET handler with what it changes, and fails on a new one until it is listed.
- A response body never carries the refresh token.
- No signed-in page puts user data in server-rendered HTML. Signed-in pages render on the device behind `AuthGuard`, which is what makes caching pages in the service worker safe.
- `BACKEND_URL` and `BFF_SECRET` are server only and never prefixed `NEXT_PUBLIC_`.

## UI copy

Every string the app renders is an entry in `messages/en.json`, read with `useTranslations` from `next-intl`. A literal in JSX, an `aria-label`, a placeholder or a title is a lint error. Keys are typed, so a misspelled key fails `tsc`.

The lint rule has two blind spots, which review catches instead: a template literal rendered in JSX, such as ``{`Signed in as ${email}`}``, and a string held in a `const` and rendered through it. Neither passes review.

An error from the API or a route handler is shown by its `code`, through `errors.<code>` in the catalog, with `useErrorCopy()`. The server's own `message` is never shown. A code with no line is listed in `CODES_WITHOUT_COPY` in `lib/errorCopy.ts` with its reason.

The catalog tests check that the catalog works: no empty entry, no code word such as "token" on screen, no plural that fails to render, no key no code can reach, and a line for every error code.

## Styling

Style only through the tokens in `src/app/globals.css` and the recipes in `src/components/ui/styles.ts`. Tailwind's own palette is switched off, and a raw palette class is a lint error. [The colour reference](../../docs/app/colors.md) says what each token is for. Light and dark both have to look right. The four macro hues are drawn by `MacroDot` and `Gauge` only, and a test fails when any other file names one. The safe-area insets are read in `globals.css` only, as `--safe-top`, `--safe-right`, `--safe-bottom` and `--safe-left`.

## Sheets and dialogs

Every overlay is `BottomSheet`, `ConfirmDialog` or `FormSheet` from `src/components/ui/`, never a hand-built one. Below `md` it is a bottom sheet with a drag handle, and from `md` a centred dialog. [The sheet primitives](../../docs/app/shell.md#the-sheet-primitives) state every convention they keep, and `docs/design/mobile-ui-lessons.md` says why.

To add a form sheet, such as the estimate sheet:

1. Write it as a `FormSheet`. Pass `dirty` from `useFormDirty`, `submitting`, `onSubmit` and `formError`, a `FormFailure` that holds the line and the error behind it, and render the fields from its render prop, giving the first field the `autoFocus` it hands you. `FormSheet` does the rest: dismissal only while clean and idle, the keyboard, the body that takes focus on a phone, the footer and the in-flight guard.
2. Put other `BottomSheet` options in `sheet`, and a secondary action in `footerStart`, with `tone: "neutral"` to draw it in ink rather than the accent. It takes one of two forms:
   - `{ label, onPress }` for an action that opens something, such as a delete that asks first. `onPress` gets the button, for a confirmation to return focus to.
   - `{ label, busy, submit }` for a second submit of the same form, such as "Save meal" beside "Save and log". `onSubmit` receives `submit` as its mode. Save and Enter call it with no mode.
3. In the caller, keep it mounted with `useSheetTarget`: render it while `shown` is set, with `key={shown.key}`, `open={isOpen}` and `returnFocusTo={shown.opener}`. A sheet that opens on something takes it as `useSheetTarget<T>()`, `open(opener, value)` and `shown.value`.
4. Pass `held` while the sheet's writes must wait, such as while `useToday()` reports `holding`. Save and the secondary action then ignore a press, and Cancel and every dismissal stay free.
5. Run `describeFormSheetContract` from `src/__tests__/formSheet.tsx` in its test.

A refusal that belongs to no field goes in `formError`, as `{ line, cause }`: the line from `useFailureLine`, and the error the write threw, or null for a line the sheet decided itself. `FormSheet` shows it in the pinned footer above the buttons. On a phone the footer keeps no room for it: it grows upward when a refusal shows, with the buttons where they were, and the field that holds focus comes back into view if the taller footer covers it. From `md` the footer keeps two lines of room for it, because the dialog grows downward and would move the buttons. A failure that arrives while the app knows it is offline, and that the connection explains, shows "You are offline. Changes need a connection." whatever the line says, so a sheet never words that case itself. A refusal the server answered keeps its own line. After a refused submit `FormSheet` scrolls the first refused field, its line included, into view: describe each field by its line (`aria-describedby`), as `Field` and `DecimalField` do, and it finds the block. A secondary action nobody needs while typing, such as Remove entry, passes `yieldsToKeyboard`, so its row gives its room to the keyboard. A second submit never does.

Lay a form's fields out with the recipes in `styles.ts`: the form is a `formStack`, 8 pixels between fields, and a section's heading or a closing note takes `sectionStart`, 16 pixels from what is above it. Every field that can be refused keeps one line of room under it (`lineRoom`). A control that cannot be refused, such as a segmented control, keeps none and takes `linelessBlock`, 16 pixels to the block under it. A page's form uses the same recipes, with `FormError` between the last field and the submit button: no room on a phone, two lines from `md`, as in a sheet's footer (`refusalLine`). A form sheet's last field's line is the room above the footer: the body adds only 4 pixels under it (`form-ends-in-line` in `globals.css`). Write each line under a field to fit one line at 320 pixels wide, about 40 characters. A form sheet is as tall as its form and holds that height once open, so do not pass `size="tall"` for a form.

A confirmation is a `ConfirmDialog`. One in front of a write that takes a row off the page goes through `useConfirmedDelete`, which renders the dialog and moves focus once the row is gone.

## Toasts

A short outcome on the page, such as "Removed Rahka." with Undo, is a toast from `src/components/ui/Toast.tsx`. `AppShell` mounts its one region, so a screen only calls `useToast().show({ message, action })`. The action's `onPress` receives `{ fromKeyboard }`, so it can move focus where its result shows after a keyboard press. Only one toast shows at a time, and it sits under every sheet: a sheet shows its own outcomes inside itself. A page whose last rows hold actions passes `clearToast` to `PageContainer`, so a toast never covers them. [The toast primitive](../../docs/app/shell.md#the-toast-primitive) states its rules.

## Numbers and dates

A number a person types is a `DecimalField`, a text field with an `inputMode`, never `type="number"`, which refuses the comma a Finnish keypad types. Use `inputMode="numeric"` for whole numbers and `"decimal"` where a decimal is likely. A number field never has a placeholder. `layout="beside"` puts the label on the left of a 9rem field, one row each, for a column of short figures such as a label's values per 100 g. A beside field whose unit can be a word is 11rem. A field whose unit changes, such as grams or portions, passes its longest unit as `widestUnit`, so its width holds as the unit changes. The line under it keeps one line of room. The field keeps room at its end for its unit: 1.75rem for one letter such as "g", 3rem for a short unit such as "kcal", and 5.5rem for a word such as "portions" or "meals".

Parse what it holds with `parseDecimalInput(raw, { maxDecimals })` from `src/lib/decimalInput.ts`. It answers `empty`, `invalid`, `group` or a `number`:

- It accepts digits with one comma or one point as the decimal separator, whatever the device's language. "9,8" and "9.8" are both 9.8.
- It refuses a sign, grouping and more decimals than `maxDecimals`, and never rounds. Trailing zeros in a fraction of one or two digits count for nothing, so "120.50" fits one decimal.
- A number that may be one thousands group, such as "2,000" or "1.500", comes back as `group` in every field, also one that allows three decimals. Leading zeros are dropped first, so "012,345" is a group too. So a value from 1 to 999 cannot carry a third decimal when typed. A form shows `group` with the line `common.digitGroup`, so the reader learns what to type instead.

Show a figure without digit grouping and in Latin digits, as `formatTarget` in `src/lib/targetFormat.ts` does, so what shows can be typed back. Join a figure to its unit with a no-break space in the catalog, as in `"{value}\u00a0g"`, so a narrow line never parts them.

A date is a `NativeDateInput`, the platform's own picker. It keeps one line under it for the form's error, passed in `error`, or a note about the date chosen, passed in `hint`. A date from the API is a `YYYY-MM-DD` string: move it with `addDays` and show it with `formatDay` from `src/lib/localDate.ts`. "Today" comes from the server's answer, never from this device's clock. The device's clock only decides when to ask again. Read it with `useToday()`.

[The sheet primitives](../../docs/app/shell.md#the-sheet-primitives) hold the conventions every form keeps, among them the room a line under a field reserves so an error moves nothing.

After a write, refresh what it made stale through a function in `src/lib/invalidation.ts`. Each one cancels the reads still on their way before it reads again, so an answer from before the write never lands after it. A food write first puts its own answer into every cached food read, through `src/lib/foodCache.ts`, and a saved meal write into the meal lists and the recent items, through `src/lib/mealCache.ts`, so a list not on screen comes back with the new state before its read lands.

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
- Every test formats figures and dates in `en-US`, whatever the machine's locale. The app formats in the device's language, which under jest would be the machine's. `src/__tests__/helpers/locale.ts` pins it, and `setTestLocale("fi-FI")` shows a screen as a device in another language would, for that test only.
- The default environment is jsdom plus Node's `Response`, `Request` and `Headers`. `fetch` is not provided, so a test that reaches the network stubs it.
- Route handler suites start with `/** @jest-environment node */` and build requests with `browserRequest()` from `src/app/api/auth/__tests__/support.ts`.
- `src/app/__tests__/safeAreas.test.ts` fails when a file other than `globals.css` reads the safe-area insets.
- `src/__tests__/sheet.ts` drives sheets through Base UI's own code: `swipeSheetDown`, `pressOutsideSheet`, `holdSheetExits`, `controlSheetAnimations`, `confirmArmed`, `trackFocus`. `formSheet.tsx` has `describeFormSheetContract` and `stubPhone`.
- Layout, motion and the service worker are checked in a real browser against a production build. Unit tests do not show them.
