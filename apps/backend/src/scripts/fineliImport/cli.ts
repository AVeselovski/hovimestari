import { sql } from "drizzle-orm";
import path from "node:path";
import type { Db } from "../../db/types.js";
import { applyRelease, RenameGuardError, RetireGuardError, type ImportResult } from "./applyRelease.js";
import { readRelease, ReleaseError, type Release } from "./readRelease.js";
import { formatReport } from "./report.js";

export const USAGE = "Usage: fineli:import [dir] [--dry-run] [--allow-retire] [--allow-rename]";

export interface CliArgs {
  dir: string;
  dryRun: boolean;
  allowRetire: boolean;
  allowRename: boolean;
}

/** Arguments the command does not know. */
export class UsageError extends Error {
  override name = "UsageError";
}

/**
 * The command's arguments. `dir` is resolved against `cwd`, the folder the
 * person ran the command from, and defaults to `defaultDir`.
 */
export function parseArgs(argv: string[], { defaultDir, cwd }: { defaultDir: string; cwd: string }): CliArgs {
  const args: CliArgs = { dir: defaultDir, dryRun: false, allowRetire: false, allowRename: false };
  let dirGiven = false;
  for (const arg of argv) {
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--allow-retire") args.allowRetire = true;
    else if (arg === "--allow-rename") args.allowRename = true;
    else if (arg === "--") continue;
    else if (arg.startsWith("-")) throw new UsageError(`Unknown option ${arg}. ${USAGE}`);
    else if (dirGiven) throw new UsageError(`Give one folder, not two. ${USAGE}`);
    else {
      args.dir = path.resolve(cwd, arg);
      dirGiven = true;
    }
  }
  return args;
}

/** Reads the release and applies it. */
export async function importRelease(
  db: Db,
  args: CliArgs,
  now = new Date(),
): Promise<{ release: Release; result: ImportResult }> {
  const release = readRelease(args.dir);
  const result = await applyRelease(db, release, {
    allowRetire: args.allowRetire,
    allowRename: args.allowRename,
    dryRun: args.dryRun,
    now,
  });
  return { release, result };
}

/**
 * `VACUUM ANALYZE foods`. After a bulk load the trigram index's pending list
 * is full and the planner prices a full scan below the index until a vacuum.
 */
export async function refreshStatistics(db: Db): Promise<void> {
  await db.execute(sql`VACUUM ANALYZE foods`);
}

/** The import and, unless it is a dry run, the statistics refresh. */
export async function runImport(
  db: Db,
  args: CliArgs,
  now = new Date(),
): Promise<{ release: Release; result: ImportResult }> {
  const done = await importRelease(db, args, now);
  if (!args.dryRun) await refreshStatistics(db);
  return done;
}

const messageOf = (err: unknown) => (err instanceof Error ? err.message : String(err));

/**
 * Runs the command and answers its exit code: 0 done, 1 not written (the
 * release cannot be read or a guard stopped it), or most likely not written
 * (the database failed during the import), 2 bad arguments, 3 written but
 * the statistics refresh failed. The report prints before the refresh, so a
 * slow or failed refresh never hides what was written. Only the import is
 * inside the try: an error printing the report of a written import is not
 * reported as an import that wrote nothing.
 */
export async function runCli(
  argv: string[],
  db: Db,
  out: { log: (line: string) => void; error: (line: string) => void },
  defaults: { defaultDir: string; cwd: string },
): Promise<number> {
  let args: CliArgs;
  try {
    args = parseArgs(argv, defaults);
  } catch (err) {
    out.error(messageOf(err));
    return 2;
  }
  let done: { release: Release; result: ImportResult };
  try {
    done = await importRelease(db, args);
  } catch (err) {
    if (err instanceof ReleaseError || err instanceof RetireGuardError || err instanceof RenameGuardError) {
      out.error(`Fineli import stopped. ${err.message}`);
    } else {
      // The import runs in one transaction, so a failure rolls it back, except
      // a connection lost during COMMIT, which leaves the outcome unknown.
      out.error(
        `Fineli import failed. Most likely nothing was written. A dry run shows the catalogue as it is now. ${messageOf(err)}`,
      );
    }
    return 1;
  }
  out.log(formatReport(args.dir, done.release, done.result));
  if (args.dryRun) return 0;
  try {
    await refreshStatistics(db);
  } catch (err) {
    out.error(`The import was written. Refreshing statistics failed: ${messageOf(err)}`);
    return 3;
  }
  return 0;
}
