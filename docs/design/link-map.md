# Link map

Every concept's home: the heading in the doc that owns it. The first mention of a concept in a human-facing doc links here. An agent that adds a home heading adds its row to this table in the same change, and one that renames a heading repoints every link to it in that change.

Paths are relative to `docs/`. The **Heading** column is the exact heading text, so the anchor resolves. "Doc" means link the doc itself, with no anchor.

Group rows by area, one `##` heading per area, in the same order as the feature catalog.

## Authentication

| Concept                                                                      | Home                                                                    | Heading                                          |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------ |
| signing up, signing in, account                                              | `features/authentication.md#signing-up-and-signing-in`                  | `### Signing up and signing in`                  |
| sign-in methods, linking Google, adding a password                           | `features/authentication.md#sign-in-methods`                            | `### Sign-in methods`                            |
| staying signed in, session                                                   | `features/authentication.md#staying-signed-in`                          | `### Staying signed in`                          |
| the browser session through the web server, relay                            | `features/authentication.md#the-browser-session-through-the-web-server` | `### The browser session through the web server` |
| rate limits                                                                  | `features/authentication.md#rate-limits`                                | `### Rate limits`                                |
| forgotten password, reset link                                               | `features/authentication.md#forgotten-password`                         | `### Forgotten password`                         |
| deleting an account, the cascade rule                                        | `features/authentication.md#deleting-the-account`                       | `### Deleting the account`                       |
| one-time codes                                                               | `features/authentication.md#one-time-codes`                             | `### One-time codes`                             |
| access token, refresh token, rotation, token family, superseded token, reuse | `features/authentication.md#tokens`                                     | `### Tokens`                                     |
| Google sign-in, Continue with Google                                         | `features/authentication.md#google-sign-in`                             | `### Google sign-in`                             |
| password hashing, the 72-byte rule                                           | `features/authentication.md#passwords-and-reset-links`                  | `### Passwords and reset links`                  |
| error codes, the error body                                                  | `features/authentication.md#errors`                                     | `### Errors`                                     |
| redirect after sign-in, `?redirect=`                                         | `features/authentication.md#the-redirect-after-sign-in`                 | `### The redirect after sign-in`                 |
| the same-origin guard                                                        | `features/authentication.md#the-same-origin-guard`                      | `### The same-origin guard`                      |
| linking Google, the link nonce, `?google=`                                   | `features/authentication.md#linking-google`                             | `### Linking Google`                             |

## The app

| Concept                                                 | Home                                                                    | Heading                                          |
| ------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------ |
| theme, light and dark, following the device             | `features/appearance.md#choosing-a-theme`                               | `### Choosing a theme`                           |
| the pre-paint theme script                              | `features/appearance.md#the-pre-paint-script`                           | `### The pre-paint script`                       |
| the browser chrome colour, `theme-color`                | `features/appearance.md#the-browser-chrome-colour`                      | `### The browser chrome colour`                  |
| installing the app, home screen                         | `features/installable-app.md#installing`                                | `### Installing`                                 |
| the web manifest                                        | `features/installable-app.md#the-manifest`                              | `### The manifest`                               |
| offline, the offline line                               | `features/installable-app.md#without-a-network`                         | `### Without a network`                          |
| the service worker, cached pages                        | `features/installable-app.md#the-service-worker`                        | `### The service worker`                         |
| safe areas, insets                                      | `features/installable-app.md#safe-areas`                                | `### Safe areas`                                 |
| the app shell, tabs, tab bar, side rail                 | `app/shell.md`                                                          | Doc                                              |
| server fault, Something went wrong, Try again           | `app/shell.md#when-the-server-is-at-fault`                              | `### When the server is at fault`                |
| the known-session flag, offline sign-in side            | `features/authentication.md#the-browser-session-through-the-web-server` | `### The browser session through the web server` |
| the shell's layout, one scroll container                | `app/shell.md#layout`                                                   | `### Layout`                                     |
| Recipes tab, keeping foods and meals                    | `app/recipes.md`                                                        | Doc                                              |
| the archived meals on the Recipes tab                   | `app/recipes.md#archived-meals`                                         | `### Archived meals`                             |
| design tokens, colours                                  | `app/colors.md#colour-tokens`                                           | `### Colour tokens`                              |
| the accent, what it means                               | `app/colors.md#what-the-accent-means`                                   | `### What the accent means`                      |
| macro hues, energy, protein, carbohydrates, fat         | `app/colors.md#the-macro-hues`                                          | `### The macro hues`                             |
| contrast                                                | `app/colors.md#contrast`                                                | `### Contrast`                                   |
| type, typefaces, type scale                             | `app/colors.md#type`                                                    | `### Type`                                       |
| motion tokens, sheet curve, reduced motion              | `app/colors.md#motion`                                                  | `### Motion`                                     |
| z-index ladder, layers                                  | `app/colors.md#layers`                                                  | `### Layers`                                     |
| sheets and dialogs, swipe to close                      | `app/shell.md#sheets-and-dialogs`                                       | `### Sheets and dialogs`                         |
| bottom sheet, confirm dialog, sheet conventions         | `app/shell.md#the-sheet-primitives`                                     | `### The sheet primitives`                       |
| sign-in pages, guest pages                              | `app/auth.md`                                                           | Doc                                              |
| settings, sign-in methods, account actions              | `app/settings.md`                                                       | Doc                                              |
| first-run page                                          | `app/first-run.md`                                                      | Doc                                              |
| number fields, date fields, parseDecimalInput           | `../apps/web/README.md#numbers-and-dates`                               | `## Numbers and dates`                           |
| targets sheet, change targets, remove a change          | `app/settings.md#targets`                                               | `### Targets`                                    |
| food names setting, Finnish or English choice           | `app/settings.md#food-names`                                            | `### Food names`                                 |
| food data credit in Settings, Fineli attribution        | `app/settings.md#food-data`                                             | `### Food data`                                  |
| Day tab, Log food launcher, date bar                    | `app/day.md`                                                            | Doc                                              |
| the Day tab's header that stays in view, its hairline   | `app/day.md#the-header`                                                 | `### The header`                                 |
| the remembered day, the Day link, back to today         | `app/day.md#coming-back-to-the-tab`                                     | `### Coming back to the tab`                     |
| the day summary, the gauge on screen                    | `app/day.md#the-summary`                                                | `### The summary`                                |
| the gauge's drawing, band, ticks, end-cap               | `app/day.md#the-gauge`                                                  | `### The gauge`                                  |
| the week sheet, the Week button                         | `app/day.md#the-week`                                                   | `### The week`                                   |
| entry rows, mark eaten, Mark all eaten                  | `app/day.md#the-entries`                                                | `### The entries`                                |
| entry sheet                                             | `app/day.md#the-entry-sheet`                                            | `### The entry sheet`                            |
| the copy sheet, Copy in the Entries row                 | `app/day.md#the-copy-sheet`                                             | `### The copy sheet`                             |
| toast, undo toast                                       | `app/shell.md#toasts`                                                   | `### Toasts`                                     |
| the toast primitive, useToast                           | `app/shell.md#the-toast-primitive`                                      | `### The toast primitive`                        |
| gauge colours, plan tints, target band                  | `app/colors.md#the-gauge`                                               | `### The gauge`                                  |
| log sheet page, food search screen                      | `app/log-sheet.md`                                                      | Doc                                              |
| food search results, browse lists, no results           | `app/log-sheet.md#the-search`                                           | `### The search`                                 |
| food view, per 100 g figures, favourite star            | `app/log-sheet.md#a-food`                                               | `### A food`                                     |
| own-food sheet, add a food, edit food                   | `app/log-sheet.md#adding-or-editing-your-own-food`                      | `### Adding or editing your own food`            |
| typed barcode in the log sheet, the barcode block       | `app/log-sheet.md#a-typed-barcode`                                      | `### A typed barcode`                            |
| portion sheet, add a portion                            | `app/log-sheet.md#portions-of-your-own`                                 | `### Portions of your own`                       |
| the log sheet's status line                             | `app/log-sheet.md#the-status-line`                                      | `### The status line`                            |
| "+", logging again on screen                            | `app/log-sheet.md#logging-again-in-one-press`                           | `### Logging again in one press`                 |
| the log block, a food's log                             | `app/log-sheet.md#a-food`                                               | `### A food`                                     |
| meal view, edit meal, archive meal, delete meal         | `app/log-sheet.md#a-saved-meal`                                         | `### A saved meal`                               |
| archived meals view, restore                            | `app/log-sheet.md#archived-meals`                                       | `### Archived meals`                             |
| saved meal sheet, save and log, save meal               | `app/log-sheet.md#a-new-saved-meal`                                     | `### A new saved meal`                           |
| estimate sheet, add an estimate                         | `app/log-sheet.md#an-estimate`                                          | `### An estimate`                                |
| closing sheet swallows presses, refused field into view | `app/shell.md#the-sheet-primitives`                                     | `### The sheet primitives`                       |
| tall sheet, sheet with a fixed height                   | `app/shell.md#the-sheet-primitives`                                     | `### The sheet primitives`                       |

## Targets

| Concept                                                                          | Home                                                 | Heading                              |
| -------------------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------ |
| targets, calorie range, protein range, floor                                     | `features/targets.md#setting-your-targets`           | `### Setting your targets`           |
| dated change, targets in force                                                   | `features/targets.md#changing-your-targets`          | `### Changing your targets`          |
| targets sheet fields, the days a change applies to                               | `features/targets.md#new-targets-and-edited-targets` | `### New targets and edited targets` |
| which targets a day uses, a day without targets                                  | `features/targets.md#which-targets-a-day-uses`       | `### Which targets a day uses`       |
| first run, no targets yet, going on without targets, opening it again from a day | `features/targets.md#the-first-run`                  | `### The first run`                  |
| first-run gate, spinner or tabs or first run                                     | `features/targets.md#the-first-run-gate`             | `### The first-run gate`             |
| not advice, no default target                                                    | `features/targets.md#not-advice`                     | `### Not advice`                     |
| today, the user's time zone                                                      | `features/targets.md#today-and-the-time-zone`        | `### Today and the time zone`        |

## Foods

| Concept                                   | Home                                     | Heading                    |
| ----------------------------------------- | ---------------------------------------- | -------------------------- |
| food catalogue, food source, retired food | `features/foods.md#the-food-catalogue`   | `### The food catalogue`   |
| food search, search ranking               | `features/foods.md#searching-for-a-food` | `### Searching for a food` |
| own food                                  | `features/foods.md#your-own-foods`       | `### Your own foods`       |
| portions, household measures              | `features/foods.md#portions`             | `### Portions`             |
| favourites                                | `features/foods.md#favourites`           | `### Favourites`           |
| food-name language                        | `features/foods.md#food-name-language`   | `### Food-name language`   |
| Fineli, its credit and licence            | `features/foods.md#fineli`               | `### Fineli`               |
| Fineli import, Fineli release             | `features/foods.md#the-fineli-import`    | `### The Fineli import`    |
| barcode lookup, Open Food Facts product   | `features/foods.md#looking-up-a-barcode` | `### Looking up a barcode` |
| Open Food Facts, its credit and licence   | `features/foods.md#open-food-facts`      | `### Open Food Facts`      |
| food visibility, food scope               | `features/foods.md#visibility`           | `### Visibility`           |

## Days and logging

| Concept                                         | Home                                                         | Heading                                |
| ----------------------------------------------- | ------------------------------------------------------------ | -------------------------------------- |
| day, entry, food entry, saved meal entry        | `features/days.md#a-day-and-its-entries`                     | `### A day and its entries`            |
| planned and eaten, unmarked                     | `features/days.md#planned-and-eaten`                         | `### Planned and eaten`                |
| the two totals, eaten, planned, rounding        | `features/days.md#the-two-totals`                            | `### The two totals`                   |
| position, distance, where a day stands          | `features/days.md#where-a-day-stands`                        | `### Where a day stands`               |
| figures that stay, basis, hidden source         | `features/days.md#figures-that-stay`                         | `### Figures that stay`                |
| the week, a range of days                       | `features/days.md#the-week`                                  | `### The week`                         |
| estimate                                        | `features/days.md#estimates`                                 | `### Estimates`                        |
| the figure computation                          | `features/days.md#how-figures-are-computed`                  | `### How figures are computed`         |
| adding, editing and moving an entry             | `features/quick-logging.md#adding-and-changing-an-entry`     | `### Adding and changing an entry`     |
| marking eaten, marking planned                  | `features/quick-logging.md#marking-eaten`                    | `### Marking eaten`                    |
| copying entries                                 | `features/quick-logging.md#copying-entries`                  | `### Copying entries`                  |
| recent items, the last amount                   | `features/quick-logging.md#recent-items-and-the-last-amount` | `### Recent items and the last amount` |
| logging again                                   | `features/quick-logging.md#logging-again`                    | `### Logging again`                    |
| client-chosen ids, replays                      | `features/quick-logging.md#a-request-sent-twice`             | `### A request sent twice`             |
| undo, removing and restoring an entry           | `features/quick-logging.md#undo`                             | `### Undo`                             |
| without a connection, refused writes            | `features/quick-logging.md#without-a-connection`             | `### Without a connection`             |
| web entry writes, counted writes, held          | `features/quick-logging.md#writes-from-the-web-app`          | `### Writes from the web app`          |
| the log sheet                                   | `features/quick-logging.md#the-log-sheet`                    | `### The log sheet`                    |
| pending ids, one-tap adds                       | `features/quick-logging.md#writes-from-the-web-app`          | `### Writes from the web app`          |
| user row lock, write races                      | `features/quick-logging.md#locks-and-races`                  | `### Locks and races`                  |
| saved meal, meal source                         | `features/saved-meals.md#a-saved-meal`                       | `### A saved meal`                     |
| a save that could not confirm, saved meal retry | `features/saved-meals.md#a-save-that-could-not-confirm`      | `### A save that could not confirm`    |
| archiving and deleting a saved meal             | `features/saved-meals.md#archiving-and-deleting`             | `### Archiving and deleting`           |
| source filter, finding a meal by its source     | `features/saved-meals.md#finding-a-meal-by-its-source`       | `### Finding a meal by its source`     |
| saving and logging a meal, editing a meal       | `features/saved-meals.md#saving-and-logging-a-meal`          | `### Saving and logging a meal`        |
| saved meal writes from the web, the meal cache  | `features/saved-meals.md#writes-from-the-web-app`            | `### Writes from the web app`          |

## Example area

| Concept                      | Home                                             | Heading                         |
| ---------------------------- | ------------------------------------------------ | ------------------------------- |
| example concept, its synonym | `_templates/feature.md#mechanism-in-plain-words` | `### Mechanism, in plain words` |
