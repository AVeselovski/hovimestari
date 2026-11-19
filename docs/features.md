# Feature catalog

Every feature Hovimestari has, one or two sentences each, with a link to its detail doc. Anything not listed here is not built. What is planned is in [the requirements](requirements.md#mvp-scope-and-later), and the product framing is in the [overview](overview.md).

Feature docs and page docs are two different axes. A feature doc says what a feature is and how it works. A page doc says what a page is for, what it shows and which features it composes. A page composes several features, and a feature appears on several pages. A new feature starts from [the feature template](_templates/feature.md) and a new page from [the page template](_templates/page.md). The pages follow the features.

## Accounts

- **[Authentication](features/authentication.md)**: signing up and in with a password or Google, staying signed in, recovering a forgotten password, changing, adding or removing the password, linking or unlinking Google, signing out on all devices, and deleting the account with everything in it. No browser JavaScript ever holds a refresh token.

## Targets

- **[Targets](features/targets.md)**: a calorie range and a protein range in the user's own numbers, offered once on a first-run page, which a person may pass by, and changed in Settings from a date the user picks. A user may have no targets and log all the same. A change applies from its date, a day before the first change has none, and the app offers no default and no suggestion.

## Foods

- **[Foods](features/foods.md)**: the food catalogue of shared foods, such as Fineli's, and each user's own foods, with portions, favourites, names in Finnish or English, one ranked search over both names and a repeatable Fineli import, searched and logged in the log sheet, with own foods kept there and on the Recipes tab. A barcode lookup, in the API only, finds a product among a user's own foods, then at Open Food Facts, and keeps a product it finds.

## Days and logging

- **[Days](features/days.md)**: a day's entries, foods by weight, saved meals by count and estimates, each planned or eaten, added up twice, as what was eaten and as what the day comes to with the plan, each placed against the user's own targets with a distance on days that have them. The Day tab shows one day, and its week sheet the seven days of a week side by side, and the log sheet adds estimates.
- **[Quick logging](features/quick-logging.md)**: adding, editing, moving, marking, copying, removing and restoring entries, each with an undo, and recent items to log again with the amount of the last time. Marking eaten, editing, moving and removing, each with Undo, are on the Day tab. Adding a food, a saved meal or an estimate, saving a new meal and logging it in one action, and logging a recent item again in one press are in the log sheet. Copying entries to another day, with Undo, is on the Day tab.
- **[Saved meals](features/saved-meals.md)**: a meal eaten again and again, saved once with its source and its figures for one meal, and logged by count. The log sheet lists them with a filter by source and logs them, and the log sheet and the Recipes tab both save, edit, archive, restore and delete them.

## The app

- **[Appearance](features/appearance.md)**: a light theme, a dark theme, or following the device, chosen in Settings and kept on each device. The first frame is already in the chosen theme.
- **[Installable app](features/installable-app.md)**: installs to a phone's home screen and opens without the browser's bar. A visited tab opens again offline, with a plain line saying so.

## Pages

- **[The app shell](app/shell.md)**: the frame every signed-in screen sits in, with the four tabs, the sheets and the toasts.
- **[Day](app/day.md)**: one day, its two readings against the person's targets, and its entries to mark, change and remove.
- **[Recipes](app/recipes.md)**: the saved meals and your own foods, to add, edit, archive and delete.
- **[The log sheet](app/log-sheet.md)**: logging a food, a saved meal or an estimate to a day, logging a recent item again in one press, finding a food or a meal, reading its figures, and keeping foods and saved meals of your own.
- **[Settings](app/settings.md)**: targets, the language of food names, the theme, sign-in methods, the account and the food data credit.
- **[First run](app/first-run.md)**: the page that offers a new account its targets, once, before the tabs, and opens again from a day for a user with none.
- **[Sign-in and account pages](app/auth.md)**: signing in, creating an account and resetting a password.
- **[Colours and type](app/colors.md)**: the design tokens every screen paints with.
