# Search ranking sample

`fineli-names-r18.csv` holds 826 real food names from release 18 of Fineli, the Finnish food composition database of the Finnish Institute for Health and Welfare (THL), with the two recipe counts the import stores for each. It is used under the [Creative Commons Attribution 4.0](https://creativecommons.org/licenses/by/4.0/) licence. Source: [Fineli](https://fineli.fi/). THL does not produce or endorse Hovimestari.

Each row is a Fineli food id, its food type, its process code, its Finnish name, its English name, the number of Fineli recipes that use it and the number of foods its own recipe holds besides water and salt, separated by `;`. The last field is empty for a food without a recipe. The counts are the ones in `src/scripts/fineliImport/recipeCountsR18.ts`. The file holds no nutrient values. `support/searchSample.ts` loads it and gives every food the same invented values.

The sample is every food that ranks in the first 40 on the full release for one of the pinned searches, under the search rule as built:

- With Finnish names: "spagetti", "jauheliha 10 nauta", "nauta", "naudan", "jauheliha nauta", "sika", "sian", "lammas", "hirvi", "kanan", "perunan", "kana", "härän", "härkä", "naut", "rahka", "maito", "egg", "rice", "omena", "peruna", "kaura", "muna", "poro", "poron", "leipä", "ruisleipä", "mysli", "jaatelo", "rahka vl", "jäätelö kerma", "egg shell", "kananmuna kuoreton", "riisi tumma" and "rahka maustettu".
- With English names: "soup" and "kananmuna kuoreton".
- With every count empty, as on a database not imported since the counts came: "spagetti", "maito" and "kana".
- For each search of two words or more, also the first 40 foods that hold all words but one.

It also holds the witnesses the tests name: every "Spagettilihavuoka", "Kananmuna", "Poron", "Poro-", "Härän", "Mysli," and "Rahkapiirakka" food, every food named with "härkäpapu", the "Porkkana" foods typed FOOD, "Munakoiso", "Maksa, poron", "Vaalea leipä, juustopatonki", "Leipärasva, keskiarvo", "Jauho, hiivaleipävehnäjauho", "Voileipäkakku, kasvis", and the foods with ids 153, 300, 362, 604, 622, 657, 750, 858 and 8023. Foods whose names start with `(arc)` are left out.

Because each search's full first 40 is in the sample, a position up to 40 in the sample is the same position on the full release.

## Rebuilding it

`support/buildSearchSample.ts` builds the file. It holds the searches and the witnesses above as lists, runs each search through `searchQuery` and `nearQuery` with a limit of 40, and writes the rows of every food found, with the witnesses, in order of Fineli id. No test runs it, and the tests need no imported release.

Rebuild the file after a change to the search rule, or when a test needs a food the sample lacks. For a new food, add its name to the witnesses in the script and in the list above.

1. Put release 18 in `apps/backend/data/fineli/`, as steps 1 and 2 of [the Fineli import runbook](../../../../../../docs/setup/fineli-import.md) say. Then make a scratch database, run the migrations on it and import the release into it, from the repository root. The database must be UTF-8.

   ```bash
   createdb -h localhost -U postgres --encoding UTF8 --template template0 hovi_search_sample
   export DATABASE_URL=postgresql://postgres@localhost:5432/hovi_search_sample
   pnpm --filter @hovimestari/types build
   pnpm --filter @hovimestari/backend db:migrate
   pnpm --filter @hovimestari/backend fineli:import
   ```

2. Build the sample, from the repository root, with `DATABASE_URL` still set.

   ```bash
   pnpm --filter @hovimestari/backend search:sample
   ```

   It prints the number of foods and the file it wrote. Give it a path to write somewhere else. The script works in one transaction and rolls it back, so it leaves the database as it was.

3. Run `git diff` on the file. With no change to the rule, the searches or the witnesses, the file comes out the same byte for byte. Then run the search suites.
