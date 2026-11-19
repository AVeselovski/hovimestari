# Feature catalog

Every feature Hovimestari has, one or two sentences each, with a link to its detail doc. Anything not listed here is not built. What is planned is in [the requirements](requirements.md#mvp-scope-and-later), and the product framing is in the [overview](overview.md).

Feature docs and page docs are two different axes. A feature doc says what a feature is and how it works. A page doc says what a page is for, what it shows and which features it composes. A page composes several features, and a feature appears on several pages. A new feature starts from [the feature template](_templates/feature.md) and a new page from [the page template](_templates/page.md). The pages follow the features.

## Accounts

- **[Authentication](features/authentication.md)**: signing up and in with a password or Google, staying signed in, recovering a forgotten password, changing, adding or removing the password, linking or unlinking Google, signing out on all devices, and deleting the account with everything in it. No browser JavaScript ever holds a refresh token.

## Targets

- **[Targets](features/targets.md)**: a calorie range and a protein range in the user's own numbers, offered once on a first-run page, which a person may pass by, and changed in Settings from a date the user picks. A user may have no targets and log all the same. A change applies from its date, a day before the first change has none, and the app offers no default and no suggestion.

## Foods

- **[Foods](features/foods.md)**: the food catalogue of shared foods, such as Fineli's, and each user's own foods, with portions, favourites, names in Finnish or English, one ranked search over both names, a repeatable Fineli import that retires, never deletes, a food that leaves a release, and a barcode lookup, own foods first and then Open Food Facts, that keeps a product found once and shows it to the users who looked it up. In the log sheet a person searches it, logs a food by weight or portion, reads its figures per 100 g, marks favourites, and adds, edits and deletes foods and portions of their own.

## Days and logging

- **[Days](features/days.md)**: a day's entries, foods by weight, saved meals by count and estimates, each planned or eaten, added up twice, as what was eaten and as what the day comes to with the plan, each placed against the user's own targets with a distance on days that have them. The Day tab shows one day at a time, and the log sheet adds estimates to it. The week sheet on the Day tab shows seven days side by side.
- **[Quick logging](features/quick-logging.md)**: adding, editing, moving, marking, copying, removing and restoring entries, each with an undo, and recent items to log again with the amount of the last time. Marking eaten, editing, moving and removing, each with Undo, are on the Day tab. Adding a food, a saved meal or an estimate, saving a new meal and logging it in one action, and logging a recent item again in one press are in the log sheet. Copying is in the API only.
- **[Saved meals](features/saved-meals.md)**: a meal eaten again and again, saved once with its source and its figures for one meal, and logged by count. The log sheet lists them with a filter by source, logs them, saves new ones alone or with their first log, and edits, archives, restores and deletes them.

## The app

- **[Appearance](features/appearance.md)**: a light theme, a dark theme, or following the device, chosen in Settings and kept on each device. The first frame is already in the chosen theme.
- **[Installable app](features/installable-app.md)**: installs to a phone's home screen and opens without the browser's bar. A visited tab opens again offline, with a plain line saying so.

## Pages

- **[The app shell](app/shell.md)**: the frame every signed-in screen sits in, with the four tabs, the sheets and the toasts.
- **[Day](app/day.md)**: one day, its two readings against the person's targets, and its entries to mark, change and remove.
- **[The log sheet](app/log-sheet.md)**: logging a food, a saved meal or an estimate to a day, logging a recent item again in one press, finding a food or a meal, reading its figures, and keeping foods and saved meals of your own.
- **[Settings](app/settings.md)**: targets, the language of food names, the theme, sign-in methods, the account and the food data credit.
- **[First run](app/first-run.md)**: the page that offers a new account its targets, once, before the tabs, and opens again from a day for a user with none.
- **[Sign-in and account pages](app/auth.md)**: signing in, creating an account and resetting a password.
- **[Colours and type](app/colors.md)**: the design tokens every screen paints with.
