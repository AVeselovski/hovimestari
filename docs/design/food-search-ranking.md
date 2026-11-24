# Design: food search that finds the ordinary ingredient first

Branch `fix/food-search-ranking`, cut from master 4b48c6f. Written 2026-11-24. Every figure here was measured on Fineli release 18 (4,050 live foods: 1,430 FOOD, 2,620 DISH) in a scratch Postgres, with the rule as built and the proposal run side by side. The before and after tables for 66 searches are in [food-search-ranking-evidence.md](food-search-ranking-evidence.md).

## Summary for the owner

**Build it. No requirement changes.** Four changes, one rule for the log sheet, the ingredient picker and the assistant:

1. **Search knows which foods are basic and which are common, from Fineli's own recipes.** A Fineli release holds a file the import has never read, `contribfood.csv`: the ingredients of 1,968 Fineli dishes. Two plain counts come out of it. How many Fineli recipes use a food: light milk 296, goat milk 0, the shelled egg 395, the quail egg 0, plain quark 16, every flavoured quark 0. And how many foods a dish is made of: boiled potato is one food, a spaghetti casserole is eight. Search ranks by these. Nothing in it is the app's opinion, and nothing says what to eat.
2. **A basic food comes before a dish.** A basic food is a Fineli food, or a "dish" that is one food cooked, such as boiled rice. "spagetti" now starts with the three dry pastas and then boiled spaghetti. The ready meals are gone from the first screen.
3. **Nineteen Finnish word pairs.** "nauta" also finds "naudan", "sika" finds "sian", "lammas" finds "lampaan", and the other way round. "nauta" now lists the beef cuts, "Naudanpaisti" first. Today it lists only the pork and beef minces. A stemmer was measured and is wrong for Finnish food words. On the whole catalogue only about a dozen such forms occur, nearly all of them animals.
4. **When little is found, the sheet shows what has all but one of the words, and offers to add the food or scan it.** "jauheliha 10 nauta" finds the one mince at 10 % (pork and beef), then lists the beef minces at 9 %, 17 % and 7 % under "All but one of your words". Fineli has no beef mince at 10 %.

Search stays as fast as it is: 1 to 4 ms in the database for the widest searches.

**What gets worse**, said plainly: "leipä" starts with an odd home-made flatbread and the plain rye bread drops from 1st to 13th, because Fineli types every bread as a dish. "chicken" puts chicken strips first and "Kana" 4th. "kana" still shows carrots from 4th. A dish that shares its first word with many basic foods, such as a chicken dish under "broileri", comes after all of them. Section 3 has the full list.

**You must run the Fineli import once more** after the deploy, with the same release, so the two counts are filled. Until then search works and ranks by name shape only.

## 0. Product decisions the owner may want to shelve

The design assumes each recommendation. Each flip is local.

| #   | The fork                                                                                                                                                                      | Recommendation and why                                                                                                                                                                                                              | If the other branch is picked                                                                                                                                                    |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.1 | A dry food and its cooked form match equally ("Pasta, spagetti, makaroni" and "Pasta, spagetti, keitetty, suolaa"). Dry and raw first, or mixed by how many recipes use each? | **Fineli foods first, then the cooked forms.** The complaint came from building recipes, where the dry weight is wanted. The cooked forms still land 4th to 7th, on the first screen                                                | Swap two keys of the ORDER BY (step 5 and step 6 of the rule). Boiled spaghetti (7 recipes) then comes before dry pasta (5), and boiled rice 2nd for "riisi". Re-pin three tests |
| 0.2 | Should the ingredient picker search differently from the log sheet?                                                                                                           | **No. One rule.** With the two counts, both screens get the raw food first and the cooked form on the first screen. A flag would be a second rule to test, document and give the assistant, for no measured gain                    | Add `basicFirst` to the route and to `search_foods`. It would drop group 2 (dishes named by the word) below group 3. Not designed here                                           |
| 0.3 | Products the user scanned from Open Food Facts rank after every Fineli dish today. Rank them with the user's own foods?                                                       | **Yes.** A scanned product is in the catalogue only because this user looked it up. Today a scanned milk sits under some 40 Fineli milks and dishes and can fall outside the 30 results. Nobody asked for this, so it is called out | One line: the "yours" step counts own foods only. Scanned products then rank with Fineli's foods, by step 5 on                                                                   |
| 0.4 | Favourites: first within their group of matches (as today), or first of all matches?                                                                                          | **As today, within the group.** No evidence either way, and it was not asked for                                                                                                                                                    | Move one ORDER BY key up. A favourite carrot would then top "kana"                                                                                                               |
| 0.5 | Typing errors ("spageti", "jogurti"). Add a spelling fallback with trigrams when nothing matches?                                                                             | **Shelve, file separately.** It finds "spagetti" for "spageti", but "chia" finds 192 chicken dishes and "kanamuna" finds a chicken stew pancake. It is a different problem from the one reported                                    | A fallback query only when both lists are empty, for words of five letters or more. Its own design                                                                               |
| 0.6 | The scan button in the "little found" block is a second way to open the scanner                                                                                               | **Build it.** The field's camera button is hidden once text is typed, and this block shows only when text is typed, so one scan control is on screen at a time. Scanning the pack is the real answer for a shop's own mince         | Drop the button. The block keeps **Add as your own food**                                                                                                                        |
| 0.7 | Out of scope, file separately: English plurals. "eggs" finds nothing where "egg" finds the egg. Fineli's English names are singular                                           | **File separately** in `TODO.md`. The pair list could carry English pairs, but no one reported it                                                                                                                                   | Add rows to the pair list                                                                                                                                                        |
| 0.8 | Out of scope, file separately: "kana" finds little chicken because Fineli calls it "Broileri"                                                                                 | **File separately.** It is a synonym, not an inflection. A synonym list is a larger promise than a list of word forms                                                                                                               | A second, separate list                                                                                                                                                          |

## 1. Requirements validation

**Verdict: aligned.** No wording in `docs/requirements.md` needs to change.

| Requirement                                                                  | How the design meets it                                                                                                                                                                     |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-FOOD-03, search by name in Finnish and in English, matching partial words | Unchanged matching, plus the listed word forms. Both names still match whatever the language setting                                                                                        |
| FR-FOOD-02, Fineli foods for every user                                      | The import reads one more file of the same release                                                                                                                                          |
| FR-SCAN-04, a kept product is found by the next search                       | Unchanged, and decision 0.3 ranks it where the user sees it                                                                                                                                 |
| FR-AI-06, NFR-AI-03, the assistant gets the catalogue search                 | `search_foods` calls the same service and answers the same two lists                                                                                                                        |
| NFR-PERF-01, search feels instant                                            | Measured: 1.1 ms for three words, 3.9 ms for the widest one-word search (609 matches), 2.5 ms for the "all but one" scan                                                                    |
| No advice (product rule)                                                     | The order comes from name shape and from two counts of Fineli's own recipe rows. No nutrient, no target and no user behaviour enters it. The copy states what matched, never what to choose |

**The problem, stripped of the proposed mechanism:** a person typing the ordinary name of an ordinary ingredient should see it in the first rows, in its base form or an inflected one, and should learn at once when the catalogue does not hold it. The brief proposed mechanisms to consider, not to deliver. Each was measured. "Fineli's type earlier in the rule" alone is not enough (section 3), and a per-screen flag is rejected (0.2).

**Changes proposed that were not asked for:** 0.3 (scanned products rank with own foods), the `near` list on the API, and reading `contribfood.csv`. Each is in section h.

**Requirements drift:** none found.

## 2. The rule as it is, and why it fails

`searchQuery` in `apps/backend/src/services/foodSearch.ts` orders by: (1) how the **first** typed word meets the **first word** of a name, in six tiers, (2) favourite, own, rest, (3) Fineli FOOD, DISH, other, (4) fewer parts, (5) shorter name, alphabetical.

| Search             | What happens                                                         | Cause                                                                                                                             |
| ------------------ | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| spagetti           | Five dishes and a sauce powder, then "Pasta, spagetti, makaroni" 6th | Step 1 only looks at the first word. "Spagetti ja jauhelihakastike" has it there, the plain pasta has it second. Type comes after |
| jauheliha 10 nauta | Only the pork and beef mince                                         | "nauta" is not part of "naudan". Nothing bridges the stem. And nothing says the 10 % beef mince does not exist                    |
| rahka              | Plain quark 8th                                                      | Within one tier and type, only parts and length decide. "Rahka, maustettu, rasvaa 4 %" is shorter                                 |
| maito              | Goat milk 1st, light milk 6th                                        | Same. "Maito, kutunmaito, vuohenmaito" is the shortest three-part milk                                                            |
| egg                | Quail egg 1st                                                        | Same, by the English name                                                                                                         |
| rice               | Rice chocolate 2nd                                                   | Same                                                                                                                              |
| omena              | Dried apple 1st                                                      | Same                                                                                                                              |
| peruna             | "Peruna, uusi" 1st, the common potato 4th, boiled potato 12th        | Same, and boiled potato is typed DISH                                                                                             |
| kaura              | Pulled oats 1st                                                      | "Nyhtökaura" ends with the word, "Kaurahiutale" only starts with it                                                               |
| kana               | Carrot 4th                                                           | "Porkkana" ends with "kana". No rule can tell without knowing the words                                                           |

The earlier design (`targets-and-foods.md`, section g, decision 6) said nothing in the data tells the plain variant from the others. That was true of the five files the import reads. It is not true of the release.

## 3. Options and evidence

### What the release holds that the import does not keep

| Field                                                        | What it says                                                                                                                                          | Verdict                                                  |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `contribfood.csv` (10,797 rows: dish, ingredient food, mass) | Which foods Fineli's 1,968 recipes are made of. 809 foods are used at least once (580 FOOD, 229 DISH). 285 dishes are one food besides water and salt | **Use.** Two counts per food                             |
| `food.csv` `IGCLASS`, the ingredient class                   | Every DISH is `NONINGR`, so it repeats the type. For FOOD it gives the kind (MILK, BEEF). It also marks water (`WATER`) and salt (`SALT`)             | Use only to leave water and salt out of the second count |
| `food.csv` `PROCESS` (RAW, IND, BOIL, ...)                   | Milk and quark are IND like every branded product. It does not separate plain from flavoured                                                          | Not used                                                 |
| `food.csv` `FUCLASS`, the use class                          | Separates plain quark (`SMILK`) from flavoured (`MILKPUDD`), but not light milk from goat milk, and it would need a hand-kept order of classes        | Not used                                                 |
| Fineli id                                                    | Older foods have lower ids, but goat milk (604) is older than light milk (684)                                                                        | Not used                                                 |

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

### Candidate rules

All were run on the full catalogue. The rank of a target food under each:

| Search, target                                                | As built | A   | B   | **E (proposed)** |
| ------------------------------------------------------------- | -------- | --- | --- | ---------------- |
| spagetti, Pasta, spagetti, makaroni                           | 6        | 1   | 1   | **1**            |
| rahka, plain quark                                            | 8        | 1   | 1   | **1**            |
| maito, kevytmaito                                             | 6        | 1   | 1   | **1**            |
| egg, Kananmuna, kuoreton                                      | 2        | 1   | 1   | **1**            |
| rice, Riisi puuroutuva                                        | 8        | 1   | 1   | **1**            |
| peruna, Peruna, vanha, kuorittu                               | 4        | 1   | 1   | **1**            |
| peruna, boiled potato                                         | 12       | 6   | 6   | **6**            |
| kaura, Kaurahiutale                                           | 2        | 9   | 2   | **2**            |
| tomaatti, Tomaattimurska                                      | 5        | 34  | 6   | **7**            |
| kana, Kananmuna, kuoreton (unwanted)                          | 11       | 82  | 13  | **16**           |
| leipä, first bread named "…leipä" that is not a one-food dish | 1        | 2   | 4   | **2**            |
| salaatti, first many-food dish named "Salaatti, …"            | 3        | 8   | 15  | **8**            |

- **A**: match strength (whole word or compound end, then word start, then inside), then basic before dish, then position, then recipe uses. It buries a basic food whose word only starts with the search under every dish that holds the word: oat flakes 9th for "kaura", crushed tomatoes 34th.
- **B**: basic before dish first, then position, then uses. It buries a dish named by the word under every basic food that merely starts with it: a cheese ("Juusto, leipäjuusto") before the breads for "leipä", and the first salad 15th where E has it 8th. Of 109 common first words of dishes, 17 put their first dish off the first screen.
- **E**: seven ordered groups that interleave the two (section 4). 14 of 109, and the rest of the table as good as the better of A and B.

The ranks under A and B, and the 17 and 14, were measured while the candidates still read a name's first word with hyphens split. The proposed rule keeps hyphens, as today's head does, which moves a few hyphenated names ("Kaura-ruispuuro") and none of the rows above.

"Fineli's type earlier in the rule" on its own, with no counts, was the first thing tried: it fixes "spagetti" and nothing else in the table, because within one type the order is still parts and length.

### Finnish inflection

| Option                                             | Measured                                                                                                                                                                                                | What it wrongly matches                                                                                                         | Verdict                                                                          |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Postgres's Snowball stemmer, `finnish_stem`        | nauta gives "nauta", naudan gives "nauda". sika and sian stay apart. lammas and "lamp". peruna becomes "peru", perunan "perun". porkkana becomes "pork"                                                 | It joins none of the asked pairs but kana and kanan, and it would join "peruna" with Peru and "porkkana" with pork              | Rejected. The established library is wrong for this language's consonant changes |
| Trigram similarity (`<%`, threshold 0.6)           | "nauta" finds 73 names, all holding "nauta". No "naudan". "lammas" finds 3                                                                                                                              | "chia" finds 192 chicken dishes. "kanamuna" finds a chicken stew pancake, not the egg                                           | Rejected for inflection. Shelved for typing errors (0.5)                         |
| Matching on a cut stem ("nau…")                    | "nau" also starts "nauris" (turnip). "si…" for sika starts hundreds                                                                                                                                     | Everything sharing three letters                                                                                                | Rejected                                                                         |
| General consonant rules (tt to t, kk to k, t to d) | Would cover the pairs                                                                                                                                                                                   | "kurkku" becomes "kurku" and finds "Kurkuma" (turmeric)                                                                         | Rejected: unpredictable for a gain the data does not show                        |
| The English name as a bridge                       | "nauta" is in no English name. It would need a second search through the matches' English words                                                                                                         | Whatever shares an English word                                                                                                 | Rejected                                                                         |
| **A short list of word pairs**                     | Of 100 candidate nouns, an inflected stem that the base form does not reach occurs for 16. By foods gained: naudan 149, sian 44, piirakan 33, porsaan 19, lampaan 18, salaatin 16, vuohen 16, hirven 13 | Nothing, when a listed form must start a word. Without that, "sian" matches "Rus**sian**" in two English names, both fish soups | **Chosen**                                                                       |

Regular genitives need no help in one direction: "kana" is already part of "kanan". They need it in the other, "kanan" to "Kana", so five regular pairs are listed too.

> **Assumption:** a hand-kept list is a deliberate exception to "prefer a library" and to the earlier refusal of word lists. It holds facts of grammar, not ranking preferences, it is 19 rows, and each row is justified by names in the catalogue. Who maintains it in two years: whoever runs an import. Section h has the query that finds missing rows on a new release.

### Where the proposal is worse than today

| Search                                                            | Today                                     | Proposed                                                                                         | Why                                                                                                                                             |
| ----------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| leipä                                                             | "Ruisleipä, ruista 51%" 1st               | "Sekaleipä, nyrkkirieska, ohra, kotitekoinen" 1st, then breads by recipe use. The rye bread 13th | Every bread is a DISH. One home-made flatbread has a one-food recipe and counts as basic. The rest order by a count that means little for bread |
| ruisleipä                                                         | "Ruisleipä, ruista 51%" 1st               | 3rd                                                                                              | Two rye breads are used in a recipe or two                                                                                                      |
| chicken                                                           | "Kana" 1st                                | "Broilerisuikale" 1st, "Kana" 4th                                                                | By English name all are "Chicken …", and strips are in 28 recipes against 8                                                                     |
| naudan jauheliha                                                  | "Jauheliha, naudan, rasvaa 17 %" 1st      | Pork and beef mince 1st, the beef mince 2nd                                                      | "naudan" now also means "nauta", and the mixed mince is in more recipes                                                                         |
| nauta                                                             | Pork and beef mince 1st                   | Eight beef cuts, "Naudanpaisti" first. The minces come after about 20 names that begin "Naudan…" | Wanted for the cuts. "jauheliha nauta" lists the minces                                                                                         |
| lampaan                                                           | "Lampaanpaisti" 1st                       | Lamb mince 1st, "Lampaanliha" 3rd, "Lampaanpaisti" 5th                                           | Typed as the genitive, a whole word ("lampaan") outranks the start of a compound. Typed "lammas", the three lamb cuts come first                |
| tomaatti                                                          | Crushed tomatoes 5th                      | 7th. A meal-replacement soup powder is 4th                                                       | The powder is a FOOD whose name holds the word alone                                                                                            |
| sika                                                              | Pork and beef mince 1st                   | "Sian selkäsilava" (back fat) 1st                                                                | Its name begins with the word                                                                                                                   |
| kana                                                              | Carrot 4th                                | Carrot 4th, and four more carrots after it                                                       | Unchanged in kind. Boiled carrot is now basic too                                                                                               |
| Dishes under a busy word (broileri, kala, pasta, liha, jauheliha) | First dish in the first ten               | First many-food dish at 20th to 41st                                                             | Wanted: basic foods first. Typing a second word finds the dish                                                                                  |
| Cooked forms under 0.1                                            | "Riisi, keitetty, suolaa" 4th for "riisi" | 4th. For "rice", 24th                                                                            | The English name "Rice, boiled" shares its group with every basic rice food and comes after them                                                |

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
  ["harka", "haran"],
  ["ruis", "rukiin"],
  ["rapu", "ravun"],
  ["auringonkukka", "auringonkukan"],
  ["kana", "kanan"],
  ["broileri", "broilerin"],
  ["kalkkuna", "kalkkunan"],
  ["poro", "poron"],
  ["peruna", "perunan"],
  ["lohi", "lohen"],
  ["maito", "maidon"],
  ["leipa", "leivan"],
];
/** The other member of every pair `word` is in, each marked when it is a changed-stem genitive reached from its base. */
export function formsOf(word: string): { form: string; compound: boolean }[];
```

A form applies only when the typed word **equals** a member. "naut" has no forms.

A pair whose genitive does not begin with its base has a **changed stem**: "naudan", "sian", "lampaan", and 11 more of the 19. The other five ("kanan", "perunan") are regular.

### Ranking, first difference wins

Terms. A **basic food** is anything but a many-food dish: a Fineli FOOD, an own food, a scanned product, or a Fineli DISH whose recipe has exactly one food besides water and salt. A **dish** is every other Fineli DISH. The **head** is the first word of a name, hyphens kept, as today (`search_head`).

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

A listed form never ends a word or sits inside one. A base reached from a typed genitive ("nauta" for "naudan") gives 0, 2, 4 or 5 as a word would. A changed-stem genitive reached from its typed base is a compound's first part, and "naudanpaisti" is as much beef as "kananmuna" is egg, so at the start of a longer word it counts as an end does: 0 as the head, 1 starting the head ("Naudanpaisti"), 2 as a later whole word ("Jauheliha, naudan"), 3 starting a later word ("Jauheliha, naudanpaisti"). A regular genitive gets no such step, and needs none going this way: typed "kana" is already part of "kanan", and "Kananmuna" stays a word that merely starts with it. Over all typed words: **strength** is strong when every word is 0 to 3, start when the worst is 4 or 5, inside when any is 6. **Position** is the best word's t when strong, 4 or 5 when start (4 if any word met the head), 6 when inside.

1. **Group.**
   1. A basic food, strong.
   2. A dish, strong, and its head is or ends with a typed word (position 0 or 1).
   3. A basic food, start.
   4. A dish, strong, the word later in the name.
   5. A dish, start.
   6. A basic food, inside.
   7. A dish, inside.
2. **Yours.** A favourite, then an own food or a scanned product, then the rest.
3. **Position**, 0 to 6.
4. **Fineli foods and your foods before one-food dishes.**
5. **Recipe uses**, most first.
6. Fewer parts in the shown name, then the shorter name, then Finnish alphabetical order, then the id. As today.

### The SQL shape

One query, built in TypeScript as today, every pattern one bound parameter. For words `w1..wn`, with `f1a` a form of `w1`:

```sql
SELECT <summaryColumns>
FROM foods f,
LATERAL (SELECT
  LEAST(t_word(f.search_head, f.search_name, :w1), t_word(f.search_head_en, f.search_name_en, :w1),
        t_form(f.search_head, f.search_name, :f1a), t_form(f.search_head_en, f.search_name_en, :f1a)) AS t1
  -- , ... one per word
) t,
LATERAL (SELECT
  GREATEST(lvl(t1), ...) AS s,        -- lvl: 0 for t 0..3, 1 for 4..5, 2 for 6
  LEAST(t1, ...) AS best,
  (f.source = 'fineli' AND f.fineli_type = 'DISH' AND f.fineli_recipe_foods IS DISTINCT FROM 1) AS dish
) k
WHERE <visibleTo(user)> AND f.retired_at IS NULL
  AND (f.search_all LIKE '%w1%' OR (f.search_all LIKE '%f1a%' AND ' ' || f.search_all LIKE '% f1a%'))
  -- AND ... one per word
ORDER BY
  CASE WHEN s = 0 AND NOT dish THEN 0 WHEN s = 0 AND best <= 1 THEN 1 WHEN s = 1 AND NOT dish THEN 2
       WHEN s = 0 THEN 3 WHEN s = 1 THEN 4 WHEN NOT dish THEN 5 ELSE 6 END,
  CASE WHEN <favourite> THEN 0 WHEN f.source <> 'fineli' THEN 1 ELSE 2 END,
  CASE WHEN s = 0 THEN best WHEN s = 1 THEN CASE WHEN best IN (0, 1, 4) THEN 4 ELSE 5 END ELSE 6 END,
  (f.source = 'fineli' AND f.fineli_type = 'DISH'),
  f.fineli_recipe_uses DESC,
  array_length(string_to_array(<display>, ', '), 1), char_length(<display>), <byName(display)>, f.id
LIMIT :limit;
```

`t_word`, `t_form` and `t_gen` are written out as `CASE` expressions by three TypeScript builders, in the manner of today's `tierOf`. They are not database functions, so the migration adds none:

```sql
-- t_word(head, name, w): NULL when name NOT LIKE '%w%'
CASE WHEN head = w THEN 0 WHEN head LIKE '%w' THEN 1
     WHEN ' '||name||' ' LIKE '% w %' THEN 2 WHEN name||' ' LIKE '%w %' THEN 3
     WHEN head LIKE 'w%' THEN 4 WHEN ' '||name LIKE '% w%' THEN 5 ELSE 6 END
-- t_form(head, name, f), a base reached from its genitive: NULL when ' '||name NOT LIKE '% f%'
CASE WHEN head = f THEN 0 WHEN ' '||name||' ' LIKE '% f %' THEN 2 WHEN head LIKE 'f%' THEN 4 ELSE 5 END
-- t_gen(head, name, g), a changed-stem genitive reached from its base: NULL when ' '||name NOT LIKE '% g%'
CASE WHEN head = g THEN 0 WHEN head LIKE 'g%' THEN 1 WHEN ' '||name||' ' LIKE '% g %' THEN 2 ELSE 3 END
```

The `search_all LIKE '%f1a%'` beside the word-start test is there so the trigram index still serves the `OR`. `LEAST` and `GREATEST` skip NULLs, which the "all but one" query relies on.

Measured on release 18 after `VACUUM ANALYZE`: "jauheliha 10 nauta" 1.1 ms (bitmap scan on `foods_search_all_trgm`, 140 candidates), "rasva" with 609 matches 3.9 ms, the two-character "vl" 1.1 ms as a sequential scan.

### All but one word

When a search has two words or more and fewer than `NEAR_BELOW` (8) foods match all of them, a second query answers up to `NEAR_LIMIT` (8) foods that match all words but exactly one. It is the same query with the `WHERE` conjunction replaced by a count, and the unmatched word's `t` is NULL:

```sql
AND ((<match w1>)::int + (<match w2>)::int + ...) = :n - 1
```

It uses no index and scans the visible catalogue: 2.5 ms on release 18. It orders by the same rule over the words that did match. "jauheliha 10 nauta" answers "Jauheliha, sika-nauta", "Jauheliha, naudanpaisti, rasvaa 9 %", "Jauheliha, naudan, rasvaa 17 %", "Jauheliha, naudan, vähärasvainen, rasvaa 7 %", the pork and beef mince at 7 %, then three fried forms.

> **Assumption:** with two words, "all but one" means either word, so "kana riisi" lists rice foods and chicken foods. It is labelled as what it is. Flip: require three words, one constant.

## a) Overview

The Fineli import reads the release's recipe rows and stores two counts on each Fineli food. The search service ranks with them, treats a one-food dish as a basic food, searches a listed genitive for a base form and the reverse, and answers a second short list when few foods hold every word. The web shows that list under a plain heading and offers to add the food or scan it whenever little was found. The assistant's `search_foods` answers the same two lists.

## b) Components and responsibilities

| Component                                                          | Change                                                                                                                      | Owns                                                         | Depends on                                 |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------ |
| `apps/backend/src/db/schema/foods.ts`, migration `0012`            | Two columns                                                                                                                 | The counts                                                   | Nothing                                    |
| `scripts/fineliImport/readRelease.ts`                              | Reads `contribfood.csv` when present, and `IGCLASS` from `food.csv`                                                         | `FineliFood.recipeUses`, `recipeFoods`, `Release.recipeRows` | The release folder                         |
| `scripts/fineliImport/applyRelease.ts`                             | Writes the two counts, counts them as a change, leaves them alone when the release has no recipe file                       | The upsert                                                   | `readRelease`                              |
| `scripts/fineliImport/report.ts`                                   | Two new lines                                                                                                               | The report                                                   | `applyRelease`                             |
| `services/foodSearchForms.ts` (new)                                | `SEARCH_FORMS`, `formsOf`                                                                                                   | The pair list                                                | Nothing                                    |
| `services/foodSearch.ts`                                           | `searchQuery` rewritten to the rule, `nearQuery` added, `tierOf` replaced by the three builders, `NEAR_BELOW`, `NEAR_LIMIT` | The rule                                                     | `foodRows`, `foodScope`, `foodSearchForms` |
| `services/reads/foods.ts`                                          | `searchFoods` answers `{ foods, near }`                                                                                     | The decision to run the second query                         | `foodSearch`                               |
| `packages/types/src/foods.ts`                                      | `FoodSearchResultSchema`, `FoodSearchResult`                                                                                | The shape                                                    | `FoodSummarySchema`                        |
| `routes` for `GET /foods/search`                                   | Sends the new shape                                                                                                         | Nothing new                                                  | The service                                |
| `mcp/tools/foods.ts`, `mcp/appRules.ts`                            | Description and section 5 reworded, output schema if the tool declares one                                                  | The assistant's text                                         | The service                                |
| `apps/web/src/lib/api/foods.ts`, `foodCache.ts`, `queryOptions.ts` | The new type. `foodCache` maps and removes rows in `near` as it does in `foods`                                             | The cached search                                            | Types                                      |
| `apps/web/src/components/foods/useFoodFinder.tsx`                  | `Results` shows `near` and the "little found" block                                                                         | The results view                                             | The above                                  |
| `apps/web/messages/en.json`                                        | Three new lines, one reworded                                                                                               | Copy                                                         | Nothing                                    |

`search_head` and `food_search_head` stay in use. No SQL function changes.

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

Migration `0012_food_recipe_counts.sql`, generated by `db:generate`: two `ADD COLUMN` and the CHECK. Adding a column with a constant default rewrites nothing. No index: both columns are read only in the `ORDER BY` over the matches.

How the import computes them, from `contribfood.csv` (`FOODID` the dish, `CONFDID` the ingredient):

- `recipeUses` of a food: the number of distinct `FOODID` that list it as `CONFDID`. Every recipe in the file counts, also one whose dish is left out or "(arc)".
- `recipeFoods` of a food with at least one row as `FOODID`: its rows whose ingredient's `IGCLASS` is neither `WATER` nor `SALT`. An ingredient id missing from `food.csv` counts as a food.

Release 18 gives 809 foods with a use, a highest of 1,081 (iodised salt), and 285 dishes with exactly one food.

> **Assumption:** the stored figure is the count, and "is it one" is decided in the query. A boolean would be simpler and would hide the fact behind a judgement. Flip: none needed.

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

`near` is always present. It is empty when the query has one word, when `foods` has 8 or more, or when nothing matches all but one. `limit` bounds `foods` only. A food is never in both. `FoodListSchema` stays for the favourites and own lists.

`search_foods` (MCP) answers the same object. Its description becomes: "Foods whose Finnish or English name holds every word of q, basic foods before dishes, a food more of Fineli's recipes use before one fewer use. A word in its base form also finds its Finnish genitive, such as nauta and naudan. near lists foods that hold all words but one, when fewer than 8 hold them all. Each with its source and its figures per 100 g."

## e) Data flow

1. The person types "jauheliha 10 nauta". After 150 ms the web reads `GET /foods/search?q=jauheliha 10 nauta`.
2. `searchWords` normalises in SQL and splits: `jauheliha`, `10`, `nauta`. `formsOf("nauta")` gives `naudan`.
3. `searchQuery` runs. Two foods hold all three.
4. Two is under 8 and there are three words, so `nearQuery` runs, with the two ids left out, and answers eight.
5. The route sends `{ foods: [2], near: [8] }`. The assistant's tool sends the same.
6. The web lists the two, then the heading "All but one of your words" over the eight, then the "little found" block.

A failed second query fails the request as any read does. The two queries run one after the other on one connection. No transaction is needed: a food changed in between shows at worst in neither list for one answer.

The import: `readRelease` parses `contribfood.csv` into two maps while it reads, `applyRelease` compares the two counts with the stored ones in its change test and writes them in the upsert, in the one transaction it has. A release folder without the file sets `Release.recipeRows` to null, and `applyRelease` then neither compares nor writes the two columns.

## f) Frontend architecture

Only `Results` in `useFoodFinder.tsx` changes, so the log sheet and the ingredient picker change together. No new component file is needed beyond a small `LittleFound` block in the same folder.

| State                         | Shows                                                                                                |
| ----------------------------- | ---------------------------------------------------------------------------------------------------- |
| 8 foods or more               | The list, as today                                                                                   |
| 1 to 7 foods, `near` empty    | The list, then the block                                                                             |
| 1 to 7 foods, `near` has rows | The list, the heading "All but one of your words" over the `near` rows, then the block               |
| No foods, `near` has rows     | The line "No food has all of “jauheliha 10 nauta”.", the heading and the `near` rows, then the block |
| No foods, no `near`           | "No food matches “…”." and the block, as today plus the scan button                                  |

The block: **Add “…” as your own food** (`foods.sheet.addQuery`, as today) and, where the field's own camera button could show, **Scan a barcode** (`foods.sheet.scanInstead`), which calls the finder's `scanner.open` with itself as the opener. The test for "could show" is the one `SearchField` applies. Move it to one exported function so both read it.

- **Copy**, new keys under `foods.sheet`: `nearTitle` "All but one of your words", `noneWithAll` "No food has all of “{query}”.", `scanInstead` "Scan a barcode". `resultCount` counts `foods` only. A second polite line, `nearCount`, "{count, plural, one {# food has} other {# foods have}} all but one of your words.", is read after it.
- **Rows.** `near` rows are `FoodRow`, pressed like any other. The `near` list is its own `<section aria-label>` with the `sectionTitle` recipe, as the foods heading under a lead already is.
- **Nothing moves.** The list above the heading is the same list as today. The heading and the block come after it, so no row a finger aims at shifts when `near` arrives with the same answer. They arrive in one render, because they are one response.
- **Back and focus.** `useSheetNavigation` restores focus by row. A `near` row needs a `data-list` of its own (`results-near`) so Back finds it.
- **The scanner from the block.** A read puts the code in the field, as today. A swipe closes it and returns focus to the block's button, which is still on screen. `useScanner` assumes the opener is the camera button in two comments and in `restoreFocusOnClose`. Read them before wiring.
- **Cache.** `foodCache.ts` patches every cached search after a food write. It must patch and drop rows in `near` too, or a renamed or deleted own food stays stale there. `afterBarcodeFound` already marks every search stale.
- **Ingredient picker.** It hands the finder no `lead`, so it shows the same states with no extra heading.

## g) Constraints and decisions

- One query builder serves the route and the tool. The tool computes nothing.
- No language model, no user behaviour, no nutrient in the order.
- Every pattern stays one bound parameter. A normalised word holds only letters and digits, and `SEARCH_FORMS` is checked by a unit test to hold only normalised words of two characters or more.
- Backend relative imports carry `.js`. Web imports do not.
- Out of scope: typing errors, synonyms, English plurals, a per-screen flag, ranking by what the user eats.

### Rejected alternatives

| Alternative                                                    | Why not                                                                                                                                  |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| FOOD before DISH moved up, nothing else                        | Fixes "spagetti" only. Measured                                                                                                          |
| Rule A, strength first                                         | Oat flakes 9th, crushed tomatoes 34th                                                                                                    |
| Rule B, basic first                                            | A cheese before the breads for "leipä", and 17 of 109 dish words lose their first dish from the first screen                             |
| A score that adds weights                                      | Nobody can say from the doc why one food beat another                                                                                    |
| Snowball `finnish_stem`                                        | Splits nauta from naudan, joins peruna with "peru"                                                                                       |
| Trigram fallback for inflection                                | Finds no "naudan" for "nauta"                                                                                                            |
| A `food_search_forms` table in the database                    | A join and a migration per row, for 19 constants the query binds as parameters anyway                                                    |
| Voikko, a real Finnish analyser                                | A native library or a multi-megabyte dictionary in the backend, run on every own-food write and every query, to gain about a dozen forms |
| A "basic foods first" flag for the picker                      | Two rules, and the one rule already puts the raw food first                                                                              |
| `PROCESS`, `FUCLASS` or the Fineli id as the commonness signal | None separates light milk from goat milk                                                                                                 |
| A boolean `fineli_basic` column                                | Stores a judgement where a count will do                                                                                                 |
| Dropping "10" silently when nothing has it                     | The person would not learn that Fineli has no such mince                                                                                 |

### Non-questions

- Fewer parts and shorter names still break ties. They are steps 6 on.
- The compound rule stays: "Kananmuna" for "muna" before "Munakoiso". So "Porkkana" for "kana" stays.
- The search limit stays 30 by default and 50 at most.
- An own food's name is one name. It has no recipe counts and needs none: step 2 puts it ahead.

## h) Open questions and risks

| Question                                               | Assumption work starts on                                                                                                                        |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Does the release Artur imports hold `contribfood.csv`? | Yes. The mirror of release 18's "Basic package 2" has it, and `descript.txt` lists it. If not, the import says so and search ranks by name shape |
| Is 8 the right "little found"?                         | Yes: about a phone screen of rows. Two constants                                                                                                 |
| Do the 19 pairs cover a newer release?                 | Mostly. Run the check below at each import                                                                                                       |
| 0.3, scanned products with own foods                   | Built as recommended                                                                                                                             |
| The `near` list on the assistant's tool                | Shipped, because the assistant gets what the screen gets                                                                                         |

The check for missing pairs, run by hand after an import of a new release. It lists genitive-looking words whose base form is no word in the catalogue:

```sql
WITH w AS (SELECT DISTINCT regexp_split_to_table(search_name, ' ') AS w FROM foods WHERE source = 'fineli' AND retired_at IS NULL)
SELECT a.w FROM w a WHERE a.w ~ '[aeiouy]n$' AND char_length(a.w) >= 4
  AND NOT EXISTS (SELECT 1 FROM w b WHERE b.w = left(a.w, -1));
```

On release 18 it answers 238 words, nearly all adjectives ("suolaton") and brands. The nouns among them are the list's rows.

> **Risk:** a database migrated but not re-imported has every count at 0 and NULL. Search then puts basic foods first by type alone, treats boiled potato as a dish, and orders by parts and length. It is correct and plainer, not broken. The hand-over below closes it.

> **Risk:** a re-import of the same release reports about 2,550 foods "changed", once. The report says why (the new line). The rename and retire guards are unaffected, because neither counts a changed count.

> **Risk:** the release in the session scratchpad lacks `contribfood.csv`. The copy used here came from the public mirror, `raw.githubusercontent.com/theel0ja/fineli-data/master/basic-package-2/contribfood.csv`. The engineer fetches it into a folder of its own, as untrusted data, to build the fixtures.

> **Risk:** `apps/web/messages/en.json` and `useFoodFinder.tsx` are edited by most frontend work. Rebase before the frontend slice, and do not refactor across files.

> **Risk:** the two-character scan and the `near` scan read every visible food. Both grow with kept Open Food Facts products, which a user sees only after their own lookup, so the growth is per user.

**Hand-over to Artur, after the PR merges and deploys:**

1. Check that `apps/backend/data/fineli/` still holds the release, and that `ls` shows `contribfood.csv`. If it does not, download and unzip the release again, as the runbook's steps 1 and 2 say.
2. Locally: `pnpm --filter @hovimestari/backend db:migrate`, then `pnpm --filter @hovimestari/backend fineli:import --dry-run`. The report should show "Recipe rows read" with a number near 10,800 and about 2,550 foods changed, none renamed, none retired.
3. `pnpm --filter @hovimestari/backend fineli:import`, then once more. The second run changes nothing.
4. On Fly: put `contribfood.csv` beside the other files in `/tmp/fineli`, and run the import there as the runbook's step 8 on says.
5. On the phone, search "spagetti", "maito", "rahka", "nauta" and "jauheliha 10 nauta". Expect the dry pasta, light milk, plain quark, the minces, and the "All but one of your words" list.
6. Not verified here: the current release's file names and whether its recipe file has the same columns. The import stops and names what it did not find.

## i) Docs

| Doc                                                  | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/features/foods.md`                             | "Searching for a food": the matching with word forms, the rule's steps in plain words, what a basic food is, the "all but one" list, and the honest limits (bread, "kana"). "The search rule in code": the builders, `foodSearchForms.ts`, the two queries, the measured times. "The Fineli import" and "The import in code": the recipe file and the two counts. "API" and "Data": the answer's shape and the two columns. "Known gaps": the pair list is checked by hand per release |
| `apps/backend/src/mcp/appRules.ts`                   | Section 5's sentence on `search_foods`, and the new hash of `foods.md` in `APP_RULES_SOURCES`                                                                                                                                                                                                                                                                                                                                                                                          |
| `docs/app/log-sheet.md`                              | The search view's states: the "All but one of your words" list, the block with its two buttons, the reworded no-match line                                                                                                                                                                                                                                                                                                                                                             |
| `docs/app/recipes.md`                                | One sentence under adding an ingredient, if it restates the empty state. It should link, not restate                                                                                                                                                                                                                                                                                                                                                                                   |
| `docs/setup/fineli-import.md`                        | Step 2's listing and step 8's `put` lines gain `contribfood.csv`. Step 6 gains the two report lines. A new short section: "After an update that changes what the import reads, run it again"                                                                                                                                                                                                                                                                                           |
| `docs/features/connected-ai.md`                      | Only if it lists what `search_foods` answers                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `docs/features.md`                                   | The Foods line: "one search that finds a food by any part of its name, puts basic and common foods first and knows the Finnish genitive of common ingredients"                                                                                                                                                                                                                                                                                                                         |
| `docs/design/link-map.md`                            | New rows: "basic food, one-food dish, recipe uses" and "word forms in search", both homed at `features/foods.md#searching-for-a-food`. No new heading                                                                                                                                                                                                                                                                                                                                  |
| `apps/backend/README.md`, `packages/types/README.md` | The new file and the new schema, one line each                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `TODO.md`                                            | Delete "Revisit the search ranking for common one-word searches". Reword the first-import item's pinned searches to the new pins. The items this design filed stay                                                                                                                                                                                                                                                                                                                     |

## j) Implementation plan

One branch, one PR. Each agent logs to `logs.txt` before and after.

| Step | Agent                             | Work                                                                                                                                          | Files                                                                                                                                                                                                                                                   | Done when                                                   |
| ---- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| B1   | backend-engineer                  | The two columns, the migration, the import reading and writing the counts, the report lines, the runbook                                      | `db/schema/foods.ts`, `drizzle/migrations/0012_*`, `scripts/fineliImport/{readRelease,applyRelease,report}.ts`, their tests and fixtures (`release-a` and `release-b` gain a `contribfood.csv`, `release-utf8` has none), `docs/setup/fineli-import.md` | Tests below pass. `db:generate` leaves the tree clean       |
| B2   | backend-engineer                  | The pair list, the rule, the `near` query, the type, the route, the tool, `appRules`, `foods.md`, `features.md`, link map, READMEs, `TODO.md` | `services/{foodSearch,foodSearchForms}.ts`, `services/reads/foods.ts`, `packages/types/src/foods.ts`, `routes`, `mcp/tools/foods.ts`, `mcp/appRules.ts`, `scripts/mcpSmoke/checks.ts`, `services/__tests__/foodSearch.db.test.ts` and its fixture       | Tests below pass, each new pin seen failing on the old rule |
|      | validator, then reviewer          | After B2                                                                                                                                      |                                                                                                                                                                                                                                                         |                                                             |
| F1   | frontend-engineer                 | The type through the API client and cache, `Results`, the block, copy, `log-sheet.md`                                                         | `apps/web/src/lib/{api/foods,foodCache,queryOptions}.ts`, `components/foods/{useFoodFinder,SearchField}.tsx`, `messages/en.json`, their tests                                                                                                           | Tests below pass                                            |
|      | validator, ui-validator, reviewer | After F1. User-visible: both themes, 320 to 1280 wide, and on a phone                                                                         |                                                                                                                                                                                                                                                         |                                                             |
|      | documentation-specialist          | After the reviewer passes                                                                                                                     |                                                                                                                                                                                                                                                         |                                                             |

B2 depends on B1's columns. F1 depends on B2's type. Until F1 lands, the web reads `foods` from the new shape and ignores `near`, so B2 breaks no screen, but the web's type must compile: F1 is in the same PR.

### Tests that pin it

**Fixture.** `fixtures/fineli-names-r18.csv` gains two columns, `recipe_uses` and `recipe_foods`, with the real counts from release 18's `contribfood.csv`. It is rebuilt as: for each pinned search, its first 40 on the full release under the new rule, plus the witnesses named below. Real names and types, invented nutrient values, credited as today.

**`foodSearch.db.test.ts`, on a real Postgres.** The owner's own examples are the invariants:

- "spagetti": the first three are "Pasta, spagetti, makaroni" and its two gluten-free twins. No name holding "valmisateria" is in the first 8. Negative: "Spagettilihavuoka" is never above "Pasta, spagetti, makaroni".
- "jauheliha 10 nauta": `foods` is exactly the pork and beef mince at 10 % and its fried form. `near` starts with "Jauheliha, sika-nauta", "Jauheliha, naudanpaisti, rasvaa 9 %", "Jauheliha, naudan, rasvaa 17 %", "Jauheliha, naudan, vähärasvainen, rasvaa 7 %". No food is in both lists.
- "nauta": "Naudanpaisti" first, and each of the first 8 begins "Naud". "naudan": "Jauheliha, naudan, rasvaa 17 %" in the first 3. "jauheliha nauta": the mixed mince, then the beef minces at 9 %, 17 % and 7 %, before any fried form. "sika" puts "Sianliha, keskiarvo" in the first 3. "lammas" puts the two "Lampaanliha" foods first. "kana" never puts a "Kananmuna" in the first 8: a regular genitive is no compound step. "hirvi" puts "Hirvenliha" first. "kanan" puts "Kana" first. "perunan" puts "Peruna, vanha, kuorittu" first.
- A form must start a word: "sika" never answers a food whose only "sian" is inside an English word. The fixture holds one of the two real ones.
- "naut" answers no "naudan" food that lacks "naut": a form needs the whole word.
- "rahka": plain quark under 0.5 % first, its low-lactose twin second. "maito": kevytmaito, rasvaton, täysmaito, in that order, and goat milk not in the first 8. "egg": "Kananmuna, kuoreton" first, the quail egg after every hen's egg FOOD. "rice": "Riisi puuroutuva" first, rice chocolate not in the first 8. "omena": the average apple first, dried apple 4th. "peruna": "Peruna, vanha, kuorittu" first, "Peruna, kuorittu, keitetty, suolaton" in the first 8.
- "kaura": "Kaurahiutale" in the first 3. "muna": "Kananmuna, kuoreton" first and "Munakoiso" after every "Kananmuna". "kana": "Kana" first, "Porkkana" 4th, pinned as the known limit.
- A one-food dish is basic: "kana" puts "Kana, keitetty, suolaa" before "Porkkana". With its `recipe_foods` set to 2 in a copy of the row, it falls behind. That is the test that fails without the count.
- Group order, on four invented-free real rows for "kaura": a basic strong match, then a dish whose head is the word, then "Kaurahiutale", then a dish holding "kaura" later.
- Standing: a favourite outranks a non-favourite in its group and never a better group. An own food and a scanned product (with its `food_lookups` row) both come before a Fineli food of the same group. Another user's scanned product never appears.
- `near`: empty for one word, empty when 8 or more match, at most 8, ordered by the rule, never a retired food, never another user's food.
- Empty input: `%`, `_`, `-`, `a` and `%%` answer `{ foods: [], near: [] }`.
- Plan and speed: at 10,000 rows after `VACUUM ANALYZE`, `EXPLAIN` for "rah" and for "nauta" (a word with a form) shows `foods_search_all_trgm`. The median of 25 searches, each with its `near` query, stays under 150 ms.

**`foodSearchForms.test.ts`.** Every member is normalised, two characters or more, and no word is in two pairs with different partners unless meant. `formsOf` answers both directions, marks a changed-stem genitive reached from its base and no other, and answers nothing for a prefix.

**Import tests.** `release-a` with a recipe file: the counts land, water and salt are left out of `recipeFoods`, an ingredient id missing from `food.csv` counts. The same release twice changes nothing. `release-b` changes one count and the food is reported changed, not renamed. A folder without the file leaves stored counts as they were and prints the line. A recipe file without `CONFDID` stops with a `ReleaseError` naming the column.

**Route and tool.** Supertest on `GET /foods/search` for the shape. The MCP smoke check and the tool test for `near`. `appRules.test.ts` passes after the re-stamp.

**Web.** `Results` in each of the five states of section f, by role and name, with the real catalogue. The `near` rows open a food. Across states: the first `foods` row is at the same offset with and without `near` under it. The scan button shows only where the field's would. `foodCache`: a renamed own food is renamed in `near`, a deleted one leaves it. The catalogue tests pass with the new keys reached.

## Resolved defaults (orchestrator, 2026-11-24, owner may veto)

- One rule for both screens and the assistant. No flag.
- Fineli foods before one-food dishes at the same position (0.1).
- Scanned products rank with own foods (0.3).
- Favourites stay first within their group, not above it (0.4).
- No spelling fallback, no synonyms, no English plurals in this change (0.5, 0.7, 0.8).
- The pair list lives in TypeScript, 19 pairs, exact-word trigger, forms must start a word.
- A direct match and a form match rank alike, so "naudan jauheliha" puts the pork and beef mince first.
- A changed-stem genitive at the start of a compound counts like a compound's end, when reached from its base. Flip: use `t_form` for both directions, and "nauta" lists minces before cuts.
- `near` needs two words, fewer than 8 full matches, and answers at most 8.
- `contribfood.csv` is optional to the import. Without it the counts are left as stored.
- The stored figures are counts, and "one food" is decided in the query.
- The scratch database `hovi_search_design` is dropped. The prototype SQL is in the session scratchpad under `search-design/` and is not needed: sections 4 and c hold the rule.
