import { FINELI_PORTION_UNITS, MAX_PORTION_GRAMS, type FineliPortionUnit } from "@hovimestari/types";
import { parse } from "csv-parse/sync";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

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
/** Fineli marks some names with this prefix. The catalogue reads it as archived and imports such a food retired. */
export const ARCHIVED_PREFIX = "(arc)";

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
  /** The Finnish name starts with "(arc)". */
  archived: boolean;
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
  /** The encoding each file was read in. */
  encodings: Record<FileName, "utf-8" | "windows-1252">;
  /** Every food in food.csv, in its order, minus those left out. */
  foods: FineliFood[];
  /** Foods left out, each with the reason. */
  skipped: SkippedFood[];
  /** Household measures left out, counted by reason. */
  skippedPortions: Record<string, number>;
}

/** A release the importer cannot read. The message names the file, and the column or row. */
export class ReleaseError extends Error {
  override name = "ReleaseError";
}

const KEPT_UNITS: ReadonlySet<string> = new Set(FINELI_PORTION_UNITS);

// Windows-1252's characters for the bytes 0x80 to 0x9F, where it differs from
// Latin-1, as the WHATWG encoding standard maps them. Node 22's TextDecoder
// decodes "windows-1252" as Latin-1 and turns these bytes into control
// characters, so they are mapped here.
const CP1252_HIGH = "€\u0081‚ƒ„…†‡ˆ‰Š‹Œ\u008dŽ\u008f" + "\u0090‘’“”•–—˜™š›œ\u009džŸ";

/**
 * How many valid UTF-8 multibyte sequences a file may hold and still be read
 * as Windows-1252. Release 18's Windows-1252 files hold none, and a UTF-8
 * name file holds about a thousand.
 */
export const MAX_UTF8_SEQUENCES_IN_WINDOWS_1252 = 10;
const UTF8_SEQUENCE = /[\xC2-\xDF][\x80-\xBF]|[\xE0-\xEF][\x80-\xBF]{2}|[\xF0-\xF4][\x80-\xBF]{3}/g;

/**
 * UTF-8 when the bytes decode strictly as UTF-8, else Windows-1252 (a superset
 * of Latin-1). A BOM is dropped. A file that fails strict UTF-8 but holds many
 * valid UTF-8 sequences is a damaged UTF-8 file, and reading it as
 * Windows-1252 would garble every accented name, so it is refused.
 */
export function decode(bytes: Buffer, file = "The file"): { text: string; encoding: "utf-8" | "windows-1252" } {
  try {
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(bytes), encoding: "utf-8" };
  } catch {
    const sequences = bytes.toString("latin1").match(UTF8_SEQUENCE)?.length ?? 0;
    if (sequences > MAX_UTF8_SEQUENCES_IN_WINDOWS_1252) {
      const loose = new TextDecoder("utf-8").decode(bytes);
      const line = loose.slice(0, loose.indexOf("\uFFFD")).split("\n").length;
      throw new ReleaseError(
        `${file} holds ${sequences} UTF-8 characters but also bytes that are not valid UTF-8, first on line ${line}. ` +
          "It looks like a damaged UTF-8 file. Download and unzip the release again. " +
          `If the file really is Windows-1252, the check in readRelease.ts (MAX_UTF8_SEQUENCES_IN_WINDOWS_1252, now ${MAX_UTF8_SEQUENCES_IN_WINDOWS_1252}) needs adjusting.`,
      );
    }
    const text = bytes.toString("latin1").replace(/[\u0080-\u009f]/g, (c) => CP1252_HIGH[c.charCodeAt(0) - 0x80]);
    return { text, encoding: "windows-1252" };
  }
}

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

/** The file `name` in `dir`, matched without regard to case. */
function findFile(dir: string, name: string): string | null {
  const exact = path.join(dir, name);
  if (existsSync(exact)) return exact;
  const found = readdirSync(dir).find((f) => f.toLowerCase() === name.toLowerCase());
  return found ? path.join(dir, found) : null;
}

export type Row = Record<string, string>;

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
): { rows: Row[]; encoding: "utf-8" | "windows-1252" } {
  const full = findFile(dir, file);
  if (!full) throw new ReleaseError(`${file} is missing from ${dir}.`);
  const { text, encoding } = decode(readFileSync(full), file);
  let index: Record<string, number> | null = null;
  /** The required columns of `record`, trimmed, or a ReleaseError naming the line. */
  const rowOf = (record: string[], line: number): Row => {
    const row: Row = {};
    for (const column of REQUIRED[file]) {
      const value = record[(index as Record<string, number>)[column]];
      if (value === undefined) throw new ReleaseError(`${file} row ${line} has no ${column} value.`);
      row[column] = value.trim();
    }
    return row;
  };
  const rows: Row[] = [];
  try {
    parse(text, {
      delimiter: ";",
      skip_empty_lines: true,
      relax_quotes: true,
      bom: true,
      // Each record becomes a row here and the parser keeps none, so only the kept rows stay in memory.
      on_record: (record, { lines }) => {
        if (!index) {
          const header = record.map((h) => h.trim().toUpperCase());
          if (header.length === 1)
            throw new ReleaseError(
              `${file} does not look separated by semicolons: its header row is one field, "${record[0]}". Fineli's files separate values with ";".`,
            );
          index = {};
          for (const column of REQUIRED[file]) {
            const at = header.indexOf(column);
            if (at < 0)
              throw new ReleaseError(
                `${file} has no ${column} column. Its columns are: ${header.join(", ") || "none"}.`,
              );
            index[column] = at;
          }
          return null;
        }
        const row = rowOf(record, lines);
        if (keep(row)) rows.push(row);
        return null;
      },
    });
  } catch (err) {
    if (err instanceof ReleaseError) throw err;
    throw new ReleaseError(`${file} could not be read: ${(err as Error).message}`);
  }
  if (!index) throw new ReleaseError(`${file} is empty. It has no header row.`);
  return { rows, encoding };
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

/** The first FOODNAME per FOODID. */
function names(rows: Row[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of rows) if (row.FOODNAME && !map.has(row.FOODID)) map.set(row.FOODID, row.FOODNAME);
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

/** Reads the release in `dir`. Throws ReleaseError on a missing file or column. */
export function readRelease(dir: string): Release {
  if (!existsSync(dir)) throw new ReleaseError(`The folder ${dir} does not exist.`);
  const tables = {} as Record<FileName, Row[]>;
  const encodings = {} as Release["encodings"];
  for (const file of Object.keys(REQUIRED) as FileName[]) {
    const keep = file === "component_value.csv" ? keepComponent : undefined;
    const { rows, encoding } = readTable(dir, file, keep);
    tables[file] = rows;
    encodings[file] = encoding;
  }
  const finnish = names(tables["foodname_FI.csv"]);
  const english = names(tables["foodname_EN.csv"]);
  const values = byFood(tables["component_value.csv"]);
  const units = byFood(tables["foodaddunit.csv"]);

  const foods: FineliFood[] = [];
  const skipped: SkippedFood[] = [];
  const skippedPortions: Record<string, number> = {};
  const seen = new Set<string>();
  const countPortion = (reason: string) => (skippedPortions[reason] = (skippedPortions[reason] ?? 0) + 1);

  tables["food.csv"].forEach((row, n) => {
    const id = row.FOODID;
    if (!/^\d+$/.test(id)) throw new ReleaseError(`food.csv row ${n + 2} has FOODID "${id}", which is not a number.`);
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
      archived: name.startsWith(ARCHIVED_PREFIX),
      portions,
    });
  });

  return { label: releaseLabel(dir), encodings, foods, skipped, skippedPortions };
}
