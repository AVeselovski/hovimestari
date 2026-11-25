import { parse } from "csv-parse/sync";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

// The file layer of the Fineli import: finding a file in a release folder,
// decoding it, and reading named columns of it. Columns are found by name,
// never by position, and anything missing is a ReleaseError naming the file
// and the column or row.

export type Encoding = "utf-8" | "windows-1252";
export type Row = Record<string, string>;

/** A release the importer cannot read. The message names the file, and the column or row. */
export class ReleaseError extends Error {
  override name = "ReleaseError";
}

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
export function decode(bytes: Buffer, file = "The file"): { text: string; encoding: Encoding } {
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
          `If the file really is Windows-1252, the check in releaseFiles.ts (MAX_UTF8_SEQUENCES_IN_WINDOWS_1252, now ${MAX_UTF8_SEQUENCES_IN_WINDOWS_1252}) needs adjusting.`,
      );
    }
    const text = bytes.toString("latin1").replace(/[\u0080-\u009f]/g, (c) => CP1252_HIGH[c.charCodeAt(0) - 0x80]);
    return { text, encoding: "windows-1252" };
  }
}

/** The file `name` in `dir`, matched without regard to case. */
export function findFile(dir: string, name: string): string | null {
  const exact = path.join(dir, name);
  if (existsSync(exact)) return exact;
  const found = readdirSync(dir).find((f) => f.toLowerCase() === name.toLowerCase());
  return found ? path.join(dir, found) : null;
}

/**
 * Reads `columns` of the semicolon-separated file at `full` into rows keyed
 * by column name. `file` is the name the errors give it.
 */
export function readColumns(
  full: string,
  file: string,
  columns: readonly string[],
  keep: (row: Row) => boolean = () => true,
): { rows: Row[]; encoding: Encoding } {
  const { text, encoding } = decode(readFileSync(full), file);
  let index: Record<string, number> | null = null;
  /** The wanted columns of `record`, trimmed, or a ReleaseError naming the line. */
  const rowOf = (record: string[], line: number): Row => {
    const row: Row = {};
    for (const column of columns) {
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
          for (const column of columns) {
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
