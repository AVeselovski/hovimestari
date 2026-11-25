---
name: Food search ranking redesign
description: 2026-11-24 design of the search rule: Fineli recipe rows as the commonness signal, a 19-pair inflection list, what was measured and rejected
type: project
---

The food search rule was redesigned on 2026-11-24 (`docs/design/food-search-ranking.md`), after Artur could not find plain spaghetti or beef mince on his phone.

- **The signal that says which food is the common one is Fineli's own recipe file, `contribfood.csv`.** It lists the ingredients of 1,968 dishes. Counting the dishes that use a food puts light milk (296), the shelled egg (395) and plain quark (16) first with no word list. The same file says which "dishes" are one food cooked (285 of them, such as boiled potato), by counting ingredient rows besides water and salt (`IGCLASS` WATER and SALT).
- The earlier design said nothing in the data tells the plain variant. That was true of the files the import read, not of the release.
- **The scratch copy of release 18 in a session scratchpad may be a subset.** It lacked `contribfood.csv`, which the mirror's `basic-package-2/` has. Check the mirror before concluding a file does not exist.
- **Finnish inflection needs a list, not a stemmer.** Postgres's Snowball `finnish_stem` gives nauta/nauda, sika/sian, lammas/lamp, and cuts peruna to "peru" and porkkana to "pork". On release 18 only about a dozen genitives with a changed stem occur in names (naudan 149 foods, sian 44, porsaan 19, lampaan 18, vuohen 16, hirven 13). A listed form must start a word, or "sian" matches "Russian". A changed-stem genitive reached from its base must count as a compound end ("naudanpaisti"), or the 9 % beef mince falls behind every fried form.
- Trigram similarity does not bridge inflection ("nauta" finds no "naudan") and matches short words to noise ("chia" finds 192 chicken dishes).

**Why:** each of these took a measurement to learn, and the first two overturn a conclusion recorded in `docs/design/targets-and-foods.md`.

**How to apply:** for any later search or catalogue design, read every file of the release, and measure a candidate on the full catalogue with the harness pattern (a scratch database, a `queries` table, before and after tables). Calling one SQL search function per cell of an evidence table is slow: about 2,000 calls took over five minutes.

**Added after the design review (2026-11-24):**

- The scratchpad's release 18 folder is itself a copy from the community mirror, with only the files the import reads. Nobody has seen Fineli's official download. Never argue from what that folder lacks, and say plainly where a file was and was not seen.
- A count that is right for ingredients is noise for dishes: recipe uses ordered breads by how many sandwiches name them. Apply a signal only to the class it describes, and measure the other class too.
- Evidence weighted to the reported problem (ingredient words) hid the log sheet's losses: dishes leaving the 30 rows, and English names, where the class word is a separate later word. Add the most-used path's everyday searches and both languages before claiming "one rule".
- A new column filled by a hand-run import leaves a state in between that can be worse than today. Measure that state, and plan the pull requests around the run.
- A changed sort-key order (group, yours, position) is a behaviour change for own foods and favourites too, even when the row in the decision table only speaks of scanned products.
