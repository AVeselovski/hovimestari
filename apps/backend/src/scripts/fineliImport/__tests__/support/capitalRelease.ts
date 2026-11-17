import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { decode } from "../../readRelease.js";

// A release written in capitals, as Fineli writes its later releases: a temp
// copy of a fixture release with both name files upper-cased, written as
// UTF-8 with CRLF line ends. `names` gives a food's name in a file as written,
// for the cases a plain upper-casing cannot make. No Fineli data is committed
// for it: the copy is made from the release 18 fixtures and removed after.

export type NameOverrides = Record<number, { fi?: string; en?: string }>;

const temps: string[] = [];

/** Rewrites `file` in `dir`, upper-casing every FOODNAME in `locale` unless `override` gives the name. */
function rewrite(dir: string, file: string, locale: "fi" | "en", override: (id: number) => string | undefined) {
  const full = path.join(dir, file);
  const [header, ...rows] = decode(readFileSync(full)).text.split("\r\n");
  const lines = rows.map((row) => {
    if (row === "") return row;
    const [id, name, ...rest] = row.split(";");
    return [id, override(Number(id)) ?? name.toLocaleUpperCase(locale), ...rest].join(";");
  });
  writeFileSync(full, [header, ...lines].join("\r\n"), "utf8");
}

/** A temp copy of the release in `from` with its names in capitals, but for `names`. */
export function capitalRelease(from: string, names: NameOverrides = {}): string {
  const dir = mkdtempSync(path.join(tmpdir(), "fineli-caps-"));
  temps.push(dir);
  cpSync(from, dir, { recursive: true });
  rewrite(dir, "foodname_FI.csv", "fi", (id) => names[id]?.fi);
  rewrite(dir, "foodname_EN.csv", "en", (id) => names[id]?.en);
  return dir;
}

/** Removes every copy made so far. */
export function removeCapitalReleases(): void {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
}
