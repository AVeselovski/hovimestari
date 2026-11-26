import { FINELI_PORTION_UNITS, MAX_PORTION_GRAMS, type FineliPortionUnit } from "@hovimestari/types";
import { existsSync, readFileSync } from "node:fs";
import { firstNames } from "./nameCase.js";
import { namesThatDiffer, type NameDifference, type RecipeCountsTable } from "./recipeCounts.js";
import { RECIPE_FILE, recipeCountsOf, type RecipeSource } from "./recipeFile.js";
import { decode, findFile, readColumns, ReleaseError, type Encoding, type Row } from "./releaseFiles.js";

export { ReleaseError } from "./releaseFiles.js";

// Reads an unzipped Fineli open data release into the foods the catalogue
// keeps. Pure: no database. Files and columns are found by name, never by
// position, and anything required that is missing stops the import with the
// file and the column named, so a release in a new layout fails before it
// writes anything.

/** kJ in one kcal: the EU labelling factor. */
export const KJ_PER_KCAL = 4.184;
/** The highest energy and macro values a food may hold per 100 g, as the foods table's CHECK allows. */
export const MAX_ENERGY_KCAL = 1000;
export const MAX_MACRO_G = 100;
/**
 * Fineli marks some names with "(arc)" at the start, in any case. The
 * catalogue reads it as archived and imports such a food retired. The match
 * takes the space after the mark, so it can be dropped from a name.
 */
export const ARCHIVED_MARK = /^\(arc\)\s*/i;

/** The Fineli component codes the catalogue keeps, and the field each fills. */
const COMPONENTS = { ENERC: "energyKj", PROT: "proteinG", CHOAVL: "carbsG", FAT: "fatG" } as const;
type ComponentCode = keyof typeof COMPONENTS;
const COMPONENT_CODES = Object.keys(COMPONENTS) as ComponentCode[];

/** Every file the importer needs, and the columns it reads from each. */
export const REQUIRED = {
  "food.csv": ["FOODID", "FOODTYPE", "PROCESS"],
  "foodname_FI.csv": ["FOODID", "FOODNAME"],
  "foodname_EN.csv": ["FOODID", "FOODNAME"],
  "component_value.csv": ["FOODID", "EUFDNAME", "BESTLOC"],
  "foodaddunit.csv": ["FOODID", "FOODUNIT", "MASS"],
} as const;
type FileName = keyof typeof REQUIRED;

export interface FineliPortion {
  unit: FineliPortionUnit;
  grams: number;
}

export interface FineliFood {
  fineliId: number;
  name: string;
  nameEn: string | null;
  fineliType: string;
  fineliProcess: string;
  energyKcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  /** The Finnish name starts with "(arc)", in any case. */
  archived: boolean;
  /** How many of the release's recipes use this food. 0 when none does, and when the release has no counts. */
  recipeUses: number;
  /** For a food with a recipe: its ingredient rows besides water and salt. Null without a recipe. */
  recipeFoods: number | null;
  portions: FineliPortion[];
}

export interface SkippedFood {
  fineliId: number;
  name: string | null;
  reason: string;
}

export interface Release {
  /** The release number from descript.txt, when the release has one. */
  label: string | null;
  /** The encoding each file was read in. The recipe file has one only when the folder holds it. */
  encodings: Record<FileName, Encoding> & { [RECIPE_FILE]?: Encoding };
  /** Every food in food.csv, in its order, minus those left out. */
  foods: FineliFood[];
  /** Foods left out, each with the reason. */
  skipped: SkippedFood[];
  /** Household measures left out, counted by reason. */
  skippedPortions: Record<string, number>;
  /**
   * Where the recipe counts came from, the folder's own recipe file or the
   * counts handed to readRelease, and what the report says about them. Null
   * when there is no source: every food then reads 0 and null, and the
   * import leaves the stored counts as they are.
   */
  recipeCounts: RecipeCountsSummary | null;
}

/** A release's source of recipe counts, with how its counts meet the foods of food.csv. */
export type RecipeCountsSummary = RecipeSource & {
  /** Foods in food.csv that have either count, left-out foods among them. */
  foodsWithCount: number;
  /** Ids the counts name that food.csv does not list. */
  idsNotInRelease: number;
  /**
   * With committed counts: those of their release's most used foods that this
   * folder's release names differently, or lacks. An id that names another
   * food here would carry the wrong counts. Empty for a folder's own file.
   */
  namesThatDiffer: NameDifference[];
};

const KEPT_UNITS: ReadonlySet<string> = new Set(FINELI_PORTION_UNITS);

/** A Fineli number: a decimal comma or point, no sign. Empty is null, anything else unreadable is NaN. */
export function parseDecimal(raw: string): number | null {
  const s = raw.trim();
  if (s === "") return null;
  return /^\d+([.,]\d+)?$/.test(s) ? Number(s.replace(",", ".")) : Number.NaN;
}

const round = (value: number, decimals: number) => {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
};

/** component_value.csv holds every nutrient of every food. Only the four the catalogue keeps are read. */
export const keepComponent = (row: Row) => row.EUFDNAME in COMPONENTS;

/**
 * Reads one required file into rows keyed by its required column names.
 * `keep` drops rows while parsing, so a large file never sits in memory whole.
 */
export function readTable(
  dir: string,
  file: FileName,
  keep: (row: Row) => boolean = () => true,
): { rows: Row[]; encoding: Encoding } {
  const full = findFile(dir, file);
  if (!full) throw new ReleaseError(`${file} is missing from ${dir}.`);
  return readColumns(full, file, REQUIRED[file], keep);
}

/** Rows grouped by FOODID. */
function byFood(rows: Row[]): Map<string, Row[]> {
  const map = new Map<string, Row[]>();
  for (const row of rows) {
    const list = map.get(row.FOODID);
    if (list) list.push(row);
    else map.set(row.FOODID, [row]);
  }
  return map;
}

/**
 * The release number on the "Release." line of descript.txt, if there is one.
 * The file is optional and only names the release, so a file that cannot be
 * read gives no label rather than stopping the import.
 */
function releaseLabel(dir: string): string | null {
  const file = findFile(dir, "descript.txt");
  if (!file) return null;
  let text: string;
  try {
    text = decode(readFileSync(file), "descript.txt").text;
  } catch (err) {
    if (err instanceof ReleaseError) return null;
    throw err;
  }
  const match = /Release\.\s*([^\r\n]+)/.exec(text);
  return match ? match[1].trim() : null;
}

/** The four values of one food in kcal and grams, or why it is left out. */
function valuesOf(rows: Row[]): { kcal: number; protein: number; carbs: number; fat: number } | string {
  const raw = new Map<string, string>();
  for (const row of rows) if (row.EUFDNAME in COMPONENTS) raw.set(row.EUFDNAME, row.BESTLOC);
  const missing = COMPONENT_CODES.filter((code) => parseDecimal(raw.get(code) ?? "") === null);
  if (missing.length > 0) return `no ${missing.join(", ")} value`;
  const unreadable = COMPONENT_CODES.filter((code) => Number.isNaN(parseDecimal(raw.get(code) ?? "")));
  if (unreadable.length > 0) return `unreadable ${unreadable.map((c) => `${c} "${raw.get(c)}"`).join(", ")}`;
  const value = (code: ComponentCode) => parseDecimal(raw.get(code) ?? "") as number;
  const kcal = round(value("ENERC") / KJ_PER_KCAL, 2);
  if (kcal > MAX_ENERGY_KCAL) return `ENERC ${raw.get("ENERC")} kJ is above ${MAX_ENERGY_KCAL} kcal`;
  const [protein, carbs, fat] = (["PROT", "CHOAVL", "FAT"] as const).map((c) => round(value(c), 3));
  const over = (["PROT", "CHOAVL", "FAT"] as const).filter((c) => round(value(c), 3) > MAX_MACRO_G);
  if (over.length > 0) return `${over.join(", ")} above ${MAX_MACRO_G} g`;
  return { kcal, protein, carbs, fat };
}

/**
 * Reads the release in `dir`. Throws ReleaseError on a missing file or
 * column. `fallback` gives the recipe counts when the folder has no recipe
 * file of its own, and is ignored when it has one.
 */
export function readRelease(dir: string, fallback?: RecipeCountsTable): Release {
  if (!existsSync(dir)) throw new ReleaseError(`The folder ${dir} does not exist.`);
  const tables = {} as Record<FileName, Row[]>;
  const encodings = {} as Release["encodings"];
  for (const file of Object.keys(REQUIRED) as FileName[]) {
    const keep = file === "component_value.csv" ? keepComponent : undefined;
    const { rows, encoding } = readTable(dir, file, keep);
    tables[file] = rows;
    encodings[file] = encoding;
  }
  const finnish = firstNames(tables["foodname_FI.csv"], "fi");
  const english = firstNames(tables["foodname_EN.csv"], "en");
  const values = byFood(tables["component_value.csv"]);
  const units = byFood(tables["foodaddunit.csv"]);
  // Before the recipe file is read, which reads food.csv again: a bad id here is food.csv's fault, and its
  // message must not end with the advice about the recipe file.
  tables["food.csv"].forEach((row, n) => {
    if (!/^\d+$/.test(row.FOODID))
      throw new ReleaseError(`food.csv row ${n + 2} has FOODID "${row.FOODID}", which is not a number.`);
  });
  const recipes = recipeCountsOf(dir, fallback);
  if (recipes.source?.from === "release") encodings[RECIPE_FILE] = recipes.source.encoding;

  const foods: FineliFood[] = [];
  const skipped: SkippedFood[] = [];
  const skippedPortions: Record<string, number> = {};
  const seen = new Set<string>();
  const countPortion = (reason: string) => (skippedPortions[reason] = (skippedPortions[reason] ?? 0) + 1);

  tables["food.csv"].forEach((row) => {
    const id = row.FOODID;
    if (seen.has(id)) throw new ReleaseError(`food.csv lists FOODID ${id} twice.`);
    seen.add(id);
    const fineliId = Number(id);
    const name = finnish.get(id) ?? null;
    if (!name) {
      skipped.push({ fineliId, name, reason: "no Finnish name" });
      return;
    }
    const v = valuesOf(values.get(id) ?? []);
    if (typeof v === "string") {
      skipped.push({ fineliId, name, reason: v });
      return;
    }

    const portions: FineliPortion[] = [];
    for (const unitRow of units.get(id) ?? []) {
      const unit = unitRow.FOODUNIT;
      if (!KEPT_UNITS.has(unit)) {
        countPortion(`unit ${unit || "(empty)"} is not one the catalogue keeps`);
        continue;
      }
      const mass = parseDecimal(unitRow.MASS);
      const grams = mass === null ? Number.NaN : round(mass, 1);
      if (!(grams > 0 && grams <= MAX_PORTION_GRAMS)) {
        countPortion(`weight "${unitRow.MASS}" is not above 0 g and at most ${MAX_PORTION_GRAMS} g`);
        continue;
      }
      if (portions.some((p) => p.unit === unit)) {
        countPortion(`a second ${unit} for one food`);
        continue;
      }
      portions.push({ unit: unit as FineliPortionUnit, grams });
    }

    foods.push({
      fineliId,
      name,
      nameEn: english.get(id) ?? null,
      fineliType: row.FOODTYPE,
      fineliProcess: row.PROCESS,
      energyKcal: v.kcal,
      proteinG: v.protein,
      carbsG: v.carbs,
      fatG: v.fat,
      archived: ARCHIVED_MARK.test(name),
      recipeUses: recipes.counts.get(fineliId)?.uses ?? 0,
      recipeFoods: recipes.counts.get(fineliId)?.foods ?? null,
      portions,
    });
  });

  const listed = new Set([...seen].map(Number));
  const recipeCounts: RecipeCountsSummary | null = recipes.source && {
    ...recipes.source,
    foodsWithCount: [...recipes.counts.keys()].filter((id) => listed.has(id)).length,
    idsNotInRelease: [...recipes.counts.keys()].filter((id) => !listed.has(id)).length,
    namesThatDiffer:
      recipes.source.from === "committed" && fallback
        ? namesThatDiffer(fallback, (id) => finnish.get(String(id)) ?? null)
        : [],
  };
  return {
    label: releaseLabel(dir),
    encodings,
    foods,
    skipped,
    skippedPortions,
    recipeCounts,
  };
}
