# Foods

The food catalogue: the foods a user picks from, each with energy, protein, carbohydrates and fat per 100 g. It holds shared foods, such as Fineli's, and each user's own foods, with portions, favourites and one search that finds a food by any part of its Finnish or English name. Fineli's foods and household measures arrive through a repeatable import that retires, never deletes, a food that leaves a release. A barcode lookup finds a product among the user's own foods, then at Open Food Facts, and keeps a product it finds once for every later lookup.

In [the log sheet](../app/log-sheet.md), opened from the Day tab, a person searches the catalogue, logs a food by weight or portion, reads its figures per 100 g, marks favourites, and adds, edits and deletes foods and portions of their own.

## In detail

### The food catalogue

Every food has energy in kcal and protein, carbohydrates and fat in grams, per 100 g. Every food also says where its figures come from: Fineli, Open Food Facts or the user. A food from Fineli or Open Food Facts is shared and read-only. Every user sees every Fineli food. A user sees an Open Food Facts food once they have looked up its barcode. One user never sees another user's foods, portions or favourites.

A shared food can be marked retired. Search does not find a retired food, but it stays readable, keeps its figures and stays a favourite of whoever marked it.

### Searching for a food

Search finds a food when every word typed occurs somewhere in its Finnish or its English name, whatever the user's food-name language. A word may be part of a longer word, so "rahk" finds "maitorahka". Letter case and accents do not matter, so "jaatelo" finds "Jäätelö". Punctuation separates words and is otherwise ignored. One-character words are left out, so a search with no word of two characters or more, such as one made only of punctuation, answers nothing. Only the first eight words count. Search answers 30 foods by default and 50 at most. Retired foods and other users' own foods never appear.

Results are ranked by a fixed rule, and the first difference decides:

1. How well the first word typed matches, by the better of the two names. Each name has a first word: the first word before any comma and space, with hyphens kept. Best is a name whose first word is exactly the word typed, as "Rahka, maustettu" is for "rahka". Next is a first word that ends with it, which in Finnish is a compound: "Kananmuna" is an egg, so it comes high for "muna". Next a first word that starts with it ("Munakoiso"), then any word in the name that is it or ends with it, then any word that starts with it, then a match inside a word.
2. The user's favourites, then the user's own foods, then the rest.
3. Fineli's basic foods before its dishes, then anything else.
4. Fewer parts in the name, where a comma and a space separate the parts.
5. A shorter name, then the name in Finnish alphabetical order, where å, ä and ö come after z.

Steps 4 and 5 read the name in the user's food-name language.

The rule puts the right kind of food first, not the plain variant of it. On real Fineli names, a search for "rahka" lists quarks before quark pies, but a flavoured quark with a shorter name can come before the plain one, because nothing in a name says which quark is "the" quark. A short word can also end a longer one: "kana" (chicken) puts "Porkkana" (carrot) fourth. Favourites are the quick path for a food a user eats often.

### Your own foods

A user can add a food of their own with a name, the four values per 100 g copied from a label, and optionally a barcode of 8 to 14 digits. A typed value that may hold a thousands group, such as "1,500", is refused rather than read as 1.5. That has a cost: a value from 1 to 999 cannot be typed with a third decimal, though "0,125" can. Every number field in the app follows [the same rule](../../apps/web/README.md#numbers-and-dates). A saved value left untouched in an edit is sent as saved, so a third decimal already stored stays. Energy runs from 0 to 1000 kcal with at most two decimals, and each macro from 0 to 100 g with at most three, which is what the catalogue stores. Protein, carbohydrates and fat together come to at most 101.5 g per 100 g. That is 100 g with room for label rounding, because each of the three values on a label can be off by up to half a gram. The sum is taken in thousandths of a gram, as stored. A food over it is refused when it is added and when an edit is saved, also when the edit leaves the values as they were. An own food already stored over it still reads, lists, logs and counts in every total. The rule holds for own foods only, never for shared foods, saved meals or estimates. A name is at most 120 characters and holds at least two letters or digits in a row, because search leaves out shorter words and could never find the food. A new name is checked for search when a food is added and when an edit changes it. A name left as saved is not checked, so the values of a food whose saved name search cannot find can still be edited, on screen and through the API. Two of a user's own foods cannot share a barcode, but two users can each have one with the same barcode. Only its owner sees, edits or deletes an own food. Deleting it deletes its portions and favourites with it. Editing or deleting an own food that days use follows [the rules for figures that stay](days.md#figures-that-stay), and a deleted one frees its barcode. An own food has one name, shown in either food-name language. A user's own foods are listed in Finnish alphabetical order, 100 by default and 200 at most.

### Portions

A portion is a way to enter grams, such as one egg or one tub, with its weight in grams. A Fineli food comes with Fineli's household measures as portions: small, medium and large pieces, one piece as sold, small, medium and large portions, a decilitre, a tablespoon and a teaspoon. A user can add portions of their own to any food they can see, with a name of at most 60 characters and a weight above zero, up to 5000 g, with at most one decimal. A user's own portion is theirs alone, even on a shared food. Portions that come with a shared food are read-only.

### Favourites

A user can mark any food they can see as a favourite, and unmark it. Favourites are listed newest first, 100 by default and 200 at most, and rank first within their match in search. Each favourite, like a food's detail, carries [the amount the user last ate](quick-logging.md#recent-items-and-the-last-amount) of it, or none.

### Looking up a barcode

A user looks up a product by its barcode of 8 to 14 digits. Spaces in it are dropped. The lookup tries, in order:

1. The user's own foods. An own food wins whatever else has the barcode. It matches under any form of the code: 12 or 13 digits for one product, or the 8-digit short form of a 12-digit one. It also matches a code no product could have, because it is the user's own word.
2. The products already kept from Open Food Facts. Any user's earlier lookup kept them, so this needs no call to Open Food Facts.
3. Answers held in memory for 10 minutes: a product Open Food Facts did not have, or had without four usable values.
4. Open Food Facts itself.

A code whose last digit does not check out is not found, and nothing is sent. A 14-digit code for a case or a pack of a product is not found either, and nothing is sent. A shop's own number, such as the barcode a shop prints for a weighed or priced item, is answered as the shop's own and never sent. So is a 14-digit code for an item sold by weight. An 8-digit code can stand for two different products: as a short 12-digit code or as an 8-digit one. A scan says which, and a typed code is tried as the short 12-digit code first.

A product Open Food Facts has with a name and all four values is kept once, as a read-only food with its barcode. The barcode is kept as 8 digits for an 8-digit product and as 13 digits for any other, and a lookup finds it under any form of the code. Its name is the Finnish name, else the product's own, else the English one, with the first brand after a comma unless the name already holds it, cut at a word to 120 characters. Control characters are dropped from the name and the brand, and a name left empty counts as missing. Energy comes from kilojoules when no kilocalories are given. A product with a value missing, or with values that cannot all be right, is not kept. The lookup answers with what it had, for the user to complete from the label as a food of their own. Values that cannot all be right are a value below zero, energy above 1000 kcal, a macro above 100 g, or the three macros above [the limit for own foods](#your-own-foods). A product Open Food Facts answers under another barcode than the one asked for, such as one merged into another, is not found and not kept. So is a product that names no barcode of its own. A product the catalogue refuses to store is answered as one with values that cannot all be right, and that answer is held in memory like any other. When storing fails for any other reason, such as a busy database, the lookup fails as any other request would. The product it fetched is held in memory, so the next lookup of the code stores it with no call.

A found food answers with its detail and a flag saying whether this lookup made it visible to the user, so their earlier searches no longer hold. The flag is true on a user's first lookup of a product, whoever kept it. A kept product is never refreshed. An operator takes one down by setting `retired_at`. Search then stops finding it, its users' days and favourites keep reading it, and a lookup of its barcode answers not found with no call.

Calls to Open Food Facts are limited twice: 30 an hour for each user and 10 a minute for the whole server, below the 15 Open Food Facts allows. Only a real call counts. A lookup answered from an own food, a kept product or memory spends nothing. Two lookups of one code at once make one call, and only the lookup that made it spends from the budgets.

### Food-name language

Each user reads food names in Finnish or in English, and chooses which in Settings. Finnish is the default. A food without an English name shows its Finnish name in either setting. Search matches both names whatever the setting.

### Fineli

Fineli is the Finnish food composition database of the Finnish Institute for Health and Welfare (THL), used under the [Creative Commons Attribution 4.0](https://creativecommons.org/licenses/by/4.0/) licence. Hovimestari converts its energy values from kilojoules to kilocalories. Hovimestari is not produced or endorsed by THL.

The app shows this credit in those words, and every Fineli food names Fineli as its source and leads to the credit.

### Open Food Facts

Open Food Facts is an open database of food products, made by its contributors and published under the [Open Database License](https://opendatacommons.org/licenses/odbl/1-0/). Each product's data is under the Database Contents License. Hovimestari converts energy given only in kilojoules to kilocalories and adds the brand to a product's name. Hovimestari is not produced or endorsed by Open Food Facts.

The server calls Open Food Facts, never the browser. A call carries the barcode and a User-Agent naming the app and its version, and nothing of the person. A call follows no redirect.

### The Fineli import

Fineli publishes its data as a release, a zip of files. An import loads a release into the catalogue, and [the Fineli import runbook](../setup/fineli-import.md) has the steps. Each Fineli food arrives with its Finnish and English names and four values per 100 g: energy, protein, available carbohydrate (fibre not included, as on food labels) and total fat. Fineli gives energy in kilojoules, and the import converts it to kilocalories. Fineli's household measures arrive as the food's portions.

Some releases write every name in capitals, such as "KANANMUNA, KEITETTY". The import stores such a name in sentence case, "Kananmuna, keitetty", the way release 18 writes its names. Search results, the log, the day and an assistant all read the stored name, so they all show it the same way. A name counts as written in capitals when it has a letter and no lower-case letter. Its first character stays as written and the rest is lower-cased, so "(ARC) MARGARIINI 40%, LÄTTA" becomes "(arc) margariini 40%, lätta" and "1 % MAITO" becomes "1 % maito". A name with any lower-case letter is kept exactly as Fineli wrote it.

A food missing one of the four values is left out, because a made-up zero would be a wrong figure. In release 18 that is 8 of 4,058 foods, such as water and a few spices.

A food keeps its identity from one release to the next. A new release updates a food's names and values in place, so every favourite and portion that points at it keeps pointing at the same food. A food that is no longer in a release is retired, never deleted: search stops finding it, and it stays readable with its last figures. A food that a later release still lists but leaves out, for example because one of its values is now missing, is retired the same way, and the import report names it. A food that returns in a later release is live again. Fineli marks some foods with "(arc)" at the start of the name, in small or capital letters, and the import keeps those retired.

The import is safe to repeat: the same release a second time changes nothing. It stops and writes nothing when the release would retire more than 10 % of the Fineli foods, because a wrong folder or a cut-off file looks just like that. It also stops when the release would rename more than 5 % of them, and more than ten, because a file read in the wrong encoding changes every name with å, ä or ö. A person who has checked the release can tell it to go ahead in either case. Every run prints a report of what it added, changed, retired and left out, with a line that adds the foods up to the number read. A rename is a food whose Finnish name changed under the same Fineli id. The report lists every one, so a person can check it is still the same food. A name that changed in case only is still the same food, so it is no rename. The report counts those foods on a line of their own, and they never trip the rename guard. An import over names stored in capitals rewrites each of them once.

## How it works

### Visibility

`visibleTo(userId)` in `apps/backend/src/services/foodScope.ts` is the only place the rule is written: a food is visible when it is a Fineli food, the user's own, or an Open Food Facts food the user has a `food_lookups` row for, and its owner has not deleted it. Search, the detail, favourites, recents and logging all follow it, so a user can log or star only a product they looked up. `portionVisibleTo(userId)` does the same for portions: one that came with the food's source, or the user's own. Every food read and write goes through them. Another user's own food answers 404 `food_not_found` on every route, never 403, and another user's portion answers 404 `portion_not_found`, so a response never tells that it exists. A read-only check comes after: a visible shared food answers 403 `food_read_only` to an edit or a delete, and a portion that came with a shared food answers 403 `portion_read_only`. Every update and delete also names the owner in its own `WHERE`, so a write never trusts the earlier read.

### The search rule in code

Migration `0001_search_functions.sql` installs `pg_trgm` and `unaccent` and three SQL functions. `food_search_norm` lowers a name, folds its accents and turns every run of other characters into one space. `food_search_head` gives the head of a name: the first word of its first part, with hyphens kept. Parts are split on a comma and a space, so the decimal comma in "rasvaa <0,5 %" never starts a part. The migration refuses a database that is not UTF-8, because on any other encoding `char_length` counts bytes and the character classes drop accented letters. It also refuses a server without the ICU collation `fi-x-icu`, which the alphabetical order needs. The generated columns `search_name`, `search_name_en`, `search_all`, `search_head` and `search_head_en` call them, so the index, the filter and the ranking normalise names one way.

`searchWords` in `apps/backend/src/services/foodSearch.ts` normalises the query with `food_search_norm` in the database, then splits it into words in TypeScript, drops words under two characters (`MIN_WORD_LENGTH`) and duplicates, and keeps the first eight (`MAX_WORDS`). A normalised word holds only letters and digits, so no `LIKE` wildcard reaches a pattern. With no word left, `searchFoods` in `apps/backend/src/services/reads/foods.ts` answers an empty list without a query. Otherwise `searchQuery` binds each pattern as one parameter and runs one ranked query. A food matches when `search_all` holds every word. The tier of step 1 is computed on `search_head` and `search_name`, and on their English twins, and the lower of the two wins. Steps 4 and 5 split the display name on `, ` and count its characters. The alphabetical step orders by `byName` in `apps/backend/src/services/foodRows.ts`, which adds `COLLATE "fi-x-icu"`, so the tests (which run under `C.UTF-8`) and any production locale sort alike. Every alphabetical order on a food or portion name uses it. The id breaks the last tie. A word of three characters or more is served by the trigram index `foods_search_all_trgm`. A two-character word has no trigram to look up, so its search scans the whole catalogue: a median of 24 ms on 10,001 foods. Measure it again before Open Food Facts products share the table. The display name and its language come from the same query, so the screen and an assistant get the same names.

A bulk load fills the trigram index's pending list, and until a `VACUUM` the planner prices the index above a full scan. The import runs `VACUUM ANALYZE foods` after every run that writes, and the search tests run it before they check the plan.

`apps/backend/src/services/__tests__/foodSearch.db.test.ts` pins the rule on 249 real Fineli names in `fixtures/fineli-names-r18.csv`, credited in the README next to it.

### The import in code

The command is `fineli:import` in `apps/backend/package.json`, and its code is in `apps/backend/src/scripts/fineliImport/`:

- `readRelease.ts` reads the release folder and touches no database. It needs `food.csv`, `foodname_FI.csv`, `foodname_EN.csv`, `component_value.csv` and `foodaddunit.csv`, finds each file whatever the case of its name and each column by its header, and stops with a `ReleaseError` naming the file and the column when one is missing, or saying the file does not look semicolon-separated when its header is one field. Each file is read as UTF-8 when its bytes are valid UTF-8, else as Windows-1252, which release 18 uses for its name files. A file that fails UTF-8 but holds more than ten valid UTF-8 sequences (`MAX_UTF8_SEQUENCES_IN_WINDOWS_1252`) is damaged UTF-8 and stops the import, naming its first bad line and the count. Release 18's Windows-1252 files hold no such sequence. `descript.txt` is optional and only gives the release number, so when it cannot be read the report has no release number and the import goes on. Only the four needed components of `component_value.csv` are kept while it is parsed, so the import stays near 160 MB on release 18. Values take a decimal comma or point. The four values are `ENERC` (kJ, divided by 4.184 and rounded to two decimals), `PROT`, `CHOAVL` and `FAT`, rounded to the three decimals the columns hold. A food is left out when a value is missing, unreadable, or above 1000 kcal or 100 g. The measures kept are the ten units of `FINELI_PORTION_UNITS`, with grams rounded to one decimal, and a measure of another unit or a weight outside 0 to 5000 g is left out and counted. Release 18 has a turkey whose pieces weigh 6000 g and 8000 g. Both name files go through `sentenceCase` in `nameCase.ts`, which lower-cases with the Finnish or the English rules by name (`toLocaleLowerCase("fi")` or `"en"`), never the machine's own locale, so a machine set to Turkish still lowers "I" to "i". The letters ß and µ have no capital of their own, so a name in capitals may hold them. The "(arc)" mark is matched without regard to case (`ARCHIVED_MARK`).
- `applyRelease.ts` writes in one transaction, behind an advisory lock so two imports never interleave. It upserts each food on `fineli_id`, so a known food keeps its `id`, and writes only the foods that changed. It sets `retired_at` on every live Fineli food the release no longer has, and tells apart a food absent from the release from one the release lists but left out. Both guards run before any write and throw `RetireGuardError` or `RenameGuardError`. The retire guard (`RETIRE_GUARD_SHARE`, 10 %) counts every live Fineli food the release would retire, left-out foods included, against the live Fineli foods. `--allow-retire` lifts it. The rename guard (`RENAME_GUARD_SHARE`, 5 %, never below `RENAME_GUARD_MIN`, ten foods) counts renames of live foods only, and `--allow-rename` lifts it. Its message shows three of the renames, and the report lists every rename. Adding or dropping "(arc)" is not a rename, and neither is a change of case. A food whose Finnish or English name changed in case only, and neither in more than that, counts toward `namesChangedInCaseOnly`. Fineli measures are upserted on `(food_id, fineli_unit)`, and a released food's measure that the release dropped is deleted. A retired food keeps its measures, and a user's own portion is never touched. A dry run does all of it and rolls back.
- `cli.ts` parses the arguments (`--dry-run`, `--allow-retire`, `--allow-rename`), runs the import, prints the report from `report.ts`, then runs `VACUUM ANALYZE foods`. It answers exit code 0 when done, 1 when nothing was written (the release cannot be read or a guard stopped it) or most likely nothing was (the database failed during the import), 2 for bad arguments, and 3 when the import was written but the statistics refresh failed. `index.ts` also answers 1 when `DATABASE_URL` is not set.
- `index.ts` is the entry point. It needs only `DATABASE_URL`, so it runs on a Fly machine through the built `dist/scripts/fineliImport/index.js`.

The tests run on fixtures in `__tests__/fixtures/`: rows of release 18 in its own bytes, credited in the README there, with a second release that changes, renames, drops and adds foods.

### The barcode lookup in code

`lookupBarcode` in `apps/backend/src/services/writes/barcode.ts` runs the steps of [looking up a barcode](#looking-up-a-barcode). Its helpers are in `apps/backend/src/lib/openFoodFacts/`:

- `gtin.ts` reads a code. `readingsOf(code, format)` answers the 14-digit forms a lookup tries, each marked when it is a shop's own number, or none for a wrong check digit, a length no barcode has, a 14-digit code with indicator digit 1 to 8, which is a case or a pack, or an 8-digit code its `format` disagrees with. `format` settles only an 8-digit code and is ignored at 12 to 14 digits. It follows the GS1 General Specifications, cited section by section in the file: the check digit, the 8-digit UPC-E expanded to its 12 digits, and the restricted numbers. Those are 8 digits starting 0 or 2, 12 digits starting 2 or 4, 13 digits starting 02, 04 or 20 to 29, a company's internal UPC numbers from 000000 and from 001000 to 007999, and 14 digits with indicator digit 9, an item sold by weight. Every rule reads the 14-digit form, so a code typed with extra leading zeros reads the same.
- `client.ts` makes the one call: `GET {OFF_BASE_URL}/api/v2/product/{code}` with the fields it reads, the code in its 13-digit form when it starts with 0. One attempt, 5 seconds, at most 512 KB of body, and a redirect counts as unavailable. The product's own code is `product.code`. The answer's top-level `code` repeats the code asked for, so it is never read. Not found is HTTP 404 or `status: 0`. Anything else unusable throws `OffUnavailableError`, whose message names the kind of failure and never the code or the address.
- `product.ts` parses the body with Zod. A field of the wrong type counts as missing, and a string holding a number is read as that number. Names and brands lose their C0 and C1 control characters and their bidi controls, because Postgres refuses a NUL in text and a bidi control reorders a name on screen. `foodOf` decides what is kept, and checks the macro sum with `macroSumWithinLimit` from `packages/types`, the function the own-food body uses.
- `limiter.ts` holds the budgets as token buckets, and `cache.ts` the answers held in memory, at most 500. Both read an injected clock.

The service checks both budgets and takes one call from each in one synchronous step, so a call spends from both or from neither. The user's empty budget answers 429 `barcode_lookup_limit` and the server's 429 `barcode_lookup_busy`, the user's first. Each error carries `retryAfterSeconds`, 120 and 6, and the error middleware sends it as `Retry-After`. The per-user budgets drop a user whose budget has refilled. Budgets and memory live in the backend process, so a restart or a deploy empties them.

`LookupDeps.inFlight` maps each 14-digit form to the call under way for it. A lookup that misses the stored products and the memory waits on that call when there is one. Otherwise it spends from both budgets and starts the call. The entry goes when the call settles. Each waiting lookup records its own lookup and gets its own flag.

A complete product is inserted with `ON CONFLICT DO NOTHING` on `foods_off_barcode_uq`, in a statement of its own, then read back after it committed. `storedFormOf` in `gtin.ts` gives the barcode it is stored under. Two first lookups at once on two machines both call Open Food Facts, the second insert does nothing, and both read the one row. A row refused by a constraint, SQLSTATE class 23, answers `incomplete` with `implausible_values`, is logged without its values, and is cached as that answer. Any other failure of the insert or the read-back goes to the error middleware unchanged, so a busy database answers 503 with `Retry-After: 2`. The cache then holds the parsed product as `fetched`. A lookup that finds it retries only the insert and the read-back, through the in-flight entry, with no call and no budget spent. The user's lookup is then recorded with an upsert on `food_lookups`, whose `xmax = 0` says whether it inserted the row. That is the flag on the answer.

### Services

The routes call these, and the assistant's tools will call the same ones. `reads/foods.ts`: `searchFoods`, `getFood`, `listFavouriteFoods`, `listOwnFoods`. `writes/foods.ts`: `createOwnFood`, `updateOwnFood`, `deleteOwnFood`, `addPortion`, `updatePortion`, `removePortion`, `setFavourite`. `writes/settings.ts`: `updateSettings`, for the food-name language and the time zone. `writes/barcode.ts`: `lookupBarcode`, with the budgets and memory the route shares. A write answers `{ value, outcome }`, and the route sends `value`. Every write that inserts a row first takes the user's row `FOR KEY SHARE` through `lockUserForWrite`, as [entry writes](quick-logging.md#locks-and-races) do, so a write that races an account deletion answers 404 `user_not_found`. A portion edit or remove changes one row the deletion takes with the user, and answers 404 `portion_not_found` when it meets one. `updateSettings` answers 404 `user_not_found` when the user is gone by the time it writes.

### API

All under `/api/v1`, all Bearer. A refused request answers `{ message, code }`.

| Method | Path                             | Answers                                                                                                                           |
| ------ | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/foods/search?q=&limit=`        | 200 `{ foods }`. `q` 1 to 100 characters after trimming, `limit` 1 to 50, 30 by default. Else `invalid_request`                   |
| GET    | `/foods/favourites?limit=`       | 200 `{ foods }`, newest favourite first, each with `lastAmount`. `limit` 1 to 200, 100 by default                                 |
| GET    | `/foods/own?limit=`              | 200 `{ foods }`, in Finnish alphabetical order. `limit` 1 to 200, 100 by default                                                  |
| POST   | `/foods/lookup`                  | 200 with the lookup. 400 `barcode_invalid`. 429 `barcode_lookup_limit` or `barcode_lookup_busy`. 503 `barcode_lookup_unavailable` |
| GET    | `/foods/:id`                     | 200 with the food, its barcode, Fineli id, type and process, portions and `lastAmount`. 404 `food_not_found`                      |
| POST   | `/foods`                         | 201 with the new food. 409 `barcode_taken`                                                                                        |
| PUT    | `/foods/:id`                     | 200 with the food. 403 `food_read_only`. 404. 409 `barcode_taken`                                                                 |
| DELETE | `/foods/:id`                     | 204, deleted, or hidden when days use it. 403 `food_read_only`. 404                                                               |
| POST   | `/foods/:id/portions`            | 201 with the portion. 404 `food_not_found`                                                                                        |
| PUT    | `/foods/:id/portions/:portionId` | 200 with the portion. 403 `portion_read_only`. 404 `portion_not_found`                                                            |
| DELETE | `/foods/:id/portions/:portionId` | 204. 403 `portion_read_only`. 404 `portion_not_found`                                                                             |
| PUT    | `/foods/:id/favourite`           | 204, also when it already is one. 404 `food_not_found`                                                                            |
| DELETE | `/foods/:id/favourite`           | 204, also when it is not one. 404 `food_not_found`                                                                                |
| PATCH  | `/users/me/settings`             | 200 with the user. Takes `foodNameLanguage`, `timeZone` or both. 400 `invalid_time_zone` or `invalid_request`                     |

A food in a list has `id`, `source`, `name` in the user's language, `otherName` (the other language's name when it differs), `per100g`, `isFavourite`, `isOwn` and `retired`. A refused own food answers `food_name_required`, `food_name_too_long`, `food_name_not_searchable`, `food_value_required`, `food_energy_invalid`, `food_macro_invalid`, `food_macro_sum_too_high` or `barcode_invalid`. `food_macro_sum_too_high` is reported on `per100g.fatG`, the last macro, and is checked only once each macro passes its own check. A refused portion answers `portion_name_required`, `portion_name_too_long` or `portion_grams_invalid`. The detail's `portions` list the shared food's portions first, in the fixed order of `FINELI_PORTION_UNITS`, then the user's own by name. Each portion has `unit` for a shared one or `name` for an own one, `grams` and `isOwn`. The shapes are in `packages/types/src/foods.ts`.

`POST /foods/lookup` takes `{ barcode, format? }`. `format` is `ean_8` or `upc_e`, sent by a scan. It settles which way an 8-digit code reads and is ignored for a longer one. The barcode travels in the body, so no address and no request log line holds it. It answers `found` with `food` and `newlyVisible`, `incomplete` with `reason` (`missing_values` or `implausible_values`) and `product` (its name and the four values, each a number or null), `not_found`, or `in_store` for a shop's own number. A 429 also sends `Retry-After`. The shapes are in `packages/types/src/barcode.ts`. `POST /foods` reads `OwnFoodBodySchema`, which refuses a name search cannot find. `PUT /foods/:id` reads `OwnFoodUpdateBodySchema`, which leaves that check to the service, for a changed name only.

### Data

- `foods`: `source` (`fineli`, `open_food_facts` or `user`), `user_id` set only on an own food, `fineli_id` set only on a Fineli food, `name` (Finnish for Fineli), `name_en`, the four values per 100 g, `barcode`, `fineli_type` and `fineli_process`, `retired_at`, `deleted_at` on an own food its owner deleted while days use it, and the generated search columns. CHECKs tie the owner and the Fineli id to the source, keep the values in range and the barcode to 8 to 14 digits, and give every Open Food Facts food a barcode. `foods_user_barcode_uq` keeps one barcode per user among own foods. `foods_off_barcode_uq` keeps one Open Food Facts food per barcode padded to 14 digits, so a 12-digit and a 13-digit form are one product.
- `food_lookups`: `user_id`, `food_id` and `looked_up_at`, one row per user and Open Food Facts food they looked up. A row goes only with its user or its food, by the two cascades, and no code deletes one. A user can log or star such a food only once it is visible, so every one in their favourites or recents keeps its row.
- `food_portions`: `food_id`, `user_id` set only on a user's own portion, `fineli_unit` or `name` (exactly one), `grams` above zero and up to 5000. A Fineli portion has no owner, and the CHECK `food_portions_fineli_unit_known` keeps `fineli_unit` to the units the API names. `food_portions_fineli_unit_uq` keeps one of each Fineli unit per food.
- `food_favourites`: `user_id` and `food_id`, one row per favourite.
- `users.food_name_language`: `fi` or `en`, `fi` by default.

Every table with `user_id` cascades from `users`, so deleting an account removes its own foods, portions, favourites and lookups and leaves every shared food and shared portion.

### Known gaps

- Looking up a barcode exists in the API only. The log sheet does not offer it yet, Settings does not show the Open Food Facts credit yet, and a kept product does not link to its page at Open Food Facts yet.
- A drink's figures from Open Food Facts are often per 100 ml. The catalogue shows them as per 100 g.
- The budgets live in one backend process. A second machine would double the calls the server's budget counts.
- The import is tested on Fineli release 18 only. A newer release may name its files or columns differently, and the import then stops and names what it did not find.

Requirements: FR-FOOD-01 to FR-FOOD-08, FR-SCAN-02 to FR-SCAN-06, FR-DAY-07, FR-LOG-04, FR-SET-01, NFR-SEC-01, NFR-PRIV-01, NFR-PERF-01, NFR-DATA-01 (requirements 3.2, 3.3, 3.4, 3.12, 4 and 5)

## Where it appears

- [The log sheet](../app/log-sheet.md): the search, a food's view and its figures, favourites, own foods and portions.
- [Settings](../app/settings.md#food-names): the food-name language, and [the credit](../app/settings.md#food-data) for Fineli's data.
