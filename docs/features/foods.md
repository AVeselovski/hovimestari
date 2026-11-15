# Foods

The food catalogue: the foods a user picks from, each with energy, protein, carbohydrates and fat per 100 g. It holds shared foods, such as Fineli's, and each user's own foods, with portions, favourites and one search that finds a food by any part of its Finnish or English name.

## In detail

### The food catalogue

Every food has energy in kcal and protein, carbohydrates and fat in grams, per 100 g. Every food also says where its figures come from: Fineli, Open Food Facts or the user. A food from Fineli or Open Food Facts is shared by every user and is read-only. One user never sees another user's foods, portions or favourites.

A shared food can be marked retired. Search does not find a retired food, but it stays readable, keeps its figures and stays a favourite of whoever marked it.

### Searching for a food

Search finds a food when every word typed occurs somewhere in its Finnish or its English name, whatever the user's food-name language. A word may be part of a longer word, so "rahk" finds "maitorahka". Letter case and accents do not matter, so "jaatelo" finds "Jäätelö". Punctuation separates words and is otherwise ignored. One-character words are left out, so a search with no word of two characters or more, such as one made only of punctuation, answers nothing. Only the first eight words count. Search answers 30 foods by default and 50 at most. Retired foods and other users' own foods never appear.

Results are ranked by a fixed rule, and the first difference decides:

1. How well the first word typed matches, by the better of the two names. Each name has a first word: the first word before any comma and space, with hyphens kept. Best is a name whose first word is exactly the word typed, as "Rahka, maustettu" is for "rahka". Next is a first word that ends with it, which in Finnish is a compound: "Kananmuna" is an egg, so it comes high for "muna". Next a first word that starts with it ("Munakoiso"), then any word in the name that is it or ends with it, then any word that starts with it, then a match inside a word.
2. The user's favourites, then the user's own foods, then the rest.
3. Fineli's basic foods before its dishes, then anything else.
4. Fewer parts in the name, where a comma and a space separate the parts.
5. A shorter name, then the name in alphabetical order.

Steps 4 and 5 read the name in the user's food-name language.

The rule puts the right kind of food first, not the plain variant of it. On real Fineli names, a search for "rahka" lists quarks before quark pies, but a flavoured quark with a shorter name can come before the plain one, because nothing in a name says which quark is "the" quark. A short word can also end a longer one: "kana" (chicken) puts "Porkkana" (carrot) fourth. Favourites are the quick path for a food a user eats often.

### Your own foods

A user can add a food of their own with a name, the four values per 100 g copied from a label, and optionally a barcode of 8 to 14 digits. Energy runs from 0 to 1000 kcal with at most two decimals, and each macro from 0 to 100 g with at most three, which is what the catalogue stores. A name is at most 120 characters. Two of a user's own foods cannot share a barcode, but two users can each have one with the same barcode. Only its owner sees, edits or deletes an own food. Deleting it deletes its portions and favourites with it. An own food has one name, shown in either food-name language. A user's own foods are listed by name, 100 by default and 200 at most.

### Portions

A portion is a way to enter grams, such as one egg or one tub, with its weight in grams. A user can add portions of their own to any food they can see, with a name of at most 60 characters and a weight above zero, up to 5000 g, with at most one decimal. A user's own portion is theirs alone, even on a shared food. Portions that come with a shared food are read-only.

### Favourites

A user can mark any food they can see as a favourite, and unmark it. Favourites are listed newest first, 100 by default and 200 at most, and rank first within their match in search.

### Food-name language

Each user reads food names in Finnish or in English. Finnish is the default. A food without an English name shows its Finnish name in either setting. Search matches both names whatever the setting.

### Fineli

Fineli is the Finnish food composition database of the Finnish Institute for Health and Welfare (THL), used under the [Creative Commons Attribution 4.0](https://creativecommons.org/licenses/by/4.0/) licence. Hovimestari is not produced or endorsed by THL.

## How it works

### Visibility

`visibleTo(userId)` in `apps/backend/src/services/foodScope.ts` is the only place the rule is written: a food is visible when it is shared or the user's own. `portionVisibleTo(userId)` does the same for portions: one that came with the food's source, or the user's own. Every food read and write goes through them. Another user's own food answers 404 `food_not_found` on every route, never 403, and another user's portion answers 404 `portion_not_found`, so a response never tells that it exists. A read-only check comes after: a visible shared food answers 403 `food_read_only` to an edit or a delete, and a portion that came with a shared food answers 403 `portion_read_only`. Every update and delete also names the owner in its own `WHERE`, so a write never trusts the earlier read.

### The search rule in code

Migration `0001_search_functions.sql` installs `pg_trgm` and `unaccent` and three SQL functions. `food_search_norm` lowers a name, folds its accents and turns every run of other characters into one space. `food_search_head` gives the head of a name: the first word of its first part, with hyphens kept. Parts are split on a comma and a space, so the decimal comma in "rasvaa <0,5 %" never starts a part. The migration refuses a database that is not UTF-8, because on any other encoding `char_length` counts bytes and the character classes drop accented letters. The generated columns `search_name`, `search_name_en`, `search_all`, `search_head` and `search_head_en` call them, so the index, the filter and the ranking normalise names one way.

`searchWords` in `apps/backend/src/services/foodSearch.ts` normalises the query with `food_search_norm` in the database, then splits it into words in TypeScript, drops words under two characters (`MIN_WORD_LENGTH`) and duplicates, and keeps the first eight (`MAX_WORDS`). A normalised word holds only letters and digits, so no `LIKE` wildcard reaches a pattern. With no word left, `searchFoods` in `apps/backend/src/services/reads/foods.ts` answers an empty list without a query. Otherwise `searchQuery` binds each pattern as one parameter and runs one ranked query. A food matches when `search_all` holds every word. The tier of step 1 is computed on `search_head` and `search_name`, and on their English twins, and the lower of the two wins. Steps 4 and 5 split the display name on `, ` and count its characters, and the id breaks the last tie. A word of three characters or more is served by the trigram index `foods_search_all_trgm`. The display name and its language come from the same query, so the screen and an assistant get the same names.

A bulk load fills the trigram index's pending list, and until a `VACUUM` the planner prices the index above a full scan. The tests run `VACUUM ANALYZE` before they check the plan.

`apps/backend/src/services/__tests__/foodSearch.db.test.ts` pins the rule on 249 real Fineli names in `fixtures/fineli-names-r18.csv`, credited in the README next to it.

### Services

The routes call these, and the assistant's tools will call the same ones. `reads/foods.ts`: `searchFoods`, `getFood`, `listFavouriteFoods`, `listOwnFoods`. `writes/foods.ts`: `createOwnFood`, `updateOwnFood`, `deleteOwnFood`, `addPortion`, `updatePortion`, `removePortion`, `setFavourite`. `writes/settings.ts`: `updateSettings`, for the food-name language and the time zone. A write answers `{ value, outcome }`, and the route sends `value`.

### API

All under `/api/v1`, all Bearer. A refused request answers `{ message, code }`.

| Method | Path                             | Answers                                                                                                         |
| ------ | -------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| GET    | `/foods/search?q=&limit=`        | 200 `{ foods }`. `q` 1 to 100 characters after trimming, `limit` 1 to 50, 30 by default. Else `invalid_request` |
| GET    | `/foods/favourites?limit=`       | 200 `{ foods }`, newest favourite first. `limit` 1 to 200, 100 by default                                       |
| GET    | `/foods/own?limit=`              | 200 `{ foods }`, by name. `limit` 1 to 200, 100 by default                                                      |
| GET    | `/foods/:id`                     | 200 with the food, its barcode, its Fineli id, type and process, and its portions. 404 `food_not_found`         |
| POST   | `/foods`                         | 201 with the new food. 409 `barcode_taken`                                                                      |
| PUT    | `/foods/:id`                     | 200 with the food. 403 `food_read_only`. 404. 409 `barcode_taken`                                               |
| DELETE | `/foods/:id`                     | 204. 403 `food_read_only`. 404                                                                                  |
| POST   | `/foods/:id/portions`            | 201 with the portion. 404 `food_not_found`                                                                      |
| PUT    | `/foods/:id/portions/:portionId` | 200 with the portion. 403 `portion_read_only`. 404 `portion_not_found`                                          |
| DELETE | `/foods/:id/portions/:portionId` | 204. 403 `portion_read_only`. 404 `portion_not_found`                                                           |
| PUT    | `/foods/:id/favourite`           | 204, also when it already is one. 404 `food_not_found`                                                          |
| DELETE | `/foods/:id/favourite`           | 204, also when it is not one. 404 `food_not_found`                                                              |
| PATCH  | `/users/me/settings`             | 200 with the user. Takes `foodNameLanguage`, `timeZone` or both. 400 `invalid_time_zone` or `invalid_request`   |

A food in a list has `id`, `source`, `name` in the user's language, `otherName` (the other language's name when it differs), `per100g`, `isFavourite`, `isOwn` and `retired`. A refused own food answers `food_name_required`, `food_name_too_long`, `food_value_required`, `food_energy_invalid`, `food_macro_invalid` or `barcode_invalid`. A refused portion answers `portion_name_required`, `portion_name_too_long` or `portion_grams_invalid`. The detail's `portions` list the shared food's portions first, in the fixed order of `FINELI_PORTION_UNITS`, then the user's own by name. Each portion has `unit` for a shared one or `name` for an own one, `grams` and `isOwn`. The shapes are in `packages/types/src/foods.ts`.

### Data

- `foods`: `source` (`fineli`, `open_food_facts` or `user`), `user_id` set only on an own food, `fineli_id` set only on a Fineli food, `name` (Finnish for Fineli), `name_en`, the four values per 100 g, `barcode`, `fineli_type` and `fineli_process`, `retired_at`, and the generated search columns. CHECKs tie the owner and the Fineli id to the source, keep the values in range and the barcode to 8 to 14 digits. `foods_user_barcode_uq` keeps one barcode per user.
- `food_portions`: `food_id`, `user_id` set only on a user's own portion, `fineli_unit` or `name` (exactly one), `grams` above zero and up to 5000. A Fineli portion has no owner, and the CHECK `food_portions_fineli_unit_known` keeps `fineli_unit` to the units the API names. `food_portions_fineli_unit_uq` keeps one of each Fineli unit per food.
- `food_favourites`: `user_id` and `food_id`, one row per favourite.
- `users.food_name_language`: `fi` or `en`, `fi` by default.

Every table with `user_id` cascades from `users`, so deleting an account removes its own foods, portions and favourites and leaves every shared food and shared portion.

### Known gaps

- The catalogue holds no Fineli or Open Food Facts food yet, and no Fineli portion. The Fineli import arrives separately.
- Nothing sets `retired_at` yet. Search and the reads handle it as described.

Requirements: FR-FOOD-01, FR-FOOD-03 to FR-FOOD-08, FR-SET-01, NFR-SEC-01, NFR-PERF-01 (requirements 3.2, 3.12 and 4)

## Where it appears

- The web app has no food screens yet. The API is reached directly.
