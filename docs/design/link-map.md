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

| Concept                                         | Home                                                                    | Heading                                          |
| ----------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------ |
| theme, light and dark, following the device     | `features/appearance.md#choosing-a-theme`                               | `### Choosing a theme`                           |
| the pre-paint theme script                      | `features/appearance.md#the-pre-paint-script`                           | `### The pre-paint script`                       |
| the browser chrome colour, `theme-color`        | `features/appearance.md#the-browser-chrome-colour`                      | `### The browser chrome colour`                  |
| installing the app, home screen                 | `features/installable-app.md#installing`                                | `### Installing`                                 |
| the web manifest                                | `features/installable-app.md#the-manifest`                              | `### The manifest`                               |
| offline, the offline line                       | `features/installable-app.md#without-a-network`                         | `### Without a network`                          |
| the service worker, cached pages                | `features/installable-app.md#the-service-worker`                        | `### The service worker`                         |
| safe areas, insets                              | `features/installable-app.md#safe-areas`                                | `### Safe areas`                                 |
| the app shell, tabs, tab bar, side rail         | `app/shell.md`                                                          | Doc                                              |
| server fault, Something went wrong, Try again   | `app/shell.md#when-the-server-is-at-fault`                              | `### When the server is at fault`                |
| the known-session flag, offline sign-in side    | `features/authentication.md#the-browser-session-through-the-web-server` | `### The browser session through the web server` |
| the shell's layout, one scroll container        | `app/shell.md#layout`                                                   | `### Layout`                                     |
| design tokens, colours                          | `app/colors.md#colour-tokens`                                           | `### Colour tokens`                              |
| the accent, what it means                       | `app/colors.md#what-the-accent-means`                                   | `### What the accent means`                      |
| macro hues, energy, protein, carbohydrates, fat | `app/colors.md#the-macro-hues`                                          | `### The macro hues`                             |
| contrast                                        | `app/colors.md#contrast`                                                | `### Contrast`                                   |
| type, typefaces, type scale                     | `app/colors.md#type`                                                    | `### Type`                                       |
| motion tokens, sheet curve, reduced motion      | `app/colors.md#motion`                                                  | `### Motion`                                     |
| z-index ladder, layers                          | `app/colors.md#layers`                                                  | `### Layers`                                     |
| sheets and dialogs, swipe to close              | `app/shell.md#sheets-and-dialogs`                                       | `### Sheets and dialogs`                         |
| bottom sheet, confirm dialog, sheet conventions | `app/shell.md#the-sheet-primitives`                                     | `### The sheet primitives`                       |
| sign-in pages, guest pages                      | `app/auth.md`                                                           | Doc                                              |
| settings, sign-in methods, account actions      | `app/settings.md`                                                       | Doc                                              |
| first-run page                                  | `app/first-run.md`                                                      | Doc                                              |
| number fields, date fields, parseDecimalInput   | `../apps/web/README.md#numbers-and-dates`                               | `## Numbers and dates`                           |
| targets sheet, change targets, remove a change  | `app/settings.md#targets`                                               | `### Targets`                                    |
| food names setting, Finnish or English choice   | `app/settings.md#food-names`                                            | `### Food names`                                 |

## Targets

| Concept                                      | Home                                           | Heading                        |
| -------------------------------------------- | ---------------------------------------------- | ------------------------------ |
| targets, calorie range, protein range, floor | `features/targets.md#setting-your-targets`     | `### Setting your targets`     |
| dated change, targets in force               | `features/targets.md#changing-your-targets`    | `### Changing your targets`    |
| which targets a day uses                     | `features/targets.md#which-targets-a-day-uses` | `### Which targets a day uses` |
| first run, no targets yet                    | `features/targets.md#the-first-run`            | `### The first run`            |
| first-run gate, spinner or tabs or first run | `features/targets.md#the-first-run-gate`       | `### The first-run gate`       |
| not advice, no default target                | `features/targets.md#not-advice`               | `### Not advice`               |
| today, the user's time zone                  | `features/targets.md#today-and-the-time-zone`  | `### Today and the time zone`  |

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
| food visibility, food scope               | `features/foods.md#visibility`           | `### Visibility`           |

## Days and logging

| Concept                                    | Home                                                         | Heading                                |
| ------------------------------------------ | ------------------------------------------------------------ | -------------------------------------- |
| day, entry, food entry, saved meal entry   | `features/days.md#a-day-and-its-entries`                     | `### A day and its entries`            |
| planned and eaten, unmarked                | `features/days.md#planned-and-eaten`                         | `### Planned and eaten`                |
| the two totals, eaten, with plan, rounding | `features/days.md#the-two-totals`                            | `### The two totals`                   |
| position, distance, where a day stands     | `features/days.md#where-a-day-stands`                        | `### Where a day stands`               |
| figures that stay, basis, hidden source    | `features/days.md#figures-that-stay`                         | `### Figures that stay`                |
| the week, a range of days                  | `features/days.md#the-week`                                  | `### The week`                         |
| estimate                                   | `features/days.md#estimates`                                 | `### Estimates`                        |
| the figure computation                     | `features/days.md#how-figures-are-computed`                  | `### How figures are computed`         |
| adding, editing and moving an entry        | `features/quick-logging.md#adding-and-changing-an-entry`     | `### Adding and changing an entry`     |
| marking eaten, marking planned             | `features/quick-logging.md#marking-eaten`                    | `### Marking eaten`                    |
| copying entries                            | `features/quick-logging.md#copying-entries`                  | `### Copying entries`                  |
| recent items, the last amount              | `features/quick-logging.md#recent-items-and-the-last-amount` | `### Recent items and the last amount` |
| logging again                              | `features/quick-logging.md#logging-again`                    | `### Logging again`                    |
| client-chosen ids, replays                 | `features/quick-logging.md#a-request-sent-twice`             | `### A request sent twice`             |
| undo, removing and restoring an entry      | `features/quick-logging.md#undo`                             | `### Undo`                             |
| user row lock, write races                 | `features/quick-logging.md#locks-and-races`                  | `### Locks and races`                  |
| saved meal, meal source                    | `features/saved-meals.md#a-saved-meal`                       | `### A saved meal`                     |
| archiving and deleting a saved meal        | `features/saved-meals.md#archiving-and-deleting`             | `### Archiving and deleting`           |

## Example area

| Concept                      | Home                                             | Heading                         |
| ---------------------------- | ------------------------------------------------ | ------------------------------- |
| example concept, its synonym | `_templates/feature.md#mechanism-in-plain-words` | `### Mechanism, in plain words` |
