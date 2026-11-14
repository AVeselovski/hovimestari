# Hovimestari overview

This file frames what is being built. It belongs to Artur. Agents read it and never edit it without explicit permission. When it drifts from what is built, an agent reports what is wrong and proposes the wording, and Artur decides.

## The product

Hovimestari is a food planner and food log for people who already know their numbers. The user sets a daily calorie range and a daily protein range. The app then answers one question, every day: what is left, and what closes it.

A day fills up from three kinds of entry. A meal with known figures, such as a delivered meal with its label. A recipe from the user's own library, by servings. A single food by weight, such as two boiled eggs or a tub of rahka. The app adds them up, shows the gap to the targets and ranks what in the user's library would close it. The same screen works as a plain calorie counter on a day when all the user wants is to log a snack fast.

Every figure comes from a food database, never from a guess. Each ingredient and each logged food points at a food with known values per 100 g. The app does the arithmetic. Nothing on screen is an estimate from a language model.

The app works completely without AI. A user who wants more connects the assistant they already pay for, such as Claude, through a key made in settings. The assistant then reads the same figures the app shows and can add recipes, log meals and rearrange days on the user's behalf. The app runs no inference of its own and has no chat.

What makes it worth using over what people do today: calorie counters do not plan, and meal planners do not respect targets. Meal planners also decide for the user. Hovimestari plans against targets the user typed and nothing else.

## Who uses it

**A person on a deliberate nutrition plan.** They know their calorie and protein targets from their own coach, their own reading or their own assistant. They want the app to hold the numbers and do the sums. They open it several times a day on a phone: to log, to check the gap, to pick dinner. They open it on a larger screen now and then to tidy recipes.

**The same person, with part of the week already decided.** Some days are mostly covered by meals they did not cook, such as a meal delivery service or a canteen. They enter those meals and plan only the rest. On other days they plan everything from zero. The app treats both the same way.

**Their assistant.** A connected AI assistant acts for the user with the access the user gave it. It reads days, foods and recipes, and with a writing key it enters data in bulk. It is a user of the app, not a part of it.

## User stories

### Targets

- As a user, I want to set my daily calorie range and protein range before anything else so that every figure the app shows is measured against my own numbers.
- As a user, I want the app to never suggest targets for me so that I stay responsible for my own plan.

### Logging

- As a user, I want to log a single food in a few taps so that a snack takes seconds to record.
- As a user, I want to scan a barcode and adjust the amount so that I log the exact product I ate, because one rahka is not another.
- As a user, I want my recent and favourite foods at the top so that the things I eat every week are one tap away.
- As a user, I want to enter a meal by its label figures and reuse it later so that delivered meals take no effort after the first time.
- As a user, I want to add a food that the database lacks from its nutrition label so that nothing I eat is left out.

### The day and the gap

- As a user, I want to see what a day adds up to against my targets so that I know where I stand at a glance.
- As a user, I want to see what is left to reach my protein floor and stay inside my calorie range so that I know what the rest of the day has to deliver.
- As a user, I want the app to rank recipes and foods from my own library by how well they close the gap so that choosing dinner is quick.
- As a user, I want to plan days ahead so that I can shop once for the days I cook.

### Recipes

- As a user, I want each recipe to show calories, protein, carbohydrates and fat per serving so that I can judge it against my targets.
- As a user, I want those figures computed from the ingredients so that I can trust them.
- As a user, I want to scale a recipe by servings so that the figures and the amounts follow.

### Groceries

- As a user, I want a grocery list built from the recipes I planned so that I buy what the plan needs.
- As a user, I want the list grouped by aisle with a link that searches my grocery store for each item so that ordering is quick.
- As a user, I want to tick items off in the shop so that the list works on foot too.

### Connected AI

- As a user, I want to connect my own AI assistant with a key so that it can read my days, foods and recipes.
- As a user, I want to choose whether a key can only read or can also write so that I control what the assistant may change.
- As a user, I want every change an assistant makes recorded under its connection name so that I can see what it did.
- As a user, I want to hand a recipe photo or a week of delivered meals to my assistant and have it enter them so that bulk input is never my job.

### Account

- As a user, I want to sign in with a password or with Google so that my data follows me across devices.
- As a user, I want to install the app on my phone's home screen so that it opens like any other app.

## Principles

- **The user knows what they need.** The app is for people who bring their own targets. It asks for them first and offers no defaults.
- **The app is not a nutritionist.** It never computes, suggests or judges targets. It never says what someone should eat for their weight or their goals. It measures against the user's own numbers.
- **The app does the arithmetic and the assistant explains it.** Every figure is computed by the app from a food database. An assistant passes on the user's own values and the app works out the rest.
- **It works without AI.** No feature needs inference. AI is something the user brings, through a key, to an app that is complete without it.
- **No chat in the app.** The conversation happens in the user's own assistant.
- **Logging is fast or it is not used.** The quickest path on the phone is the one that matters most.
- **The interface is only as good as its UI and UX.** Visual and interaction quality is part of correctness.
- **No prices and no budgets.** The app does not know what food costs and does not pretend to.

## Reference data

- **Macros.** The app tracks energy in kilocalories and protein, carbohydrates and fat in grams. Targets exist for energy and protein only.
- **Targets.** A calorie range has a lower and an upper bound. A protein range has a lower and an upper bound, and its lower bound is a floor the day should reach.
- **The gap.** What a day still needs: the distance from the day's total to the protein floor, and the room left inside the calorie range.
- **Food.** One item with nutrition values per 100 g. A food comes from Fineli, from Open Food Facts or from the user.
- **Fineli.** The Finnish national food composition database, published by THL as open data. It covers generic foods, with names in Finnish, Swedish and English. Its licence asks for attribution and forbids implying that THL endorses the service.
- **Open Food Facts.** An open database of packaged products keyed by barcode. It is the source for branded products.
- **Saved meal.** A named meal with its own total figures, entered by the user from a label or a menu. A delivered meal is a saved meal.
- **Connected AI.** An AI assistant the user connects with a key, over the Model Context Protocol.
- **Units.** Metric only. Weights in grams, volumes in millilitres and decilitres.
- **Grocery stores.** The first supported store for search links is S-kaupat. K-Ruoka and Lidl follow.
