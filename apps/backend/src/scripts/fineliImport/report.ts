import type { ImportResult } from "./applyRelease.js";
import type { Release } from "./readRelease.js";

/** The credit the licence asks for, printed with every report. */
export const FINELI_CREDIT =
  "Food composition data: Fineli, Finnish Institute for Health and Welfare (THL), CC BY 4.0. THL does not produce or endorse Hovimestari.";

/**
 * The import report a person reads. The lines under "Foods read" partition
 * the release: every food read is counted exactly once, and the sum line
 * at the end says so. Retirements of foods the release no longer gives are
 * listed apart, because they are catalogue foods, not foods read.
 */
export function formatReport(dir: string, release: Release, result: ImportResult): string {
  const f = result.foods;
  const p = result.portions;
  const read = release.foods.length + release.skipped.length;
  const left = release.skipped.length;
  const leftOutRetired = result.retired.leftOut;
  const lines = [
    `Fineli import from ${dir}`,
    `Release: ${release.label ?? "no release number found in descript.txt"}`,
    `Encodings: ${Object.entries(release.encodings)
      .map(([file, encoding]) => `${file} ${encoding}`)
      .join(", ")}`,
    "",
    `Foods read: ${read}`,
    `  Added: ${f.inserted}`,
    `  Changed: ${f.updated}`,
    `  Unchanged: ${f.unchanged}`,
    `  Back after being retired: ${f.revived}`,
    `  Retired, the name now starts with "(arc)": ${f.archived}`,
    `  Left out: ${left}`,
    ...release.skipped.map((s) => `    ${s.fineliId} ${s.name ?? "(no name)"}: ${s.reason}`),
    `Of the foods read, ${release.foods.filter((x) => x.archived).length} are named "(arc)" and stay retired, out of search.`,
    "",
    "Retired from the catalogue:",
    `  No longer in the release: ${result.retired.absent}`,
    `  Still in the release, but without usable values: ${leftOutRetired.length}`,
    ...leftOutRetired.map((r) => `    ${r.fineliId} ${r.name}: ${r.reason}`),
    "",
    `Portions: ${p.inserted} added, ${p.updated} changed, ${p.unchanged} unchanged, ${p.removed} removed`,
    ...Object.entries(release.skippedPortions).map(([reason, count]) => `  Left out, ${reason}: ${count}`),
    "",
    result.renamed.length === 0
      ? "Renamed under the same id: none"
      : `Renamed under the same id: ${result.renamed.length}. Check that each is still the same food.`,
    ...result.renamed.map((r) => `  ${r.fineliId}: "${r.from}" is now "${r.to}"`),
    "",
    `${read} read = ${f.inserted} added + ${f.updated} changed + ${f.unchanged} unchanged + ${f.revived} back + ${f.archived} newly "(arc)" + ${left} left out`,
    result.dryRun ? "Dry run: nothing was written." : "Written to the database.",
    FINELI_CREDIT,
  ];
  return lines.join("\n");
}
