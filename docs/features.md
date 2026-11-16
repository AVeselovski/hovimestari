# Feature catalog

Every feature Hovimestari has, one or two sentences each, with a link to its detail doc. Anything not listed here is not built. What is planned is in [the requirements](requirements.md#mvp-scope-and-later), and the product framing is in the [overview](overview.md).

Feature docs and page docs are two different axes. A feature doc says what a feature is and how it works. A page doc says what a page is for, what it shows and which features it composes. A page composes several features, and a feature appears on several pages. A new feature starts from [the feature template](_templates/feature.md) and a new page from [the page template](_templates/page.md).

## Accounts

- **[Authentication](features/authentication.md)**: signing up and in with a password or Google, staying signed in, recovering a forgotten password, changing, adding or removing the password, linking or unlinking Google, signing out on all devices, and deleting the account with everything in it. No browser JavaScript ever holds a refresh token.

## Targets

- **[Targets](features/targets.md)**: a calorie range and a protein range in the user's own numbers, asked for on a first-run page before anything else and changed in Settings from a date the user picks. Each day is measured against the change in force on it, and the app offers no default and no suggestion.

## Foods

- **[Foods](features/foods.md)**: the food catalogue of shared foods, such as Fineli's, and each user's own foods, with portions, favourites, names in Finnish or English, and one ranked search over both names. Fineli's foods and household measures arrive through a repeatable import that retires, never deletes, a food that leaves a release.

## Days and logging

- **[Days](features/days.md)**: a day's entries, foods by weight, saved meals by count and estimates, each planned or eaten, added up twice, as what was eaten and as what the day comes to with the plan, each placed against the user's own targets with a distance. Built in the API, with no screen yet.
- **[Quick logging](features/quick-logging.md)**: adding, editing, moving, marking, copying, removing and restoring entries, each with an undo, and recent items to log again with the amount of the last time. Built in the API, with no screen yet.
- **[Saved meals](features/saved-meals.md)**: a meal eaten again and again, saved once with its source and its figures for one meal, and logged by count. Built in the API, with no screen yet.

## The app

- **[Appearance](features/appearance.md)**: a light theme, a dark theme, or following the device, chosen in Settings and kept on each device. The first frame is already in the chosen theme.
- **[Installable app](features/installable-app.md)**: installs to a phone's home screen and opens without the browser's bar. A visited tab opens again offline, with a plain line saying so.
