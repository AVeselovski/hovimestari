# Hovimestari requirements

**This file is the source of truth for what Hovimestari must do.** It belongs to Artur. Agents reference it often and never edit it without explicit permission from Artur. When the code or a request drifts from it, an agent reports the drift with proposed replacement wording, and Artur decides.

Every requirement has a stable ID so designs, tests and feature docs can cite it. The format is `FR-AREA-NN` for functional requirements and `NFR-AREA-NN` for non-functional ones, for example `FR-AUTH-01` or `NFR-PERF-02`. An ID is never reused once retired.

## 1. Scope

In scope: a hosted web app, installable on a phone, in which a signed-in user sets calorie and protein targets, logs what they eat, keeps recipes with computed nutrition figures, plans days against the targets, builds a grocery list from the plan, and may connect their own AI assistant.

Deliberately out of scope:

- **Nutrition advice.** The app never computes, suggests or judges targets, and never recommends what to eat for a weight, a goal or a condition.
- **Inference run by the app.** The app calls no language model. It holds no model provider keys and bills nobody for AI.
- **Chat in the app.**
- **Prices, budgets and cost estimates.**
- **Live grocery store data.** No product catalogue, no availability and no basket integration. The app links out to a store's own search.
- **Weight, body measurement and training tracking.**
- **Native app store apps.** The app is a web app that installs to the home screen.
- **Recipe discovery.** The app holds the user's own library. It has no public recipe catalogue and no social features.

## 2. Users and roles

- **User.** A person with an account. Everything they create belongs to them alone: targets, foods they added, saved meals, recipes, days, grocery lists and connections.
- **Connected assistant.** An AI assistant acting for one user through a key that user made. A key reads, or reads and writes. An assistant never has more access than its key, and never reaches another user's data.

There is no shared space between users and no administrator role in the app.

## 3. Functional requirements

### 3.1 Targets

- **FR-TGT-01**: The system shall let a user set a daily calorie range as a lower and an upper bound in kilocalories.
- **FR-TGT-02**: The system shall let a user set a daily protein range as a lower and an upper bound in grams, and shall treat the lower bound as a floor the day should reach.
- **FR-TGT-03**: The system shall ask a new user for both ranges before it shows any other part of the app.
- **FR-TGT-04**: The system shall offer no default, example or computed value for a target. The fields start empty.
- **FR-TGT-05**: The system shall refuse a range whose lower bound is above its upper bound, and a bound that is zero or negative.
- **FR-TGT-06**: The system shall let a user change the targets at any time, taking effect from a date the user picks, today by default.
- **FR-TGT-07**: The system shall measure each day against the targets in force on that day, so that changing the targets leaves earlier days as they were.

### 3.2 Foods

- **FR-FOOD-01**: The system shall hold a food catalogue in which every food has energy in kilocalories and protein, carbohydrates and fat in grams, per 100 g.
- **FR-FOOD-02**: The system shall include the Fineli foods in the catalogue for every user.
- **FR-FOOD-03**: The system shall let a user search the catalogue by name in Finnish and in English, and shall match partial words.
- **FR-FOOD-04**: The system shall let a user add a food of their own with a name and the four values per 100 g, and optionally a barcode.
- **FR-FOOD-05**: The system shall let a user edit and delete a food they added. Foods from Fineli and from Open Food Facts are read-only.
- **FR-FOOD-06**: The system shall hold named portions for a food where they are known, such as one egg or one tub, each with its weight in grams, and shall let a user add portions to any food.
- **FR-FOOD-07**: The system shall show where a food's figures come from: Fineli, Open Food Facts or the user.
- **FR-FOOD-08**: The system shall let a user mark a food as a favourite.

### 3.3 Days and entries

- **FR-DAY-01**: The system shall keep one day per calendar date per user, holding a list of entries.
- **FR-DAY-02**: The system shall support three kinds of entry: a food with a weight in grams, a recipe with a number of servings, and a saved meal with a count.
- **FR-DAY-03**: The system shall show for each day the total energy, protein, carbohydrates and fat of its entries.
- **FR-DAY-04**: The system shall show for each day where the totals stand against the calorie range and the protein range, as figures and as a visual gauge.
- **FR-DAY-05**: The system shall let a user add, edit, move to another day, copy to another day and remove an entry.
- **FR-DAY-06**: The system shall accept entries on any date, past or future, so that a future day works as a plan.
- **FR-DAY-07**: The system shall keep the totals of a past day unchanged when a food, recipe or saved meal used on it is later edited or deleted.
- **FR-DAY-08**: The system shall show a week at a glance, with each day's totals against the targets.
- **FR-DAY-09**: The system shall compute every figure it shows from stored food values. No figure on a day is typed in as a total, except through a saved meal.

### 3.4 Quick logging

- **FR-LOG-01**: The system shall let a user add a food to today from the main screen by searching, picking a food and giving an amount.
- **FR-LOG-02**: The system shall accept the amount in grams or as a number of named portions, and shall show the resulting figures before the user confirms.
- **FR-LOG-03**: The system shall offer the user's recent foods, favourite foods and saved meals before they type anything.
- **FR-LOG-04**: The system shall remember the last amount a user logged for a food and offer it the next time.
- **FR-LOG-05**: The system shall let a user log a recent or favourite item again with its last amount in one action.

### 3.5 Barcode scanning

- **FR-SCAN-01**: The system shall let a user scan a product barcode with the phone camera from the logging flow.
- **FR-SCAN-02**: The system shall look the barcode up among the user's own foods first, then in Open Food Facts.
- **FR-SCAN-03**: The system shall show the product found with its figures per 100 g and let the user adjust the amount before logging it.
- **FR-SCAN-04**: The system shall keep a product found in Open Food Facts as a food, so that the next scan and the next search find it without a new lookup.
- **FR-SCAN-05**: The system shall, when no product is found or its figures are incomplete, let the user enter the values from the label and save the product as a food of their own with that barcode.
- **FR-SCAN-06**: The system shall let a user type a barcode by hand where a camera is unavailable or refused.

### 3.6 Saved meals

- **FR-MEAL-01**: The system shall let a user save a meal with a name and its total energy, protein, carbohydrates and fat, as read from a label or a menu.
- **FR-MEAL-02**: The system shall let a user log a saved meal to any day and reuse it without retyping.
- **FR-MEAL-03**: The system shall let a user edit, archive and delete a saved meal.
- **FR-MEAL-04**: The system shall let a user tag a saved meal with where it comes from, such as a delivery service, and filter by that tag.

### 3.7 Recipes

- **FR-REC-01**: The system shall let a user create a recipe with a name, a number of servings, a cooking time, ingredients, instructions, notes and an optional cover image.
- **FR-REC-02**: The system shall require each ingredient to either point at a food with a weight in grams, or be marked as not counted, as for water and seasoning.
- **FR-REC-03**: The system shall let an ingredient carry a cooking amount and unit for display, such as two cloves, alongside its weight in grams.
- **FR-REC-04**: The system shall compute a recipe's energy, protein, carbohydrates and fat per serving from its counted ingredients, and shall not accept typed-in totals for a recipe.
- **FR-REC-05**: The system shall show a recipe's figures per serving and for the whole recipe.
- **FR-REC-06**: The system shall let a user view a recipe scaled to another number of servings, with amounts and figures following.
- **FR-REC-07**: The system shall let a user edit, duplicate, archive and delete a recipe.
- **FR-REC-08**: The system shall let a user search and filter their recipes by name, by tag and by figures per serving, such as protein at or above a value.
- **FR-REC-09**: The system shall let a user tag recipes with their own tags and mark recipes as favourites.
- **FR-REC-10**: The system shall record when a recipe was last put on a day, and let the user sort by it.

### 3.8 The gap and suggestions

- **FR-GAP-01**: The system shall show for a day the gap: the protein still needed to reach the floor, and the calories left before the lower and the upper bound of the range.
- **FR-GAP-02**: The system shall, on request, list recipes, saved meals and favourite foods from the user's own library ranked by how well adding them closes the day's gap.
- **FR-GAP-03**: The system shall never suggest something that takes the day above the upper calorie bound, unless the user asks to see those too.
- **FR-GAP-04**: The system shall show for each suggestion the amount it proposes and what the day's totals would become.
- **FR-GAP-05**: The system shall let a user add a suggestion to the day in one action, and change its amount first.
- **FR-GAP-06**: The system shall rank by a fixed rule that the app documents, with no model and no randomness the user cannot explain.
- **FR-GAP-07**: The system shall let a user ask for suggestions for an empty day, so that planning from zero and planning around fixed meals are the same action.

### 3.9 Grocery list

- **FR-GROC-01**: The system shall build a grocery list from the recipes planned in a date range the user picks.
- **FR-GROC-02**: The system shall show, for each planned recipe, the servings the list buys for, starting from the planned servings, and let the user change that number.
- **FR-GROC-03**: The system shall merge ingredients that point at the same food into one line, adding amounts in the same unit and listing amounts in different units side by side.
- **FR-GROC-04**: The system shall leave not-counted ingredients on the list by name, so that seasoning is still bought.
- **FR-GROC-05**: The system shall group the list by aisle, in the walking order of a store, and sort by name within an aisle.
- **FR-GROC-06**: The system shall let a user add items by hand, and remove or change any line.
- **FR-GROC-07**: The system shall let a user tick lines off, and keep the ticks across devices until the list is cleared.
- **FR-GROC-08**: The system shall give each line a link that opens the user's chosen store's search for that item, and shall support S-kaupat first.
- **FR-GROC-09**: The system shall let a user copy the list as plain text.

### 3.10 Connected AI

- **FR-AI-01**: The system shall let a user create a named connection key for an AI assistant in settings.
- **FR-AI-02**: The system shall let the user choose the key's access, read only or read and write, and its lifetime, with a shorter maximum lifetime for a key that can write.
- **FR-AI-03**: The system shall show a key once, at creation, and store only a hash of it.
- **FR-AI-04**: The system shall list a user's connections with their name, access, expiry and last use, and let the user revoke one at once.
- **FR-AI-05**: The system shall limit how many live keys a user can hold.
- **FR-AI-06**: The system shall expose to a connected assistant, over the Model Context Protocol, the user's targets, days with totals and gaps, the food catalogue search, saved meals, recipes and grocery list.
- **FR-AI-07**: The system shall let an assistant with a writing key add foods of the user's own, create and edit saved meals and recipes, add, change, move and remove entries on days, and change the user's targets.
- **FR-AI-08**: The system shall hold an assistant to the same rules as the app's own screens. A recipe from an assistant needs every ingredient pointed at a food or marked as not counted, and the app computes its figures.
- **FR-AI-09**: The system shall keep the account and the connections out of an assistant's reach.
- **FR-AI-10**: The system shall record every change an assistant makes, with the connection's name and the time, and show the record to the user.
- **FR-AI-11**: The system shall make a repeated write with the same request key apply once, so that an assistant's retry does not duplicate an entry.
- **FR-AI-12**: The system shall limit how fast a key can write.
- **FR-AI-13**: The system shall give the assistant the rules for reading the app's figures, including that nothing the app returns is nutrition advice and that the assistant should quote figures, not recompute them.
- **FR-AI-14**: The system shall show the user ready-made setup steps for connecting common assistants with their new key.
- **FR-AI-15**: The system shall revoke every connection a user made when that user changes or resets their password.
- **FR-AI-16**: The system shall let the operator switch connected AI off, and switch its writing off, for the whole deployment.
- **FR-AI-17**: The system shall let an assistant with a writing key ask to delete a recipe, a saved meal or one of the user's own foods, and shall delete nothing on an assistant's request until the user has approved that deletion.

### 3.11 Authentication and account

- **FR-AUTH-01**: The system shall let a person sign up and sign in with an email address and a password.
- **FR-AUTH-02**: The system shall let a person sign up and sign in with a Google account, on a deployment that has Google configured.
- **FR-AUTH-03**: The system shall keep a user signed in across visits and let them sign out, on one device or on all.
- **FR-AUTH-04**: The system shall let a user reset a forgotten password through a link sent by email, without revealing whether an address has an account.
- **FR-AUTH-05**: The system shall let a signed-in user link and unlink Google and add or remove a password, and shall never remove their last way in.
- **FR-AUTH-06**: The system shall rate limit sign-in, sign-up and password reset.
- **FR-AUTH-07**: The system shall let a user delete their account and everything in it.

### 3.12 Settings

- **FR-SET-01**: The system shall let a user choose the language food names are shown in, Finnish or English.
- **FR-SET-02**: The system shall let a user choose the grocery store their list links to.
- **FR-SET-03**: The system shall let a user choose between a light and a dark theme, or follow the device.

## 4. Non-functional requirements

- **NFR-UX-01**: Visual and interaction quality is part of correctness. A feature that works but looks or feels rough is not done.
- **NFR-UX-02**: The phone is the primary surface. Every screen is designed for a phone held in one hand first and widened for larger screens second.
- **NFR-UX-03**: Logging a recent or favourite food takes at most three taps from opening the app.
- **NFR-UX-04**: Light and dark themes are both first-class.
- **NFR-UX-05**: The interactive pieces that are hard to get right on a phone come from an established, accessible component library and are not built by hand: sheets that slide up from the bottom with a drag handle, dialogs, menus, pickers, comboboxes and toasts. Building one by hand needs a stated reason.
- **NFR-UX-06**: The app feels native on a phone. Sheets follow the finger, nothing jumps when the keyboard opens, and no tap lands on the wrong thing.
- **NFR-ADV-01**: No screen, message, suggestion or tool response states or implies what a user's targets or intake should be. The app reports figures against the user's own targets and attaches no judgement.
- **NFR-ADV-02**: The app shows that it is not a source of nutrition or medical advice, where targets are set and in the rules given to an assistant.
- **NFR-ADV-03**: A target an assistant sets is the user's own assistant acting for the user. The app applies it under the same rules as a target typed on screen, records it under the connection's name and adds no view of its own.
- **NFR-AI-01**: The app runs no model inference and stores no model provider credentials.
- **NFR-AI-02**: Every figure an assistant reads comes from the same service the app's own screen reads, so the two can never disagree.
- **NFR-AI-03**: Every feature a user can reach on screen ships with its assistant tools in the same change, unless the requirement keeps it out of an assistant's reach.
- **NFR-SEC-01**: A user can read and change only their own data. Every query is scoped to the signed-in user or to the key's user.
- **NFR-SEC-02**: Passwords are stored hashed with a slow hash. Refresh tokens and connection keys are stored only as hashes.
- **NFR-SEC-03**: The refresh token is never readable by JavaScript in the browser.
- **NFR-SEC-04**: No log line holds a key, a password, a token or the arguments of an assistant's call.
- **NFR-PRIV-01**: What a user eats is personal data. It is used for nothing but showing it back to that user and to the assistants they connected.
- **NFR-PRIV-02**: Deleting an account removes its data from the live database at once.
- **NFR-PWA-01**: The app installs to the home screen on iOS and Android and opens without browser chrome.
- **NFR-PWA-02**: The app shell loads without a network connection and says plainly when it is offline.
- **NFR-PERF-01**: Food search answers fast enough to feel instant while typing on a phone connection.
- **NFR-DATA-01**: The app credits Fineli and Open Food Facts as their licences require, and never implies that either endorses it.
- **NFR-COPY-01**: Interface copy is in English. Food names follow the user's food-name language.

## 5. Data and integrations

- **Fineli.** The open data release is loaded into the food catalogue by a repeatable import. A new release is loaded the same way and keeps food identities stable, so entries and recipes keep pointing at the same food.
- **Open Food Facts.** Looked up by barcode from the backend, one product at a time, at the moment a user scans. Products found are kept in the catalogue.
- **Grocery stores.** Search links only. The app builds a link to the store's own search page and calls no store system.
- **Email.** Password reset mail goes through a transactional email service.
- **Google.** Sign-in only.
- **Images.** Recipe cover images are stored by the app and served only to their owner.
- **Retention.** Days, recipes and foods are kept until the user deletes them or their account.

## MVP scope and later

The feature catalog lists what is built today. This section says what is planned. The build order within the MVP is in `docs/design/pivot-plan.md`.

| Area             | MVP                                                             | Later                                                                                                             |
| ---------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Targets          | Calorie and protein ranges, dated changes                       | Optional carbohydrate and fat ranges, with the user choosing which targets to track. Different targets by weekday |
| Foods            | Fineli catalogue, own foods, portions, favourites               | More open food databases                                                                                          |
| Days and logging | Entries of three kinds, totals, gauge, week view, quick logging | Meal slots within a day                                                                                           |
| Barcode scanning | Camera scan, Open Food Facts lookup, label entry                | Scanning several products in a row                                                                                |
| Saved meals      | Create, log, tag by source                                      | Import of a delivery service's menu                                                                               |
| Recipes          | Editor, computed figures, scaling, tags, cover image            | Sharing a recipe by link                                                                                          |
| The gap          | Gap figures, ranked suggestions from the user's library         | Suggestions that combine several items, preferences such as dislikes and appliances                               |
| Grocery list     | From planned recipes, aisles, ticks, S-kaupat links             | K-Ruoka and Lidl links, recurring staples                                                                         |
| Connected AI     | Keys, read and write tools for every MVP feature, change record | Assistant access to preferences                                                                                   |
| Account          | Password and Google sign-in, reset, delete account              | A shared household, data export                                                                                   |
| App              | Installable PWA with an offline shell                           | Offline reading of today and the grocery list, a store app wrapper                                                |
