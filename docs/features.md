# Feature catalog

Every feature Hovimestari has, one or two sentences each, with a link to its detail doc. Anything not listed here is not built. What is planned is in [the requirements](requirements.md#mvp-scope-and-later), and the product framing is in the [overview](overview.md).

Feature docs and page docs are two different axes. A feature doc says what a feature is and how it works. A page doc says what a page is for, what it shows and which features it composes. A page composes several features, and a feature appears on several pages. A new feature starts from [the feature template](_templates/feature.md) and a new page from [the page template](_templates/page.md). The pages follow the features.

## Accounts

- **[Authentication](features/authentication.md)**: signing up and in with a password or Google, staying signed in, recovering a forgotten password, changing, adding or removing the password, linking or unlinking Google, signing out on all devices, and deleting the account with everything in it. No browser JavaScript ever holds a refresh token.

## Targets

- **[Targets](features/targets.md)**: a calorie range and a protein range in the user's own numbers, offered once on a first-run page, which a person may pass by, and changed in Settings from a date the user picks. A user may have no targets and log all the same. A change applies from its date, a day before the first change has none, and the app offers no default and no suggestion.

## Foods

- **[Foods](features/foods.md)**: the food catalogue of shared foods, such as Fineli's, and each user's own foods, with portions, favourites, names in Finnish or English, one search that finds a food by any part of either name, and a repeatable Fineli import, searched and logged in the log sheet, with own foods kept there and in the Library. Among foods that match as strongly, the search lists a basic food before a dish and, among basic foods, the one more of Fineli's recipes use first. For meats and a few staples a Finnish base form also finds its genitive, and the genitive its base form. An own food a recipe or a batch uses is hidden when its owner deletes it, and the recipe keeps it. A barcode typed in the log sheet's search, or read there by the camera on the device, is looked up among a user's own foods, then at Open Food Facts. A product found there is kept for every later lookup, and one not found is added from its label.

## Days and logging

- **[Days](features/days.md)**: a day's entries, foods by weight, saved meals by count, recipes by servings and estimates, each planned or eaten, added up twice, as what was eaten and as what the day comes to with the plan, each placed against the user's own targets with a distance on days that have them, except a past day's reading with nothing in it. A week or any range of days also gives its average day in both readings. The Day tab shows one day, and its week sheet the seven days of a week side by side with their average day, and the log sheet adds estimates.
- **[Quick logging](features/quick-logging.md)**: adding, editing, moving, marking, copying, removing and restoring entries, each with an undo, and recent items, the foods, saved meals and recipes eaten lately, to log again with the amount of the last time. Marking eaten, editing, moving and removing, each with Undo, are on the Day tab. Adding a food, a saved meal, a recipe or an estimate, saving a new meal and logging it in one action, and logging a recent item again in one press are in the log sheet. Copying entries to another day, with Undo, is on the Day tab.
- **[Saved meals](features/saved-meals.md)**: a meal eaten again and again, saved once with its source and its figures for one meal, and logged by count. The log sheet lists them with a filter by source and logs them, and the log sheet and the Library both save, edit, archive, restore and delete them.

## Recipes

- **[Recipes](features/recipes.md)**: a dish written once with its servings, ingredient lines that point at foods, lines not counted such as salt, a method, notes and tags, with figures per serving and for the whole recipe computed from its foods and never typed. A recipe reads at another number of servings, is found by words, tags and figures per serving, marked as a favourite, archived and deleted. A recipe goes on a day by servings, with one serving's figures taken when it is added, and its planned entries from today on follow later edits. A recipe that days use is hidden when deleted. A batch that came out different is logged as made, with its own lines and servings: its entries carry its figures, which no food or recipe edit changes, a copy of one plans the recipe again, and a batch can be saved as a new recipe. The Library lists them, filters them by figures per serving, sorts them and makes them from foods in an editor. A recipe's page shows its figures at any number of servings and puts servings on a day, and the log sheet lists them, finds them and logs them by servings. The as made sheet logs a batch from an entry, the log sheet or the recipe's page. A connected assistant keeps them, puts them on days and logs batches too.

## Connected AI

- **[Connected AI](features/connected-ai.md)**: named connection keys a person makes to give their own AI assistant access, read only or read and write, each with a lifetime, shown once and revoked at will. Keys are made, listed and revoked in Settings. An assistant connects with one over the Model Context Protocol and reads what the screens show: targets, days with both readings, foods, recent items, saved meals, recipes and batches made, a barcode lookup, a recipe draft's preview, and the rules for reading every figure. With a writing key it logs, plans, changes, marks, copies, removes and restores entries, adds and edits the person's own foods and portions, marks favourites, saves, edits and archives saved meals, creates, edits, tags and archives recipes, marks them as favourites and puts them on days, logs a batch as made and saves it as a recipe, and sets and removes targets. Every change it makes is recorded under the connection's name, and the person reads that record in Settings under Activity.

## The app

- **[Appearance](features/appearance.md)**: a light theme, a dark theme, or following the device, chosen in Settings and kept on each device. The first frame is already in the chosen theme.
- **[Installable app](features/installable-app.md)**: installs to a phone's home screen and opens without the browser's bar. A visited tab opens again offline, with a plain line saying so.

## Pages

- **[The app shell](app/shell.md)**: the frame every signed-in screen sits in, with the four tabs, the sheets and the toasts.
- **[Day](app/day.md)**: one day, its two readings against the person's targets, and its entries to mark, change and remove.
- **[Library](app/recipes.md)**: the second tab, with the recipes, the saved meals and your own foods, each a segment with its search, to make, add, edit, archive and delete, and the recipes' chips, filter sheet and orders.
- **[A recipe](app/recipe.md)**: one recipe, its figures at any number of servings, and putting servings on a day.
- **[The as made sheet](app/as-made-sheet.md)**: logging a recipe as it was made, one batch with its own ingredients and servings, on one day or several.
- **[The log sheet](app/log-sheet.md)**: logging a food, a saved meal, a recipe or an estimate to a day, logging a recent item again in one press, finding a food, a meal or a recipe, looking up a barcode typed or scanned with the camera, reading its figures, and keeping foods and saved meals of your own.
- **[Settings](app/settings.md)**: targets, the language of food names, the theme, sign-in methods, the account and the food data credit.
- **[First run](app/first-run.md)**: the page that offers a new account its targets, once, before the tabs, and opens again from a day for a user with none.
- **[Sign-in and account pages](app/auth.md)**: signing in, creating an account and resetting a password.
- **[Colours and type](app/colors.md)**: the design tokens every screen paints with.
