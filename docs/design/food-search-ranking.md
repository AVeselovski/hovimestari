# Design: food search that finds the ordinary ingredient first

Branch `fix/food-search-ranking`. Written 2026-11-24, revised the same day after the design review (verdict: approve after changes). The review's findings are answered one by one in [Review round 1](#review-round-1-findings-answered). Every figure here was measured on Fineli release 18 (4,023 live foods: 1,405 FOOD, 2,618 DISH, and 27 more retired as "(arc)") in a scratch Postgres, with the rule as built and the proposal run side by side. The before and after tables for 83 searches are in [food-search-ranking-evidence.md](food-search-ranking-evidence.md).

## For the owner

**Build it, in two steps around one more run of the Fineli import. No requirement changes. One thing to check first.**

**What changes.**

1. Search learns which foods are basic and which are common, from Fineli's own recipes. A Fineli release holds a file the import has never read: the ingredients of 1,968 Fineli recipes. Two counts come out of it. How many recipes use a food: light milk 296, goat milk 0, the shelled egg 395, the quail egg 0, plain quark 16, every flavoured quark 0. And how many foods a dish is made of: boiled potato is one, a spaghetti casserole is eight. Nothing in it is the app's opinion, and nothing says what to eat.
2. A basic food comes before a dish. Basic means a Fineli food, your own food, a product you scanned, or a "dish" that is one food cooked, such as boiled rice.
3. Eighteen Finnish word pairs, for meats and a few staples: "nauta" also finds "naudan", "sika" finds "sian", "lammas" finds "lampaan", and the other way round. It is a short list, not Finnish grammar.
4. When few foods hold every word, the sheet also lists the foods that hold all words but one.

**Your two searches.**

| Search             | Today                                                                       | After                                                                                                                                                         |
| ------------------ | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| spagetti           | Two ready meals, a Knorr sauce powder, two casseroles. The dry pasta is 6th | "Pasta, spagetti, makaroni" 1st, its two gluten-free kinds, then boiled spaghetti. No ready meal in the first eight                                           |
| jauheliha 10 nauta | The pork and beef mince at 10 %, and nothing that says beef                 | The same mince first, because it is the only one at 10 %. Then, under "All but one of your words": pork and beef mince, beef mince at 9 %, at 17 % and at 7 % |

Fineli release 18 holds no beef mince at 10 %. It has beef at 7 %, 9 % and 17 %, and pork and beef at 7 % and 10 %. The search cannot say "there is none" in words. It shows the one food with all three words and the nearest ones under it.

**Everyday searches.**

| Search | Today, first                          | After, first                                         |
| ------ | ------------------------------------- | ---------------------------------------------------- |
| maito  | Goat milk. Light milk is 6th          | Light milk, fat-free milk, whole milk. Goat milk 9th |
| rahka  | A flavoured quark. Plain quark is 8th | Plain quark, then its low-lactose twin               |
| peruna | "Peruna, uusi". Boiled potato is 12th | "Peruna, vanha, kuorittu". Boiled potato 6th         |
| omena  | Dried apple                           | The average apple. Dried apple 4th                   |
| egg    | Quail egg                             | The shelled hen's egg. Quail after the hen's eggs    |
| nauta  | Pork and beef minces only             | Eight beef cuts, "Naudanpaisti" first                |
| juusto | "Juusto, tuotekeskiarvo"              | Emmental, then the average cheese                    |

**What gets worse.**

- **A dish under a one-word ingredient search moves down, and some leave the 30 rows.** "omena": Omenapiirakka from 14th to 35th. "muna": Munakas from 17th to 38th. "sipuli": Sipulikeitto from 14th to 39th. "makaroni": Makaronilaatikko from 25th to 31st. "kana": Kanakeitto from 25th to 109th. "tomaatti": Tomaattikeitto from 8th to 29th. Typing the dish's own name finds each at once.
- **A few food classes Fineli types as dishes lose their first row** to a basic food that mentions the word: "mysli" starts with a yoghurt with muesli, "keksi" with a rice cake, "smoothie" with twelve meal-replacement powders (the first smoothie is 13th), "salaatti" with pickles and lettuces (the first salad is 8th, was 3rd).
- **English names lose more than Finnish ones.** "soup" starts with meal-replacement soup powders, and the first pea soup goes from 1st to 14th. "bread" starts with a flour mixture for bread rolls. The first "Rye bread" was 35th and is 38th.
- "leipä" starts with one odd home-made flatbread, then today's order. "chicken" puts chicken strips first and plain "Chicken" 4th. "naudan jauheliha" puts pork and beef mince first and beef mince second.
- "kana" still shows carrots from 4th, and "kaura" still shows pulled oats before oat flakes.

**One thing to check first.** Nobody has seen whether your own download of Fineli holds the recipe file. Please send the output of these two commands from the repository root:

```bash
ls apps/backend/data/fineli/
grep -i -m 3 "release" apps/backend/data/fineli/descript.txt
```

**Yours to decide.** The build follows the recommendation in each until you say otherwise.

1. **Your own and scanned foods above Fineli's, whenever they hold the word.** An own food "Oma maitorahka" would top "rahka", above "Rahka, maitorahka, maustamaton". Today it sits under every food that begins "Rahka". Favourites move the same way. Recommended: yes.
2. **Dry and raw foods before their cooked forms**, or mixed by how many recipes use each. Recommended: dry first. Boiled spaghetti is then 4th and boiled rice 4th.
3. **A scan button under a short result list**, now or later. Recommended: later. It is a second way into the scanner, and nobody reported needing it.
4. **Dishes that now need a fuller name**, as listed above. Recommended: accept it. The other choice is a second rule for the log sheet.
5. **If your download has no recipe file: may the two counts for release 18 be committed to the repository**, about 2,500 rows, with Fineli's credit? Recommended: yes. Without the counts only "spagetti" and "nauta" get better.
6. **One pull request or two.** Recommended: two. The first only teaches the import to read the counts and changes nothing you see. You run the import and send its report. The second changes the search. In one pull request, search on a database that has not been re-imported is worse than today for some words.
7. **The "All but one of your words" list** is new on the most-used screen. Recommended: build it. It is how your second search shows the beef minces.

## 0. Product decisions the owner may want to shelve

The design assumes each recommendation. Each flip is local.

| #   | The fork                                                                                                                                                                      | Recommendation and why                                                                                                                                                                                                                                                                                                                                                             | If the other branch is picked                                                                                                                             |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.1 | Own foods, scanned products and favourites: above Fineli's foods whenever they match as strongly, or only among foods whose name holds the word in the same place (as today)? | **Above.** The rule orders by group, then "yours", then position. So "Oma maitorahka", where the word ends a later word, tops "rahka" over "Rahka, maitorahka, maustamaton", and a scanned milk tops "maito". Today a scanned product ranks after every Fineli dish and can fall outside the 30 rows. A person's own foods are the strongest signal the app has that is not advice | Swap the "yours" and "position" keys. Own foods and favourites then lead only within one position, as today, and scanned products still move up from last |
| 0.2 | A dry food and its cooked form match equally. Dry and raw first, or mixed by recipe use?                                                                                      | **Fineli foods first, then one-food dishes.** The complaint came from building recipes, where the dry weight is wanted. Cooked forms land 4th to 7th                                                                                                                                                                                                                               | Swap two keys. Boiled spaghetti (7 recipes) then comes before dry pasta (5), and boiled rice is 2nd for "riisi"                                           |
| 0.3 | The scan button in the block under a short list                                                                                                                               | **Not in this change.** It is a second mount site for the scanner, and wiring it means lifting a test out of `SearchField` and loosening `useScanner`'s focus return. One smell, for something nobody reported. Filed in `TODO.md`                                                                                                                                                 | Build it as the first revision of this doc described. Its own small frontend slice                                                                        |
| 0.4 | Dishes under a one-word ingredient search move down and can leave the 30 rows                                                                                                 | **Accept.** It is the rule doing what was asked. The fuller name finds each dish. A per-screen flag would not cure the other losses (mysli, keksi, smoothie, English bread and soup), which come from "a basic food with the word beats a dish named by it", and the picker wants that too                                                                                         | A `basicFirst` flag on the route and on `search_foods`, off on the log sheet. Two rules to test and document                                              |
| 0.5 | Where the two counts come from when the owner's download has no `contribfood.csv`                                                                                             | **Commit a derived table** for release 18, credited to THL Fineli under CC BY 4.0, and let the import read it when the folder has no recipe file. The repository already commits real release 18 rows under that credit                                                                                                                                                            | Ship without counts: "spagetti" and "nauta" improve and nothing else does. Or wait for a release that has the file                                        |
| 0.6 | One pull request or two around the import run                                                                                                                                 | **Two.** PR 1 is the columns and the import. It changes no behaviour, and its report on the owner's real release proves the file reads before anything depends on it. PR 2 is the rule and the web                                                                                                                                                                                 | One PR. Search on a database migrated but not re-imported is worse than today for "kana" and "riisi" (section 3). A test pins that state either way       |
| 0.7 | The `near` list, "All but one of your words"                                                                                                                                  | **Build.** Without it "jauheliha 10 nauta" shows one pork and beef mince and nothing about beef. It is noisy for two unrelated words ("kana riisi" lists rice foods and chicken foods) and its heading says what it is                                                                                                                                                             | Drop `near` from the answer and the web. The owner's second search then shows two rows                                                                    |
| 0.8 | A typed word and its listed form rank alike                                                                                                                                   | **Alike.** So "naudan jauheliha" puts pork and beef mince (55 recipes) before beef mince (26). Ranking the typed form first would put four pork and beef foods before any beef for "nauta"                                                                                                                                                                                         | One more key: a direct match before a form match. Better for "naudan jauheliha", worse for "nauta"                                                        |
| 0.9 | One rule for the log sheet, the ingredient picker and `search_foods`                                                                                                          | **One rule.** See 0.4, and the review's catalogue-wide check in section 3                                                                                                                                                                                                                                                                                                          | See 0.4                                                                                                                                                   |

Filed separately in `TODO.md`, not decisions of this change: a spelling fallback ("spageti"), synonyms ("kana" and "Broileri"), English plurals ("eggs"), and the scan button of 0.3.

## 1. Requirements validation

**Verdict: aligned.** No wording in `docs/requirements.md` needs to change.

| Requirement                                                                  | How the design meets it                                                                                                                                                         |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-FOOD-03, search by name in Finnish and in English, matching partial words | Unchanged matching, plus the listed word forms. Both names still match whatever the language setting                                                                            |
| FR-FOOD-02, Fineli foods for every user                                      | The import reads one more file of the same release                                                                                                                              |
| FR-SCAN-04, a kept product is found by the next search                       | Unchanged, and decision 0.1 ranks it where the user sees it                                                                                                                     |
| FR-AI-06, NFR-AI-03, the assistant gets the catalogue search                 | `search_foods` calls the same service and answers the same two lists                                                                                                            |
| NFR-PERF-01, search feels instant                                            | Measured: 1.1 ms for three words, 3.9 ms for the widest one-word search (609 matches), 2.5 ms for the "all but one" scan. The review measured 2.0 ms and 3.7 ms on its own copy |
| No advice (product rule)                                                     | The order comes from name shape and from two counts of Fineli's own recipe rows. No nutrient, no target and no user behaviour enters it                                         |

**The problem, stripped of the proposed mechanism:** a person typing the ordinary name of an ordinary ingredient should see it in the first rows, in its base form or an inflected one, and should learn at once when the catalogue does not hold it. The brief proposed mechanisms to consider. Each was measured. "Fineli's type earlier in the rule" alone is not enough (section 3), and a per-screen flag is rejected (0.4).

**Changes proposed that were not asked for:** own and scanned foods and favourites above position (0.1), the `near` list (0.7), reading `contribfood.csv`, and possibly a committed table of counts (0.5). Each has a row in section 0.

**Requirements drift:** none found.

## 2. The rule as it is, and why it fails

`searchQuery` in `apps/backend/src/services/foodSearch.ts` orders by: (1) how the **first** typed word meets the **first word** of a name, in six tiers, (2) favourite, own, rest, (3) Fineli FOOD, DISH, other, (4) fewer parts, (5) shorter name, alphabetical.

| Search             | What happens                                                         | Cause                                                                                                                             |
| ------------------ | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| spagetti           | Five dishes and a sauce powder, then "Pasta, spagetti, makaroni" 6th | Step 1 only looks at the first word. "Spagetti ja jauhelihakastike" has it there, the plain pasta has it second. Type comes after |
| jauheliha 10 nauta | Only the pork and beef mince                                         | "nauta" is not part of "naudan". Nothing bridges the stem. And nothing shows that the 10 % beef mince does not exist              |
| rahka              | Plain quark 8th                                                      | Within one tier and type, only parts and length decide. "Rahka, maustettu, rasvaa 4 %" is shorter                                 |
| maito              | Goat milk 1st, light milk 6th                                        | Same. "Maito, kutunmaito, vuohenmaito" is the shortest three-part milk                                                            |
| egg                | Quail egg 1st                                                        | Same, by the English name                                                                                                         |
| rice               | Rice chocolate 2nd by Finnish names. Rice cake 1st by English ones   | Same                                                                                                                              |
| omena              | Dried apple 1st                                                      | Same                                                                                                                              |
| peruna             | "Peruna, uusi" 1st, the common potato 4th, boiled potato 12th        | Same, and boiled potato is typed DISH                                                                                             |
| kaura              | Pulled oats 1st                                                      | "Nyhtökaura" ends with the word, "Kaurahiutale" only starts with it                                                               |
| kana               | Carrot 4th                                                           | "Porkkana" ends with "kana". No rule can tell without knowing the words                                                           |

The earlier design (`targets-and-foods.md`, section g, decision 6) said nothing in the data tells the plain variant from the others. That was true of the five files the import reads. It is not true of the release.

## 3. Options and evidence

### What the release holds that the import does not keep

| Field                                                          | What it says                                                                                                                                                                                  | Verdict                                                  |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `contribfood.csv` (10,797 rows: recipe, ingredient food, mass) | Which foods Fineli's 1,968 recipes are made of. 1,935 are recipes of dishes and 33 of foods typed FOOD. 809 foods are used at least once. 284 live dishes are one food besides water and salt | **Use.** Two counts per food                             |
| `food.csv` `IGCLASS`, the ingredient class                     | Every DISH is `NONINGR`, so it repeats the type. For FOOD it gives the kind. It also marks water (`WATER`) and salt (`SALT`)                                                                  | Use only to leave water and salt out of the second count |
| `food.csv` `PROCESS` (RAW, IND, BOIL, ...)                     | Milk and quark are IND like every branded product                                                                                                                                             | Not used                                                 |
| `food.csv` `FUCLASS`, the use class                            | Separates plain quark from flavoured, not light milk from goat milk, and would need a hand-kept order of classes                                                                              | Not used                                                 |
| Fineli id                                                      | Goat milk (604) is older than light milk (684)                                                                                                                                                | Not used                                                 |

**Where the file was seen.** Not in Fineli's own download: nobody here has it. The release 18 folder in the session scratchpad was itself copied from a community mirror, and only the files the import reads were copied, so its lack of the file says nothing. The mirror's `basic-package-2/contribfood.csv` joins to release 18's `food.csv` with no id missing on either side (the review checked this), and `basic-package-1` holds the same file. So Fineli published it in the Basic packages of release 18. Whether the current release has it is unverified. Section h has both outcomes.

The first count on the cases:

| Search         | Recipes that use each match                                               |
| -------------- | ------------------------------------------------------------------------- |
| maito          | kevytmaito 296, rasvaton 46, täysmaito 22, goat milk 0                    |
| kananmuna, egg | kuoreton 395, keitetty 14, luomu 2, quail 0                               |
| rahka          | plain quark under 0.5 % 16, its low-lactose twin 1, every flavoured one 0 |
| peruna         | vanha kuorittu 114, boiled 44, punnittu kuorineen 13, uusi 3              |
| omena          | keskiarvo 17, ulkomainen 10, kotimainen 8, dried 7                        |
| riisi, rice    | puuroutuva 44, boiled 22, pitkäjyväinen 12, rice chocolate 0              |
| jauheliha      | sika-nauta 55, naudanpaisti 9 % 43, naudan 17 % 26                        |

The count orders **basic foods only**. A bread's count is how many Fineli sandwiches name it, which says nothing about bread. With the count applied to dishes too, "Ruisleipä, ruista 51%" fell from 1st to 13th for "leipä". With dishes left to today's parts and length it is 2nd, and "ruisleipä", "pulla" and "muro" keep today's order. Every gain in this design is on basic foods and is untouched.

### Candidate rules

All were run on the full catalogue. The rank of a target food under each:

| Search, target                                     | As built | A   | B   | **E (proposed)** |
| -------------------------------------------------- | -------- | --- | --- | ---------------- |
| spagetti, Pasta, spagetti, makaroni                | 6        | 1   | 1   | **1**            |
| rahka, plain quark                                 | 8        | 1   | 1   | **1**            |
| maito, kevytmaito                                  | 6        | 1   | 1   | **1**            |
| egg, Kananmuna, kuoreton                           | 2        | 1   | 1   | **1**            |
| peruna, Peruna, vanha, kuorittu                    | 4        | 1   | 1   | **1**            |
| peruna, boiled potato                              | 12       | 6   | 6   | **6**            |
| kaura, Kaurahiutale                                | 2        | 9   | 2   | **2**            |
| tomaatti, Tomaattimurska                           | 5        | 34  | 6   | **7**            |
| kana, Kananmuna, kuoreton (unwanted)               | 11       | 82  | 13  | **16**           |
| salaatti, first many-food dish named "Salaatti, …" | 3        | 8   | 15  | **8**            |

- **A**: match strength (whole word or compound end, then word start, then inside), then basic before dish, then position, then recipe uses. It buries a basic food whose word only starts with the search under every dish that holds the word: oat flakes 9th for "kaura", crushed tomatoes 34th.
- **B**: basic before dish first, then position, then uses. It buries a dish named by the word under every basic food that merely starts with it: a cheese ("Juusto, leipäjuusto") before the breads for "leipä", and the first salad 15th where E has it 8th.
- **E**: seven ordered groups that interleave the two (section 4).

The ranks under A and B were measured in the first round, with recipe uses ordering dishes too and a name's first word split at hyphens. The proposed rule keeps hyphens, as today's head does. Neither difference moves a row above.

"Fineli's type earlier in the rule" on its own, with no counts, fixes "spagetti" and "nauta" and nothing else. That is also the rule with every count absent, measured below.

### With the counts absent

A database migrated but not re-imported has every count at 0 and NULL. First six rows:

| Search       | Today                                   | Rule, no counts                                                                                                             |
| ------------ | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| kana         | Kana, two boiled chickens, then carrots | Kana, Porkkana, Porkkana kuivattu, a meal-replacement powder, a vegetable mix, a juice. Boiled chicken is gone from the six |
| riisi        | Three rices, then three boiled rices    | Six dry rices and mixes. Boiled rice is gone                                                                                |
| peruna       | Five potatoes, fried potato             | Five potatoes in today's order, then a meal-replacement powder                                                              |
| maito, rahka | Goat milk first, flavoured quarks first | The same as today                                                                                                           |
| spagetti     | Ready meals first                       | The four dry pastas first                                                                                                   |

So the state is worse than today for words whose cooked form matters, and no better for milk and quark. Section j keeps it from being reached by a person, and a test pins it.

### Finnish inflection

| Option                                             | Measured                                                                                                                                                | What it wrongly matches                                                                                            | Verdict                                          |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| Postgres's Snowball stemmer, `finnish_stem`        | nauta gives "nauta", naudan gives "nauda". sika and sian stay apart. lammas and "lamp". peruna becomes "peru", perunan "perun". porkkana becomes "pork" | It joins none of the asked pairs but kana and kanan, and it would join "peruna" with Peru and "porkkana" with pork | Rejected. The review confirmed each stem         |
| Trigram similarity (`<%`, threshold 0.6)           | "nauta" finds 73 names, all holding "nauta". No "naudan". "lammas" finds 3                                                                              | "chia" finds 192 chicken dishes. "kanamuna" finds a chicken stew pancake, not the egg                              | Rejected for inflection. Filed for typing errors |
| Matching on a cut stem ("nau…")                    | "nau" also starts "nauris" (turnip)                                                                                                                     | Everything sharing three letters                                                                                   | Rejected                                         |
| General consonant rules (tt to t, kk to k, t to d) | Would cover the pairs                                                                                                                                   | "kurkku" becomes "kurku" and finds "Kurkuma" (turmeric)                                                            | Rejected                                         |
| The English name as a bridge                       | "nauta" is in no English name                                                                                                                           | Whatever shares an English word                                                                                    | Rejected                                         |
| **A short list of word pairs**                     | By foods gained from base to genitive: naudan 149, sian 44, porsaan 19, lampaan 18, vuohen 16, hirven 13                                                | See below                                                                                                          | **Chosen**                                       |

**What the list wrongly matches, and what it leaves out.**

- A listed form must start a word. Without that, "sian" matches "Rus**sian**" in two English names, both fish soups.
- `harka`/`haran` was in the first draft and is **dropped**. Typed "härän", it reached "härkä" at a word start, and "härkäpapu" (broad bean) starts with it: four of the first five rows were broad beans. Its gain the other way was one food. Without the pair, "härän" finds its one food, "Häränlihahöystö", as today.
- Left out on purpose, though each gains foods: "piirakan" (32 foods, all "Makean piirakan … pohja", which are crusts, not pies), "salaatin" (16, all "salaatinkastike", a dressing, not a salad), "täytekakun" (8, cake bases), "kananpojan" (4). The first three would put the wrong thing under the base word. The fourth is a word nobody has typed yet.
- **Base to genitive is well covered** by the thirteen changed-stem pairs. The review tried about 95 kitchen nouns and found no unlisted changed stem that gains more than the four above.
- **Genitive to base is open-ended.** Five regular pairs are listed (kana, broileri, kalkkuna, poro, peruna). Not covered: "lihan" (147 foods behind "liha"), "juuston" 106, "kalan" 95, "tomaatin" 86, "kinkun" 47, "pavun" 37, "herneen" 35. People type the genitive mostly for meat ("naudan jauheliha", "broilerin rintafilee"), which is covered. So the promise is small, and every text that states it says "for meats and a few staples".

> **Assumption:** a hand-kept list is a deliberate exception to "prefer a library" and to the earlier refusal of word lists. It holds facts of grammar, not ranking preferences, it is 18 rows, and each row is justified by names in the catalogue. Who maintains it: whoever notices a word that should have found a food. Section h has the query that measures a candidate pair.

### The log sheet's everyday searches

The first round's evidence was weighted to ingredient words. These were added, first screen, Finnish names unless said:

| Search                                                                                        | Verdict        | What changes                                                                                                   |
| --------------------------------------------------------------------------------------------- | -------------- | -------------------------------------------------------------------------------------------------------------- |
| leipä                                                                                         | slightly worse | One home-made flatbread first, because its recipe is one flour. Then "Ruisleipä, ruista 51%" and today's order |
| ruisleipä, pulla, pizza, hampurilainen, suklaa, makkara, kinkku, kaurapuuro, coffee, porridge | same           |                                                                                                                |
| kahvi, olut, juusto, cheese, jogurtti, kerma, jäätelö                                         | better         | The average coffee, medium beer, emmental, plain yoghurts first                                                |
| puuro                                                                                         | better         | Water porridges first, the raw yoghurt porridge no longer first                                                |
| keitto                                                                                        | slightly worse | A canned pea soup first, then today's order                                                                    |
| mysli                                                                                         | worse          | "Jogurtti, luonnonjogurtti ja marjamysli" first, the mueslis from 2nd                                          |
| keksi                                                                                         | worse          | "Riisikakku, riisikeksi" first, the biscuits from 2nd                                                          |
| smoothie                                                                                      | worse          | Twelve meal-replacement powders first. The first smoothie 13th, was 1st                                        |
| salaatti                                                                                      | mixed          | Lettuces come up, which a recipe wants. The first salad dish 8th, was 3rd                                      |
| bread (English names)                                                                         | worse          | "Flour mixture, for bread rolls" first. The first "Rye bread" 38th, was 35th                                   |
| rye bread (English)                                                                           | slightly worse | The same flour mixture first, then today's order                                                               |
| soup (English)                                                                                | worse          | Meal-replacement soup powders first. The first pea soup 14th, was 1st                                          |

**Dishes that move down under a one-word ingredient search**, today to proposed, with the default 30 rows in mind:

| Search   | Dish                                         | Today | Proposed |
| -------- | -------------------------------------------- | ----- | -------- |
| tomaatti | Tomaattikeitto                               | 8     | 29       |
| omena    | Omenapiirakka                                | 14    | **35**   |
| muna     | Munakas                                      | 17    | **38**   |
| sipuli   | Sipulikeitto                                 | 14    | **39**   |
| makaroni | Makaronilaatikko                             | 25    | **31**   |
| kana     | Kanakeitto                                   | 25    | **109**  |
| peruna   | Perunasose                                   | 30    | **32**   |
| broileri | Broileri, rintafilee, appelsiinikastikkeella | 10    | 18       |
| riisi    | Riisipuuro                                   | 40    | 25       |

Bold is outside the 30 rows. The dish's own name finds each first.

**Why English loses more.** A Finnish compound keeps "leipäjuusto" out of the strong group for "leipä". English names put the class word as a separate later word ("Flour mixture, for bread rolls"), so any basic food that mentions "bread" or "soup" beats the dish named by it.

**Does one rule still stand?** Yes. The review searched each of the 278 Finnish first words that three foods or more share, and looked for the first food whose head is or ends with the word. Today it is always first. Proposed: not first for 9, past third for 3, off the first screen for 1 (smoothie). Over 161 English first words: 6, 2 and 2 (smoothie, feta). Those figures predate the change that takes recipe uses off dishes, which can only help them. The losses that remain are in a few classes Fineli types as dishes and a basic food happens to mention. A log-sheet flag would not cure them without also dropping "basic before a dish named by the word", which is the thing asked for.

### Where the proposal is worse than today, ingredient searches

| Search           | Today                                | Proposed                                                     | Why                                                                                                            |
| ---------------- | ------------------------------------ | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| chicken          | "Kana" (Chicken) 1st                 | "Broilerisuikale" (Chicken strips) 1st, "Kana" 4th           | By English name all begin "Chicken", and strips are in 28 recipes against 8                                    |
| naudan jauheliha | "Jauheliha, naudan, rasvaa 17 %" 1st | Pork and beef mince 1st, the beef mince 2nd                  | 0.8                                                                                                            |
| nauta            | Pork and beef mince 1st              | Eight beef cuts. The first mince is 21st                     | Wanted for the cuts. "jauheliha nauta" lists the minces                                                        |
| lampaan          | "Lampaanpaisti" 1st                  | Lamb mince 1st, "Lampaanliha" 3rd, "Lampaanpaisti" 5th       | Typed as the genitive, a whole word outranks the start of a compound. Typed "lammas", the lamb cuts come first |
| tomaatti         | Crushed tomatoes 5th                 | 7th. A meal-replacement soup powder is 4th                   | The powder is a FOOD whose name holds the word alone                                                           |
| sika             | Pork and beef mince 1st              | "Sian selkäsilava" (back fat) 1st, "Sianliha, keskiarvo" 3rd | Its name begins with the word                                                                                  |
| kana             | Carrot 4th                           | Carrot 4th, and three more carrots after it                  | Unchanged in kind. Boiled carrot is now basic too                                                              |
| kaura            | Pulled oats 1st, oat flakes 2nd      | The same                                                     | Unchanged                                                                                                      |
| rice             | "Rice, boiled" 26th                  | 24th                                                         | Not fixed: it shares its group with every basic rice food                                                      |

## 4. The recommended rule

### Matching

A food matches when every typed word, or a listed form of it, occurs in its Finnish or English name. A typed word may be any part of a word, as today. A listed form must start a word. The rest is as built: two characters at least, eight words at most, accents and case folded, retired and other users' foods never.

The pairs, in normalised spelling, in `apps/backend/src/services/foodSearchForms.ts`:

```ts
/** Base form and genitive. Typing either also searches the other, at the start of a word. */
export const SEARCH_FORMS: ReadonlyArray<readonly [base: string, genitive: string]> = [
  ["nauta", "naudan"],
  ["sika", "sian"],
  ["porsas", "porsaan"],
  ["lammas", "lampaan"],
  ["vuohi", "vuohen"],
  ["hirvi", "hirven"],
  ["vasikka", "vasikan"],
  ["ruis", "rukiin"],
  ["rapu", "ravun"],
  ["auringonkukka", "auringonkukan"],
  ["lohi", "lohen"],
  ["maito", "maidon"],
  ["leipa", "leivan"],
  ["kana", "kanan"],
  ["broileri", "broilerin"],
  ["kalkkuna", "kalkkunan"],
  ["poro", "poron"],
  ["peruna", "perunan"],
];
/** The other member of every pair `word` is in. `compound` is true for a changed-stem genitive reached from its base. */
export function formsOf(word: string): { form: string; compound: boolean }[];
```

A form applies only when the typed word **equals** a member. "naut" has no forms.

A pair whose genitive does not begin with its base has a **changed stem**: the first thirteen. The last five are regular.

### Ranking, first difference wins

Terms.

- A **dish** is a Fineli DISH whose recipe count is not exactly one. That takes in the 684 live dishes with no recipe row at all, 629 of them branded products: breads, cereals, biscuits and mueslis count as dishes, like a casserole.
- A **basic food** is everything else: a Fineli FOOD, an own food, a scanned product, or a Fineli DISH whose recipe has exactly one food besides water and salt.
- The **head** is the first word of a name, hyphens kept, as today (`search_head`).

Each typed word meets a name in one of seven ways, the better of the two names, the best of its forms:

| t   | The word                                                           |
| --- | ------------------------------------------------------------------ |
| 0   | is the head ("Rahka, …" for rahka)                                 |
| 1   | ends the head ("Kananmuna" for muna)                               |
| 2   | is a whole word later in the name ("Pasta, spagetti" for spagetti) |
| 3   | ends a later word ("Rahka, maitorahka")                            |
| 4   | starts the head ("Kaurahiutale" for kaura)                         |
| 5   | starts a later word                                                |
| 6   | sits inside a word                                                 |

A listed form never ends a word or sits inside one.

- A base reached from a typed genitive ("nauta" for "naudan") gives 0, 2, 4 or 5, as a word would.
- A changed-stem genitive reached from its typed base is a compound's first part, and "naudanpaisti" is as much beef as "kananmuna" is egg. At the start of a longer word it counts as an end does: 0 as the head, 1 starting the head ("Naudanpaisti"), 2 as a later whole word ("Jauheliha, naudan"), 3 starting a later word ("Jauheliha, naudanpaisti").
- A regular genitive gets no such step, and needs none going this way: typed "kana" is already part of "kanan", and "Kananmuna" stays a word that merely starts with it.

Over all typed words: **strength** is strong when every word is 0 to 3, start when the worst is 4 or 5, inside when any is 6. **Position** is the best word's t when strong, 4 or 5 when start (4 if any word met the head), 6 when inside.

1. **Group.**
   1. A basic food, strong.
   2. A dish, strong, and its head is or ends with a typed word (position 0 or 1).
   3. A basic food, start.
   4. A dish, strong, the word later in the name.
   5. A dish, start.
   6. A basic food, inside.
   7. A dish, inside.
2. **Yours.** A favourite, then an own food or a scanned product, then the rest. **This comes before position.** Within a group, a food of the user's own that holds the word anywhere strongly outranks a Fineli food whose head is the word. Group 1 spans four of today's tiers, so this is wider than today's "first within a tier".
3. **Position**, 0 to 6.
4. **Fineli foods and the user's foods before one-food dishes.**
5. **Recipe uses**, most first, **for basic foods only**. A dish counts as 0 here.
6. Fewer parts in the shown name, then the shorter name, then Finnish alphabetical order, then the id. As today.

A food the recipe file does not know, such as a new food of a later release, an own food or a scanned product, has 0 uses and no recipe count. A new FOOD is basic and sorts after the used foods of its group. A new DISH is a dish, also when it is boiled rice. Own foods and scanned products are basic and lifted by step 2.

### The SQL shape

One query, built in TypeScript as today, every pattern one bound parameter. Shown for the words `jauheliha` and `nauta`. `formsOf("nauta")` answers `naudan` with `compound` true, so it takes `t_gen`. Had the person typed `naudan`, `formsOf` would answer `nauta` with `compound` false, and it would take `t_form`.

```sql
SELECT <summaryColumns>
FROM foods f,
LATERAL (SELECT
  LEAST(t_word(f.search_head, f.search_name, 'jauheliha'), t_word(f.search_head_en, f.search_name_en, 'jauheliha')) AS t1,
  LEAST(t_word(f.search_head, f.search_name, 'nauta'),     t_word(f.search_head_en, f.search_name_en, 'nauta'),
        t_gen(f.search_head, f.search_name, 'naudan'),     t_gen(f.search_head_en, f.search_name_en, 'naudan')) AS t2
) t,
LATERAL (SELECT
  GREATEST(lvl(t1), lvl(t2)) AS s,     -- lvl: 0 for t 0..3, 1 for 4..5, 2 for 6
  LEAST(t1, t2) AS best,
  (f.source = 'fineli' AND f.fineli_type = 'DISH' AND f.fineli_recipe_foods IS DISTINCT FROM 1) AS dish
) k
WHERE <visibleTo(user)> AND f.retired_at IS NULL
  AND f.search_all LIKE '%jauheliha%'
  AND (f.search_all LIKE '%nauta%' OR (f.search_all LIKE '%naudan%' AND ' ' || f.search_all LIKE '% naudan%'))
ORDER BY
  CASE WHEN s = 0 AND NOT dish THEN 0 WHEN s = 0 AND best <= 1 THEN 1 WHEN s = 1 AND NOT dish THEN 2
       WHEN s = 0 THEN 3 WHEN s = 1 THEN 4 WHEN NOT dish THEN 5 ELSE 6 END,                         -- 1 group
  CASE WHEN <isFavourite(user)> THEN 0 WHEN f.source <> 'fineli' THEN 1 ELSE 2 END,                 -- 2 yours
  CASE WHEN s = 0 THEN best WHEN s = 1 THEN CASE WHEN best IN (0, 1, 4) THEN 4 ELSE 5 END ELSE 6 END, -- 3 position
  (f.source = 'fineli' AND f.fineli_type = 'DISH'),                                                 -- 4
  CASE WHEN dish THEN 0 ELSE f.fineli_recipe_uses END DESC,                                         -- 5
  array_length(string_to_array(<display>, ', '), 1), char_length(<display>), <byName(display)>, f.id
LIMIT :limit;
```

`t_word`, `t_form` and `t_gen` are written out as `CASE` expressions by three TypeScript builders, in the manner of today's `tierOf`. They are not database functions, so the migration adds none:

```sql
-- t_word(head, name, w), a typed word: NULL when name NOT LIKE '%w%'
CASE WHEN head = w THEN 0 WHEN head LIKE '%w' THEN 1
     WHEN ' '||name||' ' LIKE '% w %' THEN 2 WHEN name||' ' LIKE '%w %' THEN 3
     WHEN head LIKE 'w%' THEN 4 WHEN ' '||name LIKE '% w%' THEN 5 ELSE 6 END
-- t_form(head, name, f), a form with `compound` false: NULL when ' '||name NOT LIKE '% f%'
CASE WHEN head = f THEN 0 WHEN ' '||name||' ' LIKE '% f %' THEN 2 WHEN head LIKE 'f%' THEN 4 ELSE 5 END
-- t_gen(head, name, g), a form with `compound` true: NULL when ' '||name NOT LIKE '% g%'
CASE WHEN head = g THEN 0 WHEN head LIKE 'g%' THEN 1 WHEN ' '||name||' ' LIKE '% g %' THEN 2 ELSE 3 END
```

The `search_all LIKE '%naudan%'` beside the word-start test is there so the trigram index still serves the `OR`. `LEAST` and `GREATEST` skip NULLs, which the "all but one" query relies on. The prototype in the scratchpad (`search-design/rev_setup.sql`) has no "yours" key, because it ran with no user. The sample above is the rule.

Measured on release 18 after `VACUUM ANALYZE`: "jauheliha 10 nauta" 1.1 ms (bitmap scan on `foods_search_all_trgm`, 140 candidates), "rasva" with 609 matches 3.9 ms, the two-character "vl" 1.1 ms as a sequential scan.

### All but one word

When a search has two words or more and its answer holds fewer rows than `min(limit, NEAR_BELOW)`, with `NEAR_BELOW` 8, a second query answers up to `NEAR_LIMIT` (8) foods that match all words but exactly one. The test is on `min(limit, 8)` so that a caller asking for 5 rows of a search with 100 matches gets no `near` list: five rows back is not "few found".

It is the same query with the `WHERE` conjunction replaced by a count, and the unmatched word's `t` is NULL:

```sql
AND ((<match w1>)::int + (<match w2>)::int + ...) = :n - 1
```

It uses no index and scans the visible catalogue: 2.5 ms on release 18. It orders by the same rule over the words that did match.

| Search             | Full matches | `near`, first rows                                                                                                            |
| ------------------ | ------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| jauheliha 10 nauta | 2            | Jauheliha sika-nauta, naudanpaisti 9 %, naudan 17 %, naudan 7 %, sika-nauta 7 %, then three fried forms. Every row lacks "10" |
| valio rahka        | 5            | The plain quark, its twin, flavoured quarks. Every row lacks "valio"                                                          |
| banaani 120        | 0            | The bananas                                                                                                                   |
| kana riisi         | 7            | Riisi puuroutuva, Riisi pitkäjyväinen, Kana, Riisi tumma, boiled rice. Noise: either word                                     |

> **Assumption:** with two words, "all but one" means either word. The heading says what the list is. Flip: require three words, one constant.

## a) Overview

The Fineli import reads the release's recipe rows and stores two counts on each Fineli food. The search service ranks with them, treats a one-food dish as a basic food, searches a listed genitive for a base form and the reverse, and answers a second short list when few foods hold every word. The web shows that list under a plain heading and offers to add the food when nothing matched or only near matches did. The assistant's `search_foods` answers the same two lists. It ships as two pull requests with one run of the import between them.

## b) Components and responsibilities

| Component                                                                     | Change                                                                                                                      | Owns                                                           | Depends on                                 |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------ |
| `apps/backend/src/db/schema/foods.ts`, migration `0012`                       | Two columns                                                                                                                 | The counts                                                     | Nothing                                    |
| `scripts/fineliImport/readRelease.ts`                                         | Reads `contribfood.csv` when present, and `IGCLASS` from `food.csv`                                                         | `FineliFood.recipeUses`, `recipeFoods`, `Release.recipeSource` | The release folder                         |
| `scripts/fineliImport/recipeCountsR18.ts` (only under outcome b of section h) | The committed counts of release 18                                                                                          | The fallback source                                            | Nothing                                    |
| `scripts/fineliImport/applyRelease.ts`                                        | Writes the two counts, counts them as a change, leaves them alone when there is no source                                   | The upsert                                                     | `readRelease`                              |
| `scripts/fineliImport/report.ts`                                              | Three new lines                                                                                                             | The report                                                     | `applyRelease`                             |
| `services/foodSearchForms.ts` (new)                                           | `SEARCH_FORMS`, `formsOf`                                                                                                   | The pair list                                                  | Nothing                                    |
| `services/foodSearch.ts`                                                      | `searchQuery` rewritten to the rule, `nearQuery` added, `tierOf` replaced by the three builders, `NEAR_BELOW`, `NEAR_LIMIT` | The rule                                                       | `foodRows`, `foodScope`, `foodSearchForms` |
| `services/reads/foods.ts`                                                     | `searchFoods` answers `{ foods, near }`                                                                                     | The decision to run the second query                           | `foodSearch`                               |
| `packages/types/src/foods.ts`                                                 | `FoodSearchResultSchema`, `FoodSearchResult`                                                                                | The shape                                                      | `FoodSummarySchema`                        |
| `routes` for `GET /foods/search`                                              | Sends the new shape                                                                                                         | Nothing new                                                    | The service                                |
| `mcp/tools/foods.ts`, `mcp/appRules.ts`                                       | Description and section 5 reworded                                                                                          | The assistant's text                                           | The service                                |
| `apps/web/src/lib/api/foods.ts`, `foodCache.ts`, `queryOptions.ts`            | The new type. `foodCache` maps and removes rows in `near` as it does in `foods`                                             | The cached search                                              | Types                                      |
| `apps/web/src/components/foods/useFoodFinder.tsx`                             | `Results` shows `near` and the add block                                                                                    | The results view                                               | The above                                  |
| `apps/web/messages/en.json`                                                   | Three new lines                                                                                                             | Copy                                                           | Nothing                                    |

`search_head` and `food_search_head` stay in use. No SQL function changes. `SearchField` and `useScanner` are not touched.

## c) Data model

```ts
// apps/backend/src/db/schema/foods.ts, in the foods table
/** How many of the release's recipes use this food. 0 for a food no recipe uses, and for every food that is not Fineli's. */
fineliRecipeUses: integer("fineli_recipe_uses").notNull().default(0),
/** For a Fineli food with a recipe: its ingredient rows besides water and salt. NULL without a recipe. */
fineliRecipeFoods: integer("fineli_recipe_foods"),
// and
check("foods_fineli_recipe_counts", sql`${t.fineliRecipeUses} >= 0 AND (${t.fineliRecipeFoods} IS NULL OR ${t.fineliRecipeFoods} >= 0)`),
```

Migration `0012_food_recipe_counts.sql`, generated by `db:generate`: two `ADD COLUMN` and the CHECK. No index: both columns are read only in the `ORDER BY` over the matches.

How the import computes them, from `contribfood.csv` (`FOODID` the recipe's food, `CONFDID` the ingredient):

- `recipeUses` of a food: the number of distinct `FOODID` that list it as `CONFDID`. Every recipe in the file counts, also one whose food is left out or "(arc)".
- `recipeFoods` of a food with at least one row as `FOODID`: its rows whose ingredient's `IGCLASS` is neither `WATER` nor `SALT`. An ingredient id missing from `food.csv` counts as a food.

Release 18 gives 2,556 foods with either count, 809 with a use, a highest of 1,081 (iodised salt), and 284 live dishes with exactly one food.

A food no source knows keeps 0 and NULL, and section 4 says how the rule treats it.

> **Assumption:** the stored figure is the count, and "is it one" is decided in the query. A boolean would hide the fact behind a judgement.

## d) API interface

`GET /api/v1/foods/search?q=&limit=`, Bearer, unchanged query. Answers:

```ts
/** `GET /foods/search`. `near` holds foods with all words but one, and is empty unless few foods have them all. */
export const FoodSearchResultSchema = z.object({
  foods: z.array(FoodSummarySchema),
  near: z.array(FoodSummarySchema),
});
export type FoodSearchResult = z.infer<typeof FoodSearchResultSchema>;
```

`near` is always present. It is empty when the query has one word, when `foods` holds `min(limit, 8)` rows or more, or when nothing matches all but one. `limit` bounds `foods` only. A food is never in both. `FoodListSchema` stays for the favourites and own lists.

`search_foods` (MCP) answers the same object. Its description becomes: "Foods whose Finnish or English name holds every word of q, basic foods before dishes, and among basic foods one that more of Fineli's recipes use first. The person's favourites, own foods and scanned products come first among foods that match as strongly. For meats and a few staples, a Finnish base form also finds its genitive and the reverse, such as nauta and naudan. near lists up to 8 foods that hold all words but one, when q has two words or more and fewer than 8 foods hold them all. Each with its source and its figures per 100 g."

## e) Data flow

1. The person types "jauheliha 10 nauta". After 150 ms the web reads `GET /foods/search?q=jauheliha 10 nauta`.
2. `searchWords` normalises in SQL and splits: `jauheliha`, `10`, `nauta`. `formsOf("nauta")` gives `naudan`, `compound` true.
3. `searchQuery` runs. Two foods hold all three.
4. Two is under `min(30, 8)` and there are three words, so `nearQuery` runs, with the two ids left out, and answers eight.
5. The route sends `{ foods: [2], near: [8] }`. The assistant's tool sends the same.
6. The web lists the two, then the heading "All but one of your words" over the eight, then the add block.

A failed second query fails the request as any read does. The two queries run one after the other on one connection, with no transaction: a food changed in between shows at worst in neither list for one answer.

The import: `readRelease` parses `contribfood.csv` into two maps while it reads, `applyRelease` compares the two counts with the stored ones in its change test and writes them in the upsert, in the one transaction it has. With no source of counts, `Release.recipeSource` is null and `applyRelease` neither compares nor writes the two columns.

## f) Frontend architecture

Only `Results` in `useFoodFinder.tsx` changes, so the log sheet and the ingredient picker change together.

| State                     | Shows                                                                                                |
| ------------------------- | ---------------------------------------------------------------------------------------------------- |
| Foods, `near` empty       | The list, as today. No block, whatever the count                                                     |
| Foods, `near` has rows    | The list, the heading "All but one of your words" over the `near` rows, then the block               |
| No foods, `near` has rows | The line "No food has all of “jauheliha 10 nauta”.", the heading and the `near` rows, then the block |
| No foods, no `near`       | "No food matches “…”." and the block, exactly as today                                               |

The block is one button, **Add “…” as your own food** (`foods.sheet.addQuery`), with the handler it has today. It shows only when `near` has rows or nothing matched. A one-word search with one to seven foods, such as "olut" with six beers, shows the list and nothing new.

- **Copy**, new keys under `foods.sheet`: `nearTitle` "All but one of your words", `noneWithAll` "No food has all of “{query}”.", `nearCount` "{count, plural, one {# food has} other {# foods have}} all but one of your words.", read politely after `resultCount`, which counts `foods` only.
- **Rows.** `near` rows are `FoodRow`, pressed like any other. The `near` list is its own `<section aria-label>` with the `sectionTitle` recipe, as the foods heading under a lead already is.
- **Nothing moves.** The list above the heading is the same list as today. The heading and the block come after it, in the same render, because they are one response.
- **Back and focus.** `useSheetNavigation` restores focus by row. A `near` row needs a `data-list` of its own (`results-near`) so Back finds it.
- **Cache.** `foodCache.ts` patches every cached search after a food write. It must patch and drop rows in `near` too, or a renamed or deleted own food stays stale there. `afterBarcodeFound` already marks every search stale.
- **Ingredient picker.** It hands the finder no `lead`, so it shows the same states with no extra heading.

## g) Constraints and decisions

- One query builder serves the route and the tool. The tool computes nothing.
- No language model, no user behaviour, no nutrient in the order.
- Every pattern stays one bound parameter. A normalised word holds only letters and digits, and a unit test checks that `SEARCH_FORMS` holds only normalised words of two characters or more.
- Backend relative imports carry `.js`. Web imports do not.
- Out of scope: typing errors, synonyms, English plurals, a per-screen flag, the scan button, ranking by what the user eats.

### Rejected alternatives

| Alternative                                                                     | Why not                                                                                                                                                                |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FOOD before DISH moved up, nothing else                                         | Fixes "spagetti" and "nauta" only. It is the no-counts state, measured                                                                                                 |
| Rule A, strength first                                                          | Oat flakes 9th, crushed tomatoes 34th                                                                                                                                  |
| Rule B, basic first                                                             | A cheese before the breads for "leipä", the first salad 15th                                                                                                           |
| Recipe uses ordering dishes too                                                 | "Ruisleipä, ruista 51%" 13th for "leipä". The first draft had this                                                                                                     |
| A score that adds weights                                                       | Nobody can say from the doc why one food beat another                                                                                                                  |
| Snowball `finnish_stem`                                                         | Splits nauta from naudan, joins peruna with "peru"                                                                                                                     |
| Trigram fallback for inflection                                                 | Finds no "naudan" for "nauta"                                                                                                                                          |
| A `food_search_forms` table in the database                                     | A join and a migration per row, for 18 constants the query binds as parameters anyway                                                                                  |
| Voikko, a real Finnish analyser                                                 | A native library or a multi-megabyte dictionary in the backend, run on every own-food write and every query, to gain about a dozen forms                               |
| A "basic foods first" flag for the picker                                       | 0.4                                                                                                                                                                    |
| Counts filled by a migration from a committed table, so no import run is needed | Two writers of one column, the migration and the import, which then disagree on the next release. And it commits the table even when the owner's download has the file |
| `PROCESS`, `FUCLASS` or the Fineli id as the commonness signal                  | None separates light milk from goat milk                                                                                                                               |
| Naming the missing word over the `near` list ("Without “10”")                   | See the review table, m3: the service holds only the normalised word                                                                                                   |
| Dropping "10" silently when nothing has it                                      | The person would not learn that Fineli has no such mince                                                                                                               |

### Non-questions

- Fewer parts and shorter names still break ties, and still order every dish.
- The compound rule stays: "Kananmuna" for "muna" before "Munakoiso". So "Porkkana" for "kana" stays.
- The search limit stays 30 by default and 50 at most.
- An own food's name is one name. It has no recipe counts and needs none: step 2 puts it ahead.

## h) Open questions and risks

### The recipe file's source (blocks B1's last detail, not its start)

The orchestrator has asked Artur for the folder listing and the release line. Both outcomes are designed:

| Outcome                                    | What is built                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **(a) `contribfood.csv` is in his folder** | The design as written. The import reads the file from the release folder. Nothing derived is committed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **(b) It is not**                          | **Recommended: commit the derived counts.** `scripts/fineliImport/recipeCountsR18.ts` holds `[fineliId, recipeUses, recipeFoods]` for the 2,556 foods of release 18 that have either, about 40 KB, built once by a small committed script from the mirror's `food.csv` and `contribfood.csv`, with a header that names the release, the source and the credit: THL Fineli, CC BY 4.0, as the fixtures' README does. A TypeScript module, not a CSV, so it ships in the built image with no Docker change. The import reads the folder's `contribfood.csv` when there is one and the committed counts when there is none, and its report says which |

The cost of (b): the counts are release 18's view. A food a later release adds has no count and sorts as section 4 says, and a later recipe change is not seen. Decision 0.5 is the owner's, because it commits data derived from Fineli.

What Artur checks: `ls apps/backend/data/fineli/` shows `contribfood.csv` or does not, and `grep -i -m 3 "release" apps/backend/data/fineli/descript.txt` shows the release number. A rule that needs no file is not an option: it is the no-counts state of section 3.

B1 can start on the columns, the reader and the report before the answer comes. Only the fallback source waits.

> **Assumption:** until Artur answers, B1 is built for outcome (a), with `Release.recipeSource` typed as `"release" | "committed" | null` so (b) is one more branch and one file.

### Between the migration and the import

Decision 0.6: **two pull requests.**

- PR 1 holds the columns, the import and the runbook. It changes no behaviour, because nothing reads the columns.
- Artur runs the import on his local database and sends the report. That report is also the first proof that his release's recipe file reads.
- PR 2 holds the rule, the types, the tool and the web.

The app is not deployed today, so there is no production window to close. The first deploy follows the runbooks, which migrate and then import. What this protects is every existing local database, Artur's first: after PR 1 he re-imports, and PR 2 then lands on a database that has counts. A local database made fresh follows `docs/setup/local-development.md` and the import runbook in that order and has counts from the start. Test databases load the fixture, which carries counts.

The no-counts state stays reachable by anyone who pulls PR 2 onto an old local database without importing. It is pinned by a test (section j), the import runbook says when to run the import again, and `apps/backend/README.md` says it under the search.

### Other questions

| Question                               | Assumption work starts on                                                                                                                       |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Is 8 the right "few found"?            | Yes: about a phone screen of rows. Two constants. It is a screen notion handed to the assistant too, and the tool's description says the number |
| Do the 18 pairs cover a newer release? | Mostly. Measure a candidate with the query below                                                                                                |

The query that measures a candidate pair. It counts the foods a genitive would add at a word start that its base does not reach:

```sql
SELECT count(*) FROM foods
WHERE source = 'fineli' AND retired_at IS NULL
  AND ' ' || search_name LIKE '% ' || :genitive || '%' AND search_name NOT LIKE '%' || :base || '%';
```

It answers 149 for nauta and naudan, 16 for vuohi and vuohen. It does not find candidates. The first draft offered a query for that, which looked at whole words and so could not find "vuohen" or "hirven", which occur only inside compounds. That claim is withdrawn: the list grows when someone notices a word.

> **Risk:** a re-import of the same release reports about 2,550 foods "changed", once. The report says why. The rename and retire guards are unaffected, because neither counts a changed count.

> **Risk:** `apps/web/messages/en.json` and `useFoodFinder.tsx` are edited by most frontend work. Rebase before the frontend slice, and do not refactor across files.

> **Risk:** the two-character scan and the `near` scan read every visible food. Both grow with kept Open Food Facts products, which a user sees only after their own lookup, so the growth is per user.

**Hand-over to Artur.**

Before PR 1 is finished:

1. Send the output of `ls apps/backend/data/fineli/` and `grep -i -m 3 "release" apps/backend/data/fineli/descript.txt`.

After PR 1 merges:

2. `pnpm install`, `pnpm --filter @hovimestari/types build`, `pnpm --filter @hovimestari/backend db:migrate`.
3. `pnpm --filter @hovimestari/backend fineli:import --dry-run`. The report should say where the recipe counts come from, "Recipe rows read" with a number near 10,800 on release 18, and about 2,550 foods changed, none renamed, none retired. On a newer release the numbers differ. Send the report.
4. `pnpm --filter @hovimestari/backend fineli:import`, then once more. The second run changes nothing.
5. If the report says the folder has no recipe file and no committed counts were used, stop and say so. Downloading again does not help when Fineli's zip never held the file.

After PR 2 merges:

6. On the phone, search "spagetti", "maito", "rahka", "nauta" and "jauheliha 10 nauta". Expect the dry pasta, light milk, plain quark, the beef cuts, and the "All but one of your words" list.
7. When the app is first deployed, the Fly runbook's import step puts `contribfood.csv` beside the other files, under outcome (a).

Not verified here: the current release's file names and whether its recipe file has the same columns. The import stops and names what it did not find.

## i) Docs

| Doc                                                  | Change                                                                                                                                                                                                                                                                                                                                                             | PR   |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---- |
| `docs/setup/fineli-import.md`                        | Step 2's listing and step 8's `put` lines gain `contribfood.csv` under outcome (a). Step 6 gains the report lines. A short section: run the import again after an update that changes what it reads                                                                                                                                                                | 1    |
| `docs/features/foods.md`                             | "The Fineli import" and "The import in code": the recipe file and the two counts. "Data": the two columns                                                                                                                                                                                                                                                          | 1    |
| `docs/features/foods.md`                             | "Searching for a food": the matching with word forms "for meats and a few staples", the rule's steps in plain words, what a basic food is, that the user's own foods lead, the "all but one" list, and the honest limits (the flatbread, "kana", dishes needing their name, English). "The search rule in code", "API", "Known gaps". No requirement id reaches it | 2    |
| `apps/backend/src/mcp/appRules.ts`                   | Section 5's sentence on `search_foods`, and the new hash of `foods.md` in `APP_RULES_SOURCES`. Re-stamped in each PR that changes `foods.md`                                                                                                                                                                                                                       | 1, 2 |
| `docs/app/log-sheet.md`                              | The search view's states: the "All but one of your words" list and when the add button shows                                                                                                                                                                                                                                                                       | 2    |
| `docs/app/recipes.md`                                | One sentence under adding an ingredient, if it restates the empty state. It should link, not restate                                                                                                                                                                                                                                                               | 2    |
| `docs/features/connected-ai.md`                      | Only if it lists what `search_foods` answers                                                                                                                                                                                                                                                                                                                       | 2    |
| `docs/features.md`                                   | The Foods line: "one search that finds a food by any part of its name, puts basic and common foods first, and for meats and a few staples finds the Finnish genitive"                                                                                                                                                                                              | 2    |
| `docs/design/link-map.md`                            | New rows: "basic food, one-food dish, recipe uses" and "word forms in search", both homed at `features/foods.md#searching-for-a-food`. No new heading                                                                                                                                                                                                              | 2    |
| `apps/backend/README.md`, `packages/types/README.md` | The new files and the new schema, one line each. The note on a database without counts                                                                                                                                                                                                                                                                             | 1, 2 |
| `TODO.md`                                            | PR 2 deletes "Revisit the search ranking for common one-word searches" and rewords the first-import item's pinned searches. The items this design filed stay                                                                                                                                                                                                       | 2    |

## j) Implementation plan

Two pull requests, each on its own branch cut from master, each through the full chain. Each agent logs to `logs.txt` before and after.

**PR 1, `feat/fineli-recipe-counts`.** No behaviour change.

| Step | Agent                                         | Work                                                                                                                                                 | Files                                                                                                                                                                                                                                                                                                                                                                     |
| ---- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1   | backend-engineer                              | The two columns, the migration, the import reading and writing the counts, the report lines, the runbook, the feature doc's import and data sections | `db/schema/foods.ts`, `drizzle/migrations/0012_*`, `scripts/fineliImport/{readRelease,applyRelease,report}.ts`, `recipeCountsR18.ts` and its build script under outcome (b), their tests and fixtures (`release-a` and `release-b` gain a `contribfood.csv`, `release-utf8` has none), `docs/setup/fineli-import.md`, `docs/features/foods.md`, `mcp/appRules.ts` (stamp) |
|      | validator, reviewer, documentation-specialist | Not user-visible                                                                                                                                     |                                                                                                                                                                                                                                                                                                                                                                           |

Then Artur runs the import (hand-over steps 2 to 5).

**PR 2, `fix/food-search-ranking`**, rebased onto master after PR 1. This branch holds the design and becomes PR 2.

| Step | Agent                             | Work                                                                                                                                          | Files                                                                                                                                                                                                                                             |
| ---- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B2   | backend-engineer                  | The pair list, the rule, the `near` query, the type, the route, the tool, `appRules`, `foods.md`, `features.md`, link map, READMEs, `TODO.md` | `services/{foodSearch,foodSearchForms}.ts`, `services/reads/foods.ts`, `packages/types/src/foods.ts`, `routes`, `mcp/tools/foods.ts`, `mcp/appRules.ts`, `scripts/mcpSmoke/checks.ts`, `services/__tests__/foodSearch.db.test.ts` and its fixture |
|      | validator, reviewer               | After B2                                                                                                                                      |                                                                                                                                                                                                                                                   |
| F1   | frontend-engineer                 | The type through the API client and cache, `Results`, the block, copy, `log-sheet.md`                                                         | `apps/web/src/lib/{api/foods,foodCache,queryOptions}.ts`, `components/foods/useFoodFinder.tsx`, `messages/en.json`, their tests                                                                                                                   |
|      | validator, ui-validator, reviewer | After F1. User-visible: both themes, 320 to 1280 wide, and on a phone                                                                         |                                                                                                                                                                                                                                                   |
|      | documentation-specialist          | After the reviewer passes                                                                                                                     |                                                                                                                                                                                                                                                   |

B2 reads only columns PR 1 merged. F1 depends on B2's type and is in the same PR, because the web's type must compile.

### Tests that pin it

**Fixture.** `fixtures/fineli-names-r18.csv` gains two columns, `recipe_uses` and `recipe_foods`, with the real counts from release 18's `contribfood.csv`. It is rebuilt as: for each pinned search, its first 40 on the full release under the new rule, plus the witnesses named below. Real names and types, invented nutrient values, credited as today.

**`foodSearch.db.test.ts`, on a real Postgres.** The owner's own examples are the invariants:

- "spagetti": the first three are "Pasta, spagetti, makaroni" and its two gluten-free kinds. No name holding "valmisateria" is in the first 8. Negative: "Spagettilihavuoka" is never above "Pasta, spagetti, makaroni".
- "jauheliha 10 nauta": `foods` is exactly the pork and beef mince at 10 % and its fried form. `near` starts with "Jauheliha, sika-nauta", "Jauheliha, naudanpaisti, rasvaa 9 %", "Jauheliha, naudan, rasvaa 17 %", "Jauheliha, naudan, vähärasvainen, rasvaa 7 %". No food is in both lists.
- "nauta": "Naudanpaisti" first, and each of the first 8 begins "Naud". "naudan": "Jauheliha, naudan, rasvaa 17 %" in the first 3. "jauheliha nauta": the mixed mince, then the beef minces at 9 %, 17 % and 7 %, before any fried form. "sika" puts "Sianliha, keskiarvo" in the first 3. "lammas" puts the two "Lampaanliha" foods first. "hirvi" puts "Hirvenliha" first. "kanan" puts "Kana" first. "perunan" puts "Peruna, vanha, kuorittu" first. "kana" never puts a "Kananmuna" in the first 8.
- "härän" answers "Häränlihahöystö" and no food holding "härkäpapu". "härkä" answers no "Härän…" food. That pins the dropped pair.
- A form must start a word: "sika" never answers a food whose only "sian" is inside an English word. The fixture holds one of the two real ones.
- "naut" answers no "naudan" food that lacks "naut".
- "rahka": plain quark under 0.5 % first, its low-lactose twin second. "maito": kevytmaito, rasvaton, täysmaito, in that order, and goat milk not in the first 8. "egg": "Kananmuna, kuoreton" first, the quail egg after every hen's egg FOOD. "rice": "Riisi puuroutuva" first, rice chocolate not in the first 8. "omena": the average apple first, dried apple 4th. "peruna": "Peruna, vanha, kuorittu" first, "Peruna, kuorittu, keitetty, suolaton" in the first 8.
- "kaura": "Kaurahiutale" in the first 3. "muna": "Kananmuna, kuoreton" first and "Munakoiso" after every "Kananmuna". "kana": "Kana" first, "Porkkana" 4th, pinned as the known limit.
- A one-food dish is basic: "kana" puts "Kana, keitetty, suolaa" before "Porkkana". With its `recipe_foods` set to 2 in a copy of the row, it falls behind.
- Recipe uses never order dishes: "leipä" puts "Ruisleipä, ruista 51%" 2nd, before "Paahtoleipä, vehnä, vesi", which seven recipes use. With the step applied to dishes the toast would lead. "ruisleipä" puts the 51 % rye first.
- Accepted limits, pinned so a later change shows: "leipä" first row is "Sekaleipä, nyrkkirieska, ohra, kotitekoinen". "mysli" first row is the yoghurt with muesli, and "Mysli, perus" is 2nd.
- One English dish word: "soup" by English names puts a meal-replacement soup powder first and the first "Peasoup" after them, within the first 20.
- Group order, on real rows for "kaura": a basic strong match, then a dish whose head is the word, then "Kaurahiutale", then a dish holding "kaura" later.
- **Yours before position**: an own food "Oma maitorahka" and a Fineli "Rahka, maitorahka, maustamaton, rasvaa <0,5 %" both match "rahka" in group 1. The own food is first. The same with a favourite Fineli food whose match is a later word, and with a scanned product that has its `food_lookups` row. None of the three outranks a food of a better group. Another user's scanned product never appears.
- **The no-counts state**: with every count set to 0 and NULL in a copy of the fixture, "spagetti" still puts the dry pasta first, "maito" puts goat milk first, and "kana" has no boiled chicken in its first six. The test's name says this is a database that has not been imported since the counts came.
- `near`: empty for one word, empty when `min(limit, 8)` rows or more came back, at most 8, ordered by the rule, never a retired food, never another user's food. **With `limit=5` on a search that matches more than five, `near` is empty.** With `limit=5` on a two-word search that matches three, `near` has rows.
- Empty input: `%`, `_`, `-`, `a` and `%%` answer `{ foods: [], near: [] }`.
- Plan: at 10,000 rows after `VACUUM ANALYZE`, `EXPLAIN` for "rah" and for "nauta" (a word with a form) shows `foods_search_all_trgm`. No new test reads a clock.

**`foodSearchForms.test.ts`.** Every member is normalised and two characters or more. `formsOf` answers both directions, marks a changed-stem genitive reached from its base and no other, and answers nothing for a prefix or for "harka".

**Import tests.** `release-a` with a recipe file: the counts land, water and salt are left out of `recipeFoods`, an ingredient id missing from `food.csv` counts. The same release twice changes nothing. `release-b` changes one count and the food is reported changed, not renamed. A folder without the file leaves stored counts as they were and prints the line. A recipe file without `CONFDID` stops with a `ReleaseError` naming the column. Under outcome (b): a folder without the file takes the committed counts and the report says so, and a folder with the file ignores them.

**Route and tool.** Supertest on `GET /foods/search` for the shape. The MCP smoke check and the tool test for `near`. `appRules.test.ts` passes after the re-stamp.

**Web.** `Results` in each of the four states of section f, by role and name, with the real catalogue. A one-word search with six foods shows no block. The `near` rows open a food. Across states: the first `foods` row is at the same offset with and without `near` under it. `foodCache`: a renamed own food is renamed in `near`, a deleted one leaves it. The catalogue tests pass with the new keys reached.

## Review round 1: findings answered

| Finding                                        | Answer                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| B1, the recipe file's source                   | **Fixed.** Section 3 says where the file was and was not seen. Section h has both outcomes, the recommendation for (b), what the owner checks, and hand-over step 5 no longer says "download again"                                                                                                                                                                                                                                                                            |
| B2, the window without counts                  | **Fixed by two pull requests** (0.6, sections h and j). The state is measured in section 3 and pinned by a test. What it means with nothing deployed is in section h                                                                                                                                                                                                                                                                                                           |
| M1, recipe uses on dishes                      | **Applied.** Step 5 is `CASE WHEN dish THEN 0 ELSE uses END`. Evidence re-run: "leipä" has the 51 % rye 2nd, "ruisleipä", "pulla" and "muro" keep today's order                                                                                                                                                                                                                                                                                                                |
| M2, evidence weighted to ingredients           | **Applied.** 25 log sheet searches added to the evidence, the drop-outs and English losses are named in section 3 and in the owner's summary, and 0.4 and 0.9 give the measured reason. One rule stands                                                                                                                                                                                                                                                                        |
| M3, standing before position                   | **Stated** in the owner's decision 1, in 0.1, in step 2 of the rule and in the tool's description, with three tests. The first draft's "as today" for favourites was wrong                                                                                                                                                                                                                                                                                                     |
| M4, the scan button                            | **Applied.** Not in this change (0.3), filed in `TODO.md`. The block shows only when `near` has rows or nothing matched                                                                                                                                                                                                                                                                                                                                                        |
| m1, the "härän" pair                           | **Dropped.** Tests pin it                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| m1, piirakan, salaatin, täytekakun, kananpojan | **Explained** in section 3, left out                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| m1, the promise's wording                      | **Narrowed** to "for meats and a few staples" in the summary, the tool's description and the catalogue line                                                                                                                                                                                                                                                                                                                                                                    |
| m1, the check query                            | **Withdrawn and replaced** by a query that measures a candidate (section h)                                                                                                                                                                                                                                                                                                                                                                                                    |
| m2, the SQL sample                             | **Fixed.** `t_gen` is in the sample, with the sentence on how `compound` picks the builder, and the "yours" key is marked                                                                                                                                                                                                                                                                                                                                                      |
| m3, the `near` trigger                         | **Fixed**: `rows.length < min(limit, NEAR_BELOW)`, with two tests                                                                                                                                                                                                                                                                                                                                                                                                              |
| m3, naming the missing word                    | **Not applied, and here is why.** The service holds only the normalised word, so it would show "oljy" for "öljy". Mapping back to what was typed needs a tokeniser in TypeScript that mirrors the SQL normalisation, which `targets-and-foods.md` (section g, decision 7) rules out so that the two can never disagree. The web cannot do it either without the same copy. For the owner's case every row visibly lacks "10 %". Worth its own look if the list confuses in use |
| m4, dishes without a recipe row                | **Stated** under the terms in section 4                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| m5, tests                                      | **Added**: no-counts, "härän", own food against a head match, `near` under a limit, the "leipä" and "mysli" limits, an English dish word. The clock test is dropped                                                                                                                                                                                                                                                                                                            |
| m6, section 0                                  | **Rebuilt.** Rows for the counts' source, the two pull requests, the `near` list, form matches ranking alike and the dishes that drop out. The three "file separately" rows are a line under the table. The owner's summary carries the decisions in plain words                                                                                                                                                                                                               |
| Nits                                           | 4,023 live foods, 1,968 recipes of which 33 are of foods typed FOOD, 284 live one-food dishes. Requirement ids stay out of `foods.md` (section i)                                                                                                                                                                                                                                                                                                                              |

Nothing else in the review is disputed.

## Resolved defaults (orchestrator, 2026-11-24, owner may veto)

- One rule for both screens and the assistant. No flag.
- Group, then yours, then position: own foods, scanned products and favourites lead their group (0.1).
- Fineli foods before one-food dishes at the same position (0.2).
- Recipe uses order basic foods only.
- No scan button, no spelling fallback, no synonyms, no English plurals in this change.
- The pair list lives in TypeScript, 18 pairs, exact-word trigger, forms must start a word. No "härän" pair.
- A changed-stem genitive at the start of a compound counts like a compound's end, when reached from its base.
- A direct match and a form match rank alike (0.8).
- `near` needs two words and fewer than `min(limit, 8)` rows, and answers at most 8. It does not name the missing word.
- The add block shows only when `near` has rows or nothing matched.
- Two pull requests, with the import run between them (0.6).
- Under outcome (b), the counts of release 18 are committed as a TypeScript module and the import prefers the folder's file (0.5).
- The stored figures are counts, and "one food" is decided in the query.
- The scratch database `hovi_search_design` is dropped. The prototype is in the session scratchpad under `search-design/` (`rev_setup.sql`, `rev_evidence.sql`).
