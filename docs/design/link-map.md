# Link map

Every concept's home: the heading in the doc that owns it. The first mention of a concept in a human-facing doc links here. An agent that adds a home heading adds its row to this table in the same change, and one that renames a heading repoints every link to it in that change.

Paths are relative to `docs/`. The **Heading** column is the exact heading text, so the anchor resolves. "Doc" means link the doc itself, with no anchor.

Group rows by area, one `##` heading per area, in the same order as the feature catalog.

## Authentication

| Concept                                            | Home                                                                    | Heading                                          |
| -------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------ |
| signing up, signing in, account                    | `features/authentication.md#signing-up-and-signing-in`                  | `### Signing up and signing in`                  |
| sign-in methods, linking Google, adding a password | `features/authentication.md#sign-in-methods`                            | `### Sign-in methods`                            |
| staying signed in, session                         | `features/authentication.md#staying-signed-in`                          | `### Staying signed in`                          |
| the browser session through the web server, relay  | `features/authentication.md#the-browser-session-through-the-web-server` | `### The browser session through the web server` |
| rate limits                                        | `features/authentication.md#rate-limits`                                | `### Rate limits`                                |
| forgotten password, reset link                     | `features/authentication.md#forgotten-password`                         | `### Forgotten password`                         |
| deleting an account, the cascade rule              | `features/authentication.md#deleting-the-account`                       | `### Deleting the account`                       |
| one-time codes                                     | `features/authentication.md#one-time-codes`                             | `### One-time codes`                             |
| access token, refresh token, rotation              | `features/authentication.md#tokens`                                     | `### Tokens`                                     |
| Google sign-in, Continue with Google               | `features/authentication.md#google-sign-in`                             | `### Google sign-in`                             |
| password hashing, the 72-byte rule                 | `features/authentication.md#passwords-and-reset-links`                  | `### Passwords and reset links`                  |
| error codes, the error body                        | `features/authentication.md#errors`                                     | `### Errors`                                     |

## Targets

| Concept                                      | Home                                           | Heading                        |
| -------------------------------------------- | ---------------------------------------------- | ------------------------------ |
| targets, calorie range, protein range, floor | `features/targets.md#setting-your-targets`     | `### Setting your targets`     |
| dated change, targets in force               | `features/targets.md#changing-your-targets`    | `### Changing your targets`    |
| which targets a day uses                     | `features/targets.md#which-targets-a-day-uses` | `### Which targets a day uses` |
| first run, no targets yet                    | `features/targets.md#the-first-run`            | `### The first run`            |
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
| food visibility, food scope               | `features/foods.md#visibility`           | `### Visibility`           |

## Example area

| Concept                      | Home                                             | Heading                         |
| ---------------------------- | ------------------------------------------------ | ------------------------------- |
| example concept, its synonym | `_templates/feature.md#mechanism-in-plain-words` | `### Mechanism, in plain words` |
