import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { fileURLToPath } from "node:url";
import pg from "pg";
import * as schema from "../../db/schema/index.js";
import { runCli } from "./cli.js";
import { RECIPE_COUNTS_R18 } from "./recipeCountsR18.js";

// The Fineli import command:
//   pnpm --filter @hovimestari/backend fineli:import [dir] [--dry-run] [--allow-retire] [--allow-rename]
// or, from the built image:
//   node apps/backend/dist/scripts/fineliImport/index.js <dir>
// It needs only DATABASE_URL, so it runs on a Fly machine without the app's other secrets.
// docs/setup/fineli-import.md has the steps.

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Run `pnpm env:init` at the repository root, or set it.");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: url, max: 2, application_name: "hovimestari-fineli-import" });
// A dropped idle connection must not end the process with a stack trace. runCli reports the failed query.
pool.on("error", () => {});
const code = await runCli(process.argv.slice(2), drizzle(pool, { schema }), console, {
  // apps/backend/data/fineli, from src/scripts/fineliImport or dist/scripts/fineliImport alike.
  defaultDir: fileURLToPath(new URL("../../../data/fineli/", import.meta.url)),
  // pnpm runs a package script in the package's folder, and keeps the folder the person was in as INIT_CWD.
  cwd: process.env.INIT_CWD ?? process.cwd(),
  // The recipe counts for a release folder that has no contribfood.csv of its own.
  recipeCounts: RECIPE_COUNTS_R18,
}).finally(() => pool.end().catch(() => {}));
process.exit(code);
