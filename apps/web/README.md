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
│   │   ├── layout.tsx          AuthGuard, then the per-user query cache and key reveal store, then the first-run gate, then AppShell
│   │   ├── page.tsx            Day: renders DayTab inside Suspense, since it reads ?date=
│   │   ├── recipes/            The Library: renders RecipesTab inside Suspense, since it reads ?show=
│   │   │   └── [id]/           One recipe: renders RecipePage
│   │   ├── groceries/          Groceries: "Nothing here yet."
│   │   └── settings/           Settings: Targets, Food names, Appearance, Connected AI, Sign-in methods, Account and Food data, and their sheets
│   │       └── _components/    One file per section and sheet. Connected AI is ConnectedAiSection, with ConnectionRows, CreateConnectionSheet, AccessLevelField, KeyRevealSheet, ConnectionInstructions, CopyButton, ConnectionActivitySheet (a connection's record, a page at a time), changeText.ts (one recorded change as a headline and its lines, and as one sentence for a screen reader) and recipeChangeText.ts (a recipe change's lines)
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
│   ├── account/                SignOutButton, DeleteAccountButton and DeleteAccountSheet, for Settings
│   ├── day/                    The Day tab:
│   │   ├── DayTab.tsx          One day: the date from ?date= or today, the state frame, the entry, week and copy sheets' mounts
│   │   ├── DayHeader.tsx       The date bar and the launcher, kept at the top while the day scrolls under them, with the hairline
│   │   ├── DateBar.tsx         Previous day, the day's label over the native date input, Next day
│   │   ├── DayLauncher.tsx     "Log food" or "Add to plan", which opens the log sheet on the day shown
│   │   ├── DaySummary.tsx      Both readings, the distances or the words for a past reading with nothing recorded, carbohydrates and fat, and the two notes, each line in its reserved room
│   │   ├── noTargets.ts        Whether a day, loaded or still loading, shows without targets, and the week's line on when targets start
│   │   ├── Gauge.tsx           Draws one gauge from gaugeGeometry (track, band, fills, end-cap, ticks), and AverageGauge, the week's average as a ring under the ticks and a dot over them, with the band and ticks shared
│   │   ├── gaugeGeometry.ts    Every position on a gauge and on the average gauge, in per cent of the track, as pure functions
│   │   ├── WeekSheet.tsx       The week sheet: the week's title, the table, the counted line, the targets line and Previous and Next
│   │   ├── WeekTable.tsx       The week as a table, one row per day, with the average row in its foot
│   │   ├── WeekAverageRow.tsx  The week's average day: its figures, its spoken counts and its gauges, its label out of flow
│   │   ├── weekCells.ts        What the day rows and the average row share: columns, gaps, figure type, position words, the week's kind
│   │   ├── EntryList.tsx       "Entries", Mark all eaten and Copy, the rows and the empty line
│   │   ├── EntryRow.tsx        One entry: its state mark and the button that opens the entry sheet
│   │   ├── entryMeta.ts        An entry's amount line, shared by its row and the copy sheet
│   │   └── MarkEatenButton.tsx The 44px state mark: the circle that marks, the check, the dashed circle
│   ├── entries/                The entry sheet, the copy sheet and their fields:
│   │   ├── EntrySheet.tsx      A FormSheet on one entry: Eaten or Planned, the amount, its figures, the date, Remove entry
│   │   ├── CopyEntriesSheet.tsx  A FormSheet that copies ticked entries of a day to another date, with its own ids for the open
│   │   ├── AmountField.tsx     A food's amount: the unit chips and one number field
│   │   ├── CountField.tsx      A saved meal entry's count of meals, or a recipe entry's servings
│   │   ├── EstimateFields.tsx  An estimate's name, four figures and note
│   │   ├── FigureFields.tsx    Four typed figures two by two, with one shared line under them
│   │   ├── StateChoice.tsx     Eaten or Planned, with Eaten unavailable on a future date
│   │   ├── portionLabel.ts     portionName(): a portion's name for a reader, its Fineli unit first, and the hook that uses it
│   │   ├── amount.ts           An amount as typed: grams or a count, its parsing, its grams and chip switches
│   │   └── entryForm.ts        The sheet's fields, the PATCH of changed fields, its exact inverse and the preview
│   ├── figures/                MacroFigures, the four figures in rows or in one row, and MacroDot, the dot in a macro's hue
│   ├── foods/                  Foods on the web, and the log sheet that holds them:
│   │   ├── FoodSheet.tsx       The log sheet: the status line, the search, a food's, a meal's and a recipe's view, the archived meals, Log, and the sheets stacked on it
│   │   ├── useSheetNavigation.ts  The sheet's views as a stack, with each one's scroll and the row that opened the next
│   │   ├── FoodSheetStack.tsx  The scanner, the own-food, portion, saved meal and estimate sheets and the delete confirmations, stacked on the log sheet
│   │   ├── SearchField.tsx     The search field pinned in the sheet's header, labelled "Search foods, meals and recipes", with the camera button or the clear cross at its end
│   │   ├── ScannerSheet.tsx    The camera scanner: the live view with its band, Torch and Try again, a line for each state and Type the number
│   │   ├── scanner/            The scanner's camera and decoder:
│   │   │   ├── useCameraStream.ts  The camera and its decode loop over the band's part of each frame (`visibleBand`), with a session number so every way out stops every track
│   │   │   ├── decoder.ts      The one file that imports zxing-wasm: loads the reader with the app's own wasm, reads the retail formats
│   │   │   └── useScanner.ts   The log sheet's side: opens the scanner, types a read into the field, looks it up and places focus
│   │   ├── useFoodFinder.tsx   The food search as a hook: the field, the results or the host's browse or the barcode block, and the scanner and own-food sheets, for a host's header, body and stacked slots
│   │   ├── FoodSearchView.tsx  The log sheet's browse lists, the recipes and saved meals that lead its results, and FoodList, one titled list of foods
│   │   ├── useBarcodeMode.tsx  The search in barcode mode: text of 8 to 14 digits puts the barcode block in place of the lists
│   │   ├── BarcodeResult.tsx   The barcode block: "Barcode {code}", Look up, and the lookup's answer or failure
│   │   ├── useBarcodeLookup.ts The lookup of the held code, sent on a press, with its answer kept true to the foods
│   │   ├── FoodRow.tsx         One food in a list: names, energy and protein or a meta line, the star and "Yours" unless left out, and a trailing control
│   │   ├── FoodDetail.tsx      A food's view: the header with Back, the name and the star, and the detail with figures, portions and Copy to my foods
│   │   ├── Per100gFigures.tsx  The four figures per 100 g, through MacroFigures
│   │   ├── FavouriteButton.tsx The star: a 44px toggle with aria-pressed
│   │   ├── FoodSourceLine.tsx  Where a food's figures come from, with the link to the credit and an Open Food Facts product's own page
│   │   ├── useFavourite.ts     Marking a favourite optimistically, and rolling back on a failure
│   │   ├── OwnFoodSheet.tsx    Add an own food, empty or filled from a start, or edit one with its delete
│   │   ├── useOwnFoodDelete.ts The one delete of an own food: asks first, takes a food already gone as deleted, drops it from the lists
│   │   ├── PortionSheet.tsx    Add or edit an own portion, with its delete
│   │   └── ownFoodForm.ts      The two forms' fields, a new food's start, their parsing and the shared schemas
│   ├── log/                    Logging in the log sheet, and the saved meal parts the Library shares:
│   │   ├── StatusLine.tsx      The header's first line: the day the sheet logs to, or for a moment a failure or a note
│   │   ├── CreateActions.tsx   "New meal" and "Add an estimate", the first controls while browsing
│   │   ├── RecentList.tsx      The recent items, foods, meals and recipes, each with its last amount and "+"
│   │   ├── RecipeRows.tsx      A recipe's row in the log sheet, the rows the search finds, and the Recipes list while browsing: five recipes and All 30 recipes
│   │   ├── heldList.tsx        Open lists hold their order and rows while they can be pressed
│   │   ├── SavedMealList.tsx   The saved meals while browsing: the source chips, each meal with "+", Archived meals
│   │   ├── SourceChips.tsx     "All" and one chip per source, one row that scrolls sideways
│   │   ├── mealFilter.ts       Meals whose name or source holds every typed word, folded, and the sources they name
│   │   ├── SavedMealRow.tsx    One saved meal in a list, a button that opens its view, and a trailing control
│   │   ├── LogAgainButton.tsx  The 44px "+", with its busy ring
│   │   ├── AgainButton.tsx     A "+" named for what it adds, on the sheet's one-press add
│   │   ├── againItems.ts       What "+" adds for a food, a meal or a recipe: its last amount
│   │   ├── amountLabel.ts      How an amount reads: "200 g", "2 × Medium piece · 110 g", "1 meal", "1 serving"
│   │   ├── browseLogging.ts    What the browse lists need to log again and to open a food, a meal or a recipe
│   │   ├── useLogAgain.ts      The one-press add: its pending id, held while its failure shows, one at a time
│   │   ├── useLogForm.ts       A food's, a meal's or a recipe's log: prefill, chips, figures, state, its id and its submit
│   │   ├── LogBlock.tsx        The log form: chips and amount, or meals or servings, the figures, Eaten or planned
│   │   ├── AmountFigures.tsx   "For this amount" and the four figures under an amount, shared with the ingredient picker and a recipe's log sheet
│   │   ├── foodChips.ts        A food's unit chips: grams, the last amount's portion, the food's other portions
│   │   ├── LogFooter.tsx       The pinned footer: the refusal line and Log or Add to plan
│   │   ├── MealView.tsx        A saved meal: the log block, its figures per meal, Edit, Archive or Restore, Delete
│   │   ├── RecipeView.tsx      A recipe in the log sheet: the log block with servings, its figures per serving, Open recipe
│   │   ├── ArchivedMealsView.tsx  The archived meals, read when the view opens, each with Restore
│   │   ├── useMealActions.ts   Archiving and restoring a meal, one at a time, with the failure on the status line or where the press names
│   │   ├── SavedMealSheet.tsx  A new meal or an edit with Delete: Save and log with the log sheet's logging, save only without, Archive meal where passed
│   │   ├── useSavedMealDelete.ts  The one delete of a saved meal, behind the meal view and the meal sheet
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
│   ├── ConnectionRevealProvider.tsx  The one new connection key not yet confirmed copied, in React state only
│   ├── ServiceWorkerRegistration.tsx  Registers sw.js in production builds
│   ├── recipes/                The Library and a recipe's page:
│   │   ├── RecipesTab.tsx      The Library: the three segments, each one's action and search, Filter and its order and bounds, and the editor, meal and own-food sheets
│   │   ├── RecipeFilterButton.tsx  Filter, the icon button after the recipes' search field, with the count in force on its corner
│   │   ├── RecipeList.tsx      The recipes segment: Favourites and tag chips, the recipes in the order chosen, the archived recipes
│   │   ├── RecipeFilterSheet.tsx  The filter sheet: Sort by and four bounds per serving, held as a draft that only Show recipes applies
│   │   ├── recipeListFilter.ts The list's order and bounds, their one type and key list, the count on Filter, and the sheet's draft read into them
│   │   ├── RecipeRow.tsx       One recipe in the list, a link to its page, with the latest day under the order by it
│   │   ├── RecipeFiguresLine.tsx  One serving's calories and protein on one line, for a recipe's row here and in the log sheet
│   │   ├── SavedMealsSection.tsx  The saved meals, searched, and the archived meals opened in place
│   │   ├── OwnFoodsSection.tsx The own foods, searched, each opening its edit sheet
│   │   ├── RecipePage.tsx      One recipe: its figures with the servings stepper, its lines, method and notes, Log, Duplicate, Archive, Delete, and the latest day it is on
│   │   ├── RecipeFigures.tsx   The figures card: Per serving and Total, with the servings row and its stepper on the page
│   │   ├── RecipeLogSheet.tsx  Servings of a recipe on a day, eaten or planned
│   │   ├── CookSheet.tsx       The as made sheet: a batch with its own lines and servings, and the days its servings are on
│   │   ├── CookIngredients.tsx The batch's lines, each with what the batch did with it
│   │   ├── CookLineSheets.tsx  The two sheets a batch's line opens in: the ingredient picker and the not-counted sheet, with a batch's words
│   │   ├── CookServings.tsx    Servings from this batch: the opening serving, rows of new servings and the other planned servings
│   │   ├── cookDraft.ts        The batch as typed: its lines, its marks and figures from the shared functions, what Log as made sends, and whether a stored batch is the one sent
│   │   ├── useCookSheet.tsx    The one way into the as made sheet, which reads the recipe first when it must and asks its host again when the read answers
│   │   ├── useOtherServings.ts The other planned servings of a recipe on a batch's day and the six after, kept while a new set of days is read
│   │   ├── RecipeEditorSheet.tsx  The editor: a new recipe, an edit or a copy, saved whole
│   │   ├── recipeDraft.ts      The editor's draft: its lines, the figures as typed and what a save sends
│   │   ├── ProseField.tsx      A labelled text area with its line: the editor's Method and Notes
│   │   ├── IngredientRows.tsx  A recipe's lines, shown or pressed to change, a refused line's message under it, a batch's mark and a left-out line
│   │   ├── IngredientPicker.tsx  The picker stacked on the editor or the as made sheet: the food search, then a food's amount
│   │   ├── PickerAmountForm.tsx  The picker's amount view: the amount, its figures, As written and Note
│   │   ├── NotCountedSheet.tsx A line not counted, such as salt
│   │   ├── WrittenFields.tsx   A line's amount as the recipe writes it: a number and a unit
│   │   ├── TagField.tsx        A recipe's tags, typed or tapped
│   │   ├── tags.ts             The one comparison of tags on screen, and the tags a list of recipes uses
│   │   ├── lineAmount.ts       How a line's amount reads
│   │   ├── useRecipeMeta.tsx   "Serves 2 · 25 min" and a recipe's figures per serving as a line
│   │   ├── useRecipeActions.ts A recipe's favourite and archive
│   │   └── useRecipeDelete.ts  The one delete of a recipe, which asks first
│   ├── shell/                  AppShell, AppHeader, TabBar, SideRail, NavLinks, OfflineStrip, EmptyTab, tabs.ts
│   ├── targets/                Targets on the web:
│   │   ├── TargetsGate.tsx     The first-run gate: the spinner, the first-run page or the shell inside TodayProvider, and useFirstRun
│   │   ├── TodayProvider.tsx   The app's today: the server's, moved by any newer answer, asked again by the device's clock
│   │   ├── FirstRunTargets.tsx The first-run page: the first targets, or Continue without targets
│   │   ├── TargetsSheet.tsx    A dated targets change: new targets from a picked date, or an edited change under its date, the days they apply to, removal
│   │   ├── TargetRangeFields.tsx  The four target fields, as two ranges with a shared line under each
│   │   ├── NotAdviceNote.tsx   The note that the app gives no nutrition or medical advice
│   │   ├── targetForm.ts       parseTargetFields(): the fields through parseDecimalInput and the shared schema
│   │   └── targetLines.ts      Which days a save or a removal changes, from the list of changes
│   └── ui/                     Card, EmptyState, PageContainer, StableLabel, ThemeToggle, styles.ts, the fields and the overlays:
│       ├── ExternalLink.tsx    A link to another site over https, in a new tab, that tells a screen reader so
│       ├── NativeDateInput.tsx The platform's date field, uncontrolled so iOS's Reset can empty it
│       ├── SelectField.tsx     The one select: a native select in a field's shape, with the app's chevron
│       ├── Checkbox.tsx        The one checkbox: a real input drawn in the tokens, the accent when ticked, with a dash for some
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
│   ├── useDocumentTitle.ts     Names the browser's title after what a page shows, such as a recipe
│   ├── useEntryActions.ts      Every write to an entry from the Day tab and the log sheet, its cache update, its toast and its undo
│   ├── entryActions.ts         The types and plain helpers useEntryActions shares
│   ├── useAddActions.ts        The adds of useEntryActions: an entry, Save and log, a batch logged as made, their toasts and undo
│   ├── useCopyActions.ts       Copying entries, composed into useEntryActions: the send, the removal of superseded ids, its toast and undo
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
│   ├── useSheetFocusReturn.ts  Where a sheet puts focus back the moment it closes
│   ├── useSheetTabWrap.ts      Keeps Tab and Shift+Tab inside the top-most open sheet
│   ├── useStillUnderFinger.ts  No scroll by code while a finger is on the screen
│   ├── useNativeTapWhileKeyboardDown.ts  While the keyboard is down, a tap on a sheet's text field is the browser's own
│   ├── useAnchoredPanel.ts     Holds a centred panel's top where it opened
│   ├── useHeldSheetHeight.ts   Holds a phone's bottom sheet at the height it opened at
│   ├── useScrolledUnder.ts     Whether <main> is scrolled from its top, so content sits under a header that stays
│   └── useScrollHold.ts        Keeps a scrolled container still when its content shrinks
├── lib/
│   ├── api.ts                  The axios client: bearer token, one shared renewal on a 401
│   ├── api/                    The calls, one file per area: auth.ts, users.ts, targets.ts, settings.ts, foods.ts, days.ts, entries.ts, log.ts, savedMeals.ts, recipes.ts, cooks.ts, connections.ts
│   ├── mcpConnection.ts        The assistant's server address and the Claude Code and Claude Desktop setup snippets, with mcp-remote pinned
│   ├── barcode.ts              barcodeOf() reads a typed barcode with the shared schema, sameBarcode() and openFoodFactsUrl()
│   ├── newId.ts                A new version 4 UUID, built by hand where the browser has no randomUUID, as over plain http
│   ├── shownDay.ts             The day the Day tab last showed by its address, where the Day link leads back to
│   ├── pendingIds.ts           A one-press add's id, kept until its answer, a day that holds it, or a minute, and held while its failure shows
│   ├── failure.ts              What a failed write says: OfflineError, unconfirmed(), failureLine()
│   ├── errors.ts               getErrorCode, getErrorStatus, AuthRequestError
│   ├── errorCopy.ts            Which error codes have catalog copy
│   ├── decimalInput.ts         parseDecimalInput(): a typed number with a comma or a point, no sign, no grouping
│   ├── localDate.ts            YYYY-MM-DD dates in UTC, addDays() from packages/types, formatDay() and formatDayShort() in the device's language, formatMomentDay() and formatMomentTime() for a moment in a zone, todayIn() and dayLabel()
│   ├── week.ts                 The Monday to Sunday week: weekOf() from packages/types, stepWeek() and weekDates()
│   ├── targetFormat.ts         formatTarget(): a target's figure, with no digit grouping
│   ├── foodFormat.ts           formatKcal(), formatMacroGrams() and formatGrams() for display, and formatDecimalForField() for a saved value as typed
│   ├── entryFormat.ts          formatCount(): a portion or meal count for display
│   ├── deviceTimeZone.ts       Stores the device's time zone on the account once per app start, failures dropped quietly
│   ├── providers.ts            Reads GET /auth/providers on the server
│   ├── queryClient.ts          The query client's defaults
│   ├── queryKeys.ts            Every query key, from one factory
│   ├── appName.ts              The app's name, for the browser's title
│   ├── queryOptions.ts         The options for every read
│   ├── redirect.ts             Resolves a redirect target and keeps it only when it stays on this site
│   ├── sessionMarker.ts        The non-secret flag that says this device has a known session, and its address
│   ├── foodCache.ts            Edits to the cached food reads from a write's own answer
│   ├── mealCache.ts            Edits to the cached saved meal lists and recent items from a meal write's own answer
│   ├── recipeCache.ts          Edits to the cached recipe lists, the recent items and a recipe's page from a recipe write's own answer
│   ├── recipeRead.ts           A recipe as the server holds it, for a form that starts from it: the cached one when fresh, else read first
│   ├── recipeNav.ts            Whether a recipe's page was opened from inside the app, the list's place, with its order and bounds, and the day's place for the way back, kept on the history entry, the row to focus after a delete
│   ├── connectionCache.ts      Edits to the cached connections list from a connection write's own answer
│   ├── revealRefused.ts        Brings a form sheet's first refused field, its label and line where they fit, into view in its body
│   ├── invalidation.ts         What each write makes stale
│   ├── connectionInvalidation.ts  What each write to the connections makes stale, named through invalidation.ts
│   ├── refreshReads.ts         refresh(): cancels the reads in flight under some keys, then reads them again
│   ├── settledWithin.ts        Whether a promise settles within a time, giving up at once while offline
│   ├── forgetDevice.ts         Drops the cached signed-in pages after the account is deleted
│   ├── googleLink.ts           The results a Google link comes back with
│   ├── focus.ts                Whether focus is still inside an overlay, so closing it puts focus back only then
│   ├── focusAfterRemoval.ts    Where focus goes when a row leaves the page
│   ├── sheetTab.ts             A sheet's Tab stops, and where Tab goes from its two ends and from outside it
│   ├── lastInputModality.ts    Which input the reader last used, so a focus put back after a tap paints no ring
│   ├── backend.ts              The backend's URL for server code, which production refuses to guess
│   └── theme/noFlashScript.ts  The pre-paint theme script and its storage key
├── __tests__/
│   ├── setup.ts                Runs before every test file: the real catalog, a query client per render, the pinned locale
│   ├── helpers/locale.ts       Pins the locale tests format with to en-US, and setTestLocale for another
│   ├── helpers/connectionsServer.ts  A fake /connections server behind the real API client, and testConnectionKey() for keys made at run time
│   ├── helpers/reactTree.ts    Whether any component in a rendered tree still holds a string in its props or state
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

Every string the app renders is an entry in `messages/en.json`, read with `useTranslations` from `next-intl`. A literal in JSX, an `aria-label`, a placeholder or a title is a lint error. Keys are typed, so a misspelled key fails `tsc`. The names of the person's lists and the buttons that start an item in one, such as "My meals" and "New food", are in the `lists` namespace, which the Library, the log sheet and the ingredient picker share.

The lint rule has two blind spots, which review catches instead: a template literal rendered in JSX, such as ``{`Signed in as ${email}`}``, and a string held in a `const` and rendered through it. Neither passes review.

An error from the API or a route handler is shown by its `code`, through `errors.<code>` in the catalog, with `useErrorCopy()`. The server's own `message` is never shown. A code with no line is listed in `CODES_WITHOUT_COPY` in `lib/errorCopy.ts` with its reason.

The catalog tests check that the catalog works: no empty entry, no code word such as "token" on screen, no plural that fails to render, no key no code can reach, and a line for every error code.

## Styling

Style only through the tokens in `src/app/globals.css` and the recipes in `src/components/ui/styles.ts`. Tailwind's own palette is switched off, and a raw palette class is a lint error. [The colour reference](../../docs/app/colors.md) says what each token is for. Light and dark both have to look right. The four macro hues are drawn by `MacroDot` and `Gauge` only, and a test fails when any other file names one. The safe-area insets are read in `globals.css` only, as `--safe-top`, `--safe-right`, `--safe-bottom` and `--safe-left`. A page's side gutter is `--page-pad-left` and `--page-pad-right`, which `PageContainer` pads by and a page's chip row (`pageChipRow`) bleeds through.

## Sheets and dialogs

Every overlay is `BottomSheet`, `ConfirmDialog` or `FormSheet` from `src/components/ui/`, never a hand-built one. Below `md` it is a bottom sheet with a drag handle, and from `md` a centred dialog. [The sheet primitives](../../docs/app/shell.md#the-sheet-primitives) state every convention they keep, and `docs/design/mobile-ui-lessons.md` says why.

To add a form sheet, such as the estimate sheet:

1. Write it as a `FormSheet`. Pass `dirty` from `useFormDirty`, `submitting`, `onSubmit` and `formError`, a `FormFailure` that holds the line and the error behind it, and render the fields from its render prop, giving the first field the `autoFocus` it hands you. `FormSheet` does the rest: dismissal only while clean and idle, the keyboard, the body that takes focus on a phone, the footer and the in-flight guard.
2. Put other `BottomSheet` options in `sheet`, and a secondary action in `footerStart`, with `tone: "neutral"` to draw it in ink rather than the accent. It takes one of two forms:
   - `{ label, onPress }` for an action that opens something, such as a delete that asks first. `onPress` gets the button, for a confirmation to return focus to.
   - `{ label, busy, submit }` for a second submit of the same form, such as "Save meal" beside "Save and log". `onSubmit` receives `submit` as its mode. Save and Enter call it with no mode.
3. In the caller, keep it mounted with `useSheetTarget`: render it while `shown` is set, with `key={shown.key}`, `open={isOpen}` and `returnFocusTo={shown.opener}`. A sheet that opens on something takes it as `useSheetTarget<T>()`, `open(opener, value)` and `shown.value`.
4. Pass `held` while the sheet's writes must wait, such as while `useToday()` reports `holding`. Save and the secondary action then ignore a press, and Cancel and every dismissal stay free.
5. Run `describeFormSheetContract` from `src/__tests__/formSheet.tsx` in its test. A sheet with no field that raises the keyboard, such as one of a date and boxes, passes `keyboardField: null`, and the contract then checks that it holds none.

A refusal that belongs to no field goes in `formError`, as `{ line, cause }`: the line from `useFailureLine`, and the error the write threw, or null for a line the sheet decided itself. `FormSheet` shows it in the pinned footer above the buttons. On a phone the footer keeps no room for it: it grows upward when a refusal shows, with the buttons where they were, and the field that holds focus comes back into view if the taller footer covers it. From `md` the footer keeps two lines of room for it, because the dialog grows downward and would move the buttons. A failure that arrives while the app knows it is offline, and that the connection explains, shows "You are offline. Changes need a connection." whatever the line says, so a sheet never words that case itself. A refusal the server answered keeps its own line. After a refused submit `FormSheet` scrolls the first refused field, its line included, into view: describe each field by its line (`aria-describedby`), as `Field` and `DecimalField` do, and it finds the block. A secondary action nobody needs while typing, such as Remove entry, passes `yieldsToKeyboard`, so its row gives its room to the keyboard. A second submit never does.

Lay a form's fields out with the recipes in `styles.ts`: the form is a `formStack`, 8 pixels between fields, and a section's heading or a closing note takes `sectionStart`, 16 pixels from what is above it. Every field that can be refused keeps one line of room under it (`lineRoom`). A control that cannot be refused, such as a segmented control, keeps none and takes `linelessBlock`, 16 pixels to the block under it. A page's form uses the same recipes, with `FormError` between the last field and the submit button: no room on a phone, two lines from `md`, as in a sheet's footer (`refusalLine`). A form sheet's last field's line is the room above the footer: the body adds only 4 pixels under it (`form-ends-in-line` in `globals.css`). Write each line under a field to fit one line at 320 pixels wide, about 40 characters. A form sheet is as tall as its form and holds that height once open, so do not pass `size="tall"` for a form. The recipe editor is the one form passed `size="tall"`: its ingredients grow while it is open and the ingredient picker stacks on it, so its top edge holds at every length.

A confirmation is a `ConfirmDialog`. One in front of a write that takes a row off the page goes through `useConfirmedDelete`, which renders the dialog and moves focus once the row is gone.

## Toasts

A short outcome on the page, such as "Removed Rahka." with Undo, is a toast from `src/components/ui/Toast.tsx`. `AppShell` mounts its one region, so a screen only calls `useToast().show({ message, action })`. The action's `onPress` receives `{ fromKeyboard }`, so it can move focus where its result shows after a keyboard press. Only one toast shows at a time, and it sits under every sheet: a sheet shows its own outcomes inside itself. A page whose last rows hold actions passes `clearToast="full"` to `PageContainer`, so a toast never covers them. A page whose last line is not an action, such as a recipe's page with its date line, passes `clearToast="half"`. [The toast primitive](../../docs/app/shell.md#the-toast-primitive) states its rules.

## Numbers and dates

A number a person types is a `DecimalField`, a text field with an `inputMode`, never `type="number"`, which refuses the comma a Finnish keypad types. Use `inputMode="numeric"` for whole numbers and `"decimal"` where a decimal is likely. A number field never has a placeholder. `layout="beside"` puts the label on the left of a 9rem field, one row each, for a column of short figures such as a label's values per 100 g. A beside field whose unit can be a word is 11rem. A field whose unit changes, such as grams or portions, passes its longest unit as `widestUnit`, so its width holds as the unit changes. The line under it keeps one line of room. The field keeps room at its end for its unit: 1.75rem for one letter such as "g", 3rem for a short unit such as "kcal", and 5.5rem for a word such as "portions" or "meals".

Parse what it holds with `parseDecimalInput(raw, { maxDecimals })` from `src/lib/decimalInput.ts`. It answers `empty`, `invalid`, `group` or a `number`:

- It accepts digits with one comma or one point as the decimal separator, whatever the device's language. "9,8" and "9.8" are both 9.8.
- It refuses a sign, grouping and more decimals than `maxDecimals`, and never rounds. Trailing zeros in a fraction of one or two digits count for nothing, so "120.50" fits one decimal.
- A number that may be one thousands group, such as "2,000" or "1.500", comes back as `group` in every field, also one that allows three decimals. Leading zeros are dropped first, so "012,345" is a group too. So a value from 1 to 999 cannot carry a third decimal when typed. A form shows `group` with the line `common.digitGroup`, so the reader learns what to type instead. A count of portions, meals or servings is the exception: it is at most 100, so `parseCount` in `components/entries/amount.ts` refuses a `group` with the count's own range line.

Show a figure without digit grouping and in Latin digits, as `formatTarget` in `src/lib/targetFormat.ts` does, so what shows can be typed back. Join a figure to its unit with a no-break space in the catalog, as in `"{value}\u00a0g"`, so a narrow line never parts them.

A choice from a short fixed list is a `SelectField`, the platform's own select.

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

- A test of the Connected AI section talks to `fakeConnectionsServer()`, which stands behind the real API client and remembers what it was sent. Keys come from `testConnectionKey()` at run time, never as literals, because a secret scan reads every committed file. The fake server also holds each connection's record and pages it as the route does: a cursor names the last change a page showed, and one it never issued, or whose change has left the record, is refused. It records each request's query parameters, so a test can check the cursor a read sent.
- Component tests mock `next/navigation` and `useAuth`. `src/__tests__/helpers/auth.ts` has `fakeAuth(status)` and `testPassword()`, which makes a password at run time, so no test holds a literal one.
- Every `render` and `renderHook` gets the real catalog and its own query client from `src/__tests__/setup.ts`. Never mock `next-intl`.
- Every test formats figures and dates in `en-US`, whatever the machine's locale. The app formats in the device's language, which under jest would be the machine's. `src/__tests__/helpers/locale.ts` pins it, and `setTestLocale("fi-FI")` shows a screen as a device in another language would, for that test only.
- The default environment is jsdom plus Node's `Response`, `Request` and `Headers`. `fetch` is not provided, so a test that reaches the network stubs it.
- Route handler suites start with `/** @jest-environment node */` and build requests with `browserRequest()` from `src/app/api/auth/__tests__/support.ts`.
- `src/app/__tests__/safeAreas.test.ts` fails when a file other than `globals.css` reads the safe-area insets.
- `components/day/__tests__/harness.tsx` renders the Day tab with its providers and reads its rows and toasts. It runs against `fakeDays.ts`, a fake of the entry and saved meal routes that keeps the server's rules that show on screen. It holds the recipes a test puts in its `recipes`, so a recipe entry can be added, and answers `GET /recipes` from its `recipeSummaries`. `components/log/__tests__/logHarness.tsx` builds the log sheet's worlds: `logWorld()`, and `recipeLogWorld()` with two recipes, one of them a recent item.
- `components/recipes/__tests__/recipeServer.ts` is a fake of the recipe routes that keeps the rules a screen can see: a create applied once, an edit that keeps the id of an identical line, and a refused line named by its index. `recipeFixtures.ts` builds recipes whose figures come from `recipeBasis` and `entryFigures`, never typed by hand. `cookServer.ts` is a fake of `POST /cooks` over the fake days and recipe servers, which answers a second request under one id as a replay. It computes a batch's figures and what it changed with the shared functions too, so a suite's "the figures equal the server's" compares the sheet's reading of its lines with the request it sends. A browser walk against the real backend is what shows the two agree.
- `src/__tests__/sheet.ts` drives sheets through Base UI's own code: `swipeSheetDown`, `pressOutsideSheet`, `holdSheetExits`, `controlSheetAnimations`, `confirmArmed`, `trackFocus`. `formSheet.tsx` has `describeFormSheetContract` and `stubPhone`.
- The barcode decoder is tested on real barcodes: `components/foods/scanner/__tests__/decoder.test.ts` runs in Node, draws each image with `zxing-wasm/writer` at test time and passes the wasm's bytes as `wasmBinary`. `decoderRetry.test.ts` retries a failed load with the real library. Every other scanner suite stubs the camera, the video, the canvas, the picture's layout and the decoder with `components/foods/__tests__/scannerFakes.ts`, because jsdom has none of them.
- Layout, motion and the service worker are checked in a real browser against a production build. Unit tests do not show them. The scanner runs in Chromium with `--use-fake-ui-for-media-stream --use-fake-device-for-media-stream`, and `--use-file-for-fake-video-capture=<file>.y4m` plays a barcode to it. Make the `.y4m` from a barcode image with `ffmpeg -loop 1 -i code.png -t 5 -pix_fmt yuv420p code.y4m`, outside the repository.
