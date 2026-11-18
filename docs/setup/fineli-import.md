# Fineli import

This runbook loads a Fineli release into the food catalogue, first on your own machine and then on Fly. Artur runs it by hand, once per new Fineli release. Fineli is the Finnish food composition database of the Finnish Institute for Health and Welfare (THL), published as open data under the Creative Commons Attribution 4.0 licence. The import is safe to repeat: a second run of the same release changes nothing. How the import treats each food is in [the foods feature doc](../features/foods.md#the-fineli-import).

## Steps

1. Download the release in a browser. Fineli's site refuses scripts, so curl and similar tools get an error page. Open `https://fineli.fi/fineli/en/avoin-data`, the open data page. Under "Download Fineli Open Data packages" it lists three zips. Take "Basic package 2", the one with 74 food components, a zip of about 1.9 MB. The import is built and tested on that package. Note the release number or date the page shows.

   The other two zips hold fewer food components, and the import is not tested on them. "Basic package 1" has 55 and "Ingredients for food industry" has 40. The "Download CSV" button on the foods page, `https://fineli.fi/fineli/en/elintarvikkeet`, gives a different export, and the import cannot read it.

2. Unzip it into `apps/backend/data/fineli/`, from the repository root. The folder is ignored by git. Empty it first, so no file from an earlier release stays behind. Replace the zip's path with where your browser saved it:

   ```bash
   rm -rf apps/backend/data/fineli
   mkdir -p apps/backend/data/fineli
   unzip ~/Downloads/fineli-open-data.zip -d apps/backend/data/fineli
   ls apps/backend/data/fineli
   ```

   The listing must show `food.csv`, `foodname_FI.csv`, `foodname_EN.csv`, `component_value.csv`, `foodaddunit.csv` and `descript.txt` directly in the folder. `descript.txt` gives the release number in the report. If the zip put them in a subfolder, move them up one level, because the steps below read them from this folder.

3. Prepare the local backend and its database, from the repository root. `pnpm env:init` writes `apps/backend/.env`, which holds the `DATABASE_URL` the import uses, and never overwrites a file that exists. The migrations read constants from the shared types package, so it is built first. [The local development runbook](local-development.md) explains each step.

   ```bash
   pnpm install
   pnpm env:init
   pnpm --filter @hovimestari/types build
   pnpm db:up
   pnpm --filter @hovimestari/backend db:migrate
   ```

4. Do a dry run. It reads the release, works out every change and writes nothing:

   ```bash
   pnpm --filter @hovimestari/backend fineli:import --dry-run
   ```

   pnpm prints two lines starting with `>` before the command's own output. Read the report under them. It starts with "Fineli import from" and the folder, and ends with "Dry run: nothing was written." and the credit to Fineli and THL. If the import stops instead, the line under pnpm's two lines starts with "Fineli import stopped." or "Fineli import failed." and says what went wrong. pnpm then adds its own `ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL` lines with the exit status, which you can ignore. [If the import stops](#if-the-import-stops) says what each message means.

5. Import for real:

   ```bash
   pnpm --filter @hovimestari/backend fineli:import
   ```

   The report ends with "Written to the database." and the credit. The command then runs `VACUUM ANALYZE foods`, so search uses its index straight away. On release 18, in a development container, the import took about three seconds and used at most 160 MB of memory.

6. Read the report closely. It lists:

   - the release number from `descript.txt`, and the encoding each file was read in,
   - how many of the foods read were added, changed, unchanged, brought back, retired because the name now starts with "(arc)", or left out, and a last line that adds these up to the number read,
   - every food left out, with the reason, such as a food with no protein value,
   - the catalogue foods it retired: those no longer in the release, and, named one by one, those the release still lists but without usable values,
   - how many household measures were added, changed, unchanged and removed, and how many were left out for each reason,
   - how many foods had their name changed in case only and in nothing else, as "Names changed in case only",
   - every food whose Finnish name changed in more than case under the same Fineli id, as "Renamed under the same id",
   - the credit to Fineli and THL that the licence asks for.

   Some releases write every food name in capitals. The import stores those names in sentence case, so "KANANMUNA, KEITETTY" reads "Kananmuna, keitetty". An import over a catalogue that holds such names in capitals rewrites each of them once. That run counts them under "Names changed in case only", lists none of them as renamed, and counts each food under "Changed". A food whose name starts with "(ARC)" and was imported live is retired in the same run, and counted on the report's "(arc)" line.

   Check each renamed food is still the same food. Fineli's id is how the import recognises a food, so if THL ever gave an old id to a different food, the catalogue would change that food's name and figures under every entry that points at it.

7. Run the same command again. The report must show nothing added, changed or removed.

8. Import on Fly. The backend image holds the built command, so the release is copied to the machine and imported there, and the database password never leaves Fly. Make a folder on the machine, then copy into it the five files the import needs and `descript.txt`, which holds the release number. `flyctl ssh sftp shell` opens a prompt that takes `put` commands:

   ```bash
   flyctl ssh console -a hovimestari-backend -C "mkdir -p /tmp/fineli"
   cd apps/backend/data/fineli
   flyctl ssh sftp shell -a hovimestari-backend
   # At the prompt, one line each, then Ctrl+D to leave:
   # put descript.txt /tmp/fineli/descript.txt
   # put food.csv /tmp/fineli/food.csv
   # put foodname_FI.csv /tmp/fineli/foodname_FI.csv
   # put foodname_EN.csv /tmp/fineli/foodname_EN.csv
   # put component_value.csv /tmp/fineli/component_value.csv
   # put foodaddunit.csv /tmp/fineli/foodaddunit.csv
   cd -
   ```

9. Do a dry run on Fly, then the import, and read each report as in step 6:

   ```bash
   flyctl ssh console -a hovimestari-backend -C "node /app/apps/backend/dist/scripts/fineliImport/index.js /tmp/fineli --dry-run"
   flyctl ssh console -a hovimestari-backend -C "node /app/apps/backend/dist/scripts/fineliImport/index.js /tmp/fineli"
   ```

   The command reads `DATABASE_URL` from the machine's secrets. If it answers "DATABASE_URL is not set", the secret is missing on the app: see [the Fly runbook](fly-backend.md).

10. Remove the copy from the machine:

    ```bash
    flyctl ssh console -a hovimestari-backend -C "rm -rf /tmp/fineli"
    ```

### If the import stops

The command answers exit code 1, says "Fineli import stopped." and writes nothing when:

- A file or a column is missing. The message names the file, the column and the columns it found. A new release may have renamed a file or a column. The importer reads files and columns by name, so a rename needs a change in `apps/backend/src/scripts/fineliImport/readRelease.ts`.
- A file does not look separated by semicolons. Fineli's files are, so the file is not the one the import expects.
- A file is UTF-8 with some bytes that are not. The message names the file and the first bad line. The file was damaged on the way, so download and unzip the release again.
- The release would retire more than 10 % of the Fineli foods in the catalogue. A wrong folder or a cut-off file looks exactly like that. Check the folder first. If THL really dropped that many foods, run the command again with `--allow-retire`.
- The release would rename more than 5 % of the Fineli foods in the catalogue, and more than ten. A file read in the wrong encoding looks like that: every name with å, ä or ö changes. The message shows three of the renames. If they read correctly and THL really renamed that many foods, run the command again with `--allow-rename`.

It answers exit code 1 and says "Fineli import failed. Most likely nothing was written." with the database's message when the database fails during the import, for example when the connection drops. The import runs in one transaction, so a failure rolls it back. The one exception is a connection lost while the transaction commits, which leaves the outcome unknown. A dry run shows the catalogue as it is now: it reports nothing to add or change when the import did get written. Run the import again once the database answers. It is safe to repeat.

It says "The import was written. Refreshing statistics failed:" with the database's message, and answers exit code 3, when the import was written but `VACUUM ANALYZE foods` failed. The report above that line is true. Search works but may scan the whole table until the next run or the database's own autovacuum. Run the same import again: it changes nothing and refreshes the statistics.

A wrong option or two folders answer exit code 2 with the usage line.

## Check it works

Look at one food in the database. On your machine, from the repository root:

```bash
docker compose exec db psql -U postgres -d hovimestari -c "SELECT name, energy_kcal, protein_g FROM foods WHERE fineli_id = 858;"
docker compose exec db psql -U postgres -d hovimestari -c "SELECT p.fineli_unit, p.grams FROM food_portions p JOIN foods f ON f.id = p.food_id WHERE f.fineli_id = 858;"
```

In release 18, Fineli id 858 is "Kananmuna, kuoreton", a hen's egg, with `134.17` kcal and `12.610` g protein per 100 g. Its measures include `KPL_M`, a medium egg, at `55.0` g. A release that writes its names in capitals gives every name in sentence case here too, never in capitals. On Fly, open the database with `flyctl postgres connect -a hovimestari-db --database hovimestari_backend` and type the same two queries at the prompt.

## Before production

- The importer's tests run on release 18 (2015). Release 20 of Basic package 2 has been imported on a local machine. Before the first import of a release on Fly, do the dry run there and compare its report with the local one. A large difference is worth understanding before the real run. Release 18's report reads 4,058 foods read, 8 left out and 27 named "(arc)".
