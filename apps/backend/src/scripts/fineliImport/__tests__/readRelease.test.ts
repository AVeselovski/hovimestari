import { afterAll, describe, expect, it } from "@jest/globals";
import { cpSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { decode, keepComponent, parseDecimal, readRelease, readTable, ReleaseError } from "../readRelease.js";
import { capitalRelease, removeCapitalReleases } from "./support/capitalRelease.js";

// The fixtures are rows of Fineli release 18 in its own format (see
// fixtures/README.md). Each test that needs a broken release copies one into
// a temp folder and breaks the copy.

const FIXTURES = path.resolve("src/scripts/fineliImport/__tests__/fixtures");
const releaseA = path.join(FIXTURES, "release-a");
const temps: string[] = [];

/** A temp copy of release A, changed by `edit`. */
function brokenCopy(edit: (dir: string) => void): string {
  const dir = mkdtempSync(path.join(tmpdir(), "fineli-"));
  temps.push(dir);
  cpSync(releaseA, dir, { recursive: true });
  edit(dir);
  return dir;
}

afterAll(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
  removeCapitalReleases();
});

describe("readRelease on release A", () => {
  const release = readRelease(releaseA);
  const food = (id: number) => release.foods.find((f) => f.fineliId === id);

  it("reads the release label from descript.txt", () => {
    expect(release.label).toBe("18.0");
  });

  it("detects each file's encoding: Windows-1252 name files, plain ASCII value files", () => {
    expect(release.encodings).toEqual({
      "food.csv": "windows-1252",
      "foodname_FI.csv": "windows-1252",
      "foodname_EN.csv": "windows-1252",
      "component_value.csv": "utf-8",
      "foodaddunit.csv": "utf-8",
    });
  });

  it("keeps 16 of the 18 foods, in the file's order", () => {
    expect(release.foods).toHaveLength(16);
    expect(release.foods[0].fineliId).toBe(1);
  });

  it("converts the quark's 248,17 kJ to 59.31 kcal, and reads its macros with decimal commas", () => {
    expect(food(622)).toMatchObject({
      name: "Rahka, maitorahka, maustamaton, rasvaa <0,5 %",
      nameEn: "Quark, <0.5% fat",
      fineliType: "FOOD",
      fineliProcess: "IND",
      energyKcal: 59.31,
      proteinG: 9.81,
      carbsG: 3,
      fatG: 0.4,
      archived: false,
    });
  });

  it("decodes Windows-1252 letters in names", () => {
    expect(food(663)?.name).toBe("Jäätelö, kermajäätelö");
    expect(food(655)?.name).toContain("småland");
  });

  it("reads household measures as portions", () => {
    expect(food(622)?.portions).toEqual([
      { unit: "DL", grams: 100 },
      { unit: "RKL", grams: 15 },
      { unit: "TL", grams: 5 },
      { unit: "PORTM", grams: 200 },
      { unit: "PORTL", grams: 250 },
      { unit: "PORTS", grams: 125 },
    ]);
    expect(food(858)?.portions).toContainEqual({ unit: "KPL_M", grams: 55 });
  });

  it("leaves out a food missing one of the four values, and says which", () => {
    expect(food(29)).toBeUndefined();
    expect(release.skipped).toEqual([
      { fineliId: 29, name: "Lihaliemi, laimennettu", reason: "no PROT value" },
      { fineliId: 11184, name: "Kaneli", reason: "no ENERC, PROT, CHOAVL, FAT value" },
    ]);
  });

  it("skips and counts a unit the catalogue does not keep, and a weight above 5000 g", () => {
    expect(food(858)?.portions.map((p) => p.unit)).not.toContain("PORTTBL");
    expect(food(752)?.portions.map((p) => p.unit)).toEqual(["KPL_S", "PORTS", "PORTM", "PORTL"]);
    expect(release.skippedPortions).toEqual({
      "unit PORTTBL is not one the catalogue keeps": 1,
      'weight "6000,00" is not above 0 g and at most 5000 g': 1,
      'weight "8000,00" is not above 0 g and at most 5000 g': 1,
    });
  });

  it("marks a food whose name starts with (arc) as archived", () => {
    expect(food(572)).toMatchObject({ archived: true });
    expect(release.foods.filter((f) => f.archived)).toHaveLength(1);
  });
});

describe("readRelease on a release written in capitals", () => {
  const plain = readRelease(releaseA);

  it("reads release A in capitals to the very foods release A reads to", () => {
    const caps = readRelease(capitalRelease(releaseA));
    expect(caps.foods).toEqual(plain.foods);
    expect(caps.skipped).toEqual(plain.skipped);
  });

  it("writes capital names in sentence case and keeps every other name as written", () => {
    const release = readRelease(
      capitalRelease(releaseA, {
        1: { fi: "Sokeri, VL", en: "Sugar, VL" },
        153: { fi: "1 % KAURAHIUTALE", en: "4-GRAIN FLAKES" },
        600: { en: "MILK, 1 µG VITAMIN D" },
        655: { en: "CHEESE, İSKENDER" },
        661: { fi: "ÄIDINMAITO, RINTAMAITO" },
        663: { fi: "JÄÄTELÖ, KERMAJÄÄTELÖ, ÅLAND" },
        664: { fi: "KIISSELI, MUSTIKKA" },
        752: { en: "TURKEY, WEIßWURST STYLE" },
        858: { fi: "KANANMUNA, KEITETTY", en: "EGG, BOILED" },
      }),
    );
    const names = Object.fromEntries(release.foods.map((f) => [f.fineliId, [f.name, f.nameEn]]));
    expect(names).toMatchObject({
      1: ["Sokeri, VL", "Sugar, VL"],
      153: ["1 % kaurahiutale", "4-grain flakes"],
      572: ["(arc) margariini 40%, lätta", "Margarine 40%, lätta"],
      600: [expect.any(String), "Milk, 1 µg vitamin d"],
      606: ["Maito, rasvaton, d-vitamiinia 1 ug", "Milk, 0% fat, i ug added vitamin d"],
      655: ["Juusto, puolikova juusto, rasvaa 25-35 %, lappi/småland/billinge/rustholli", "Cheese, i\u0307skender"],
      661: ["Äidinmaito, rintamaito", "Soft ice cream with wafer"],
      663: ["Jäätelö, kermajäätelö, åland", "Ice cream, cream based"],
      664: ["Kiisseli, mustikka", expect.any(String)],
      752: ["Kalkkuna nahkoineen", "Turkey, weißwurst style"],
      858: ["Kananmuna, keitetty", "Egg, boiled"],
    });
  });

  it('retires a food whose name starts with "(ARC)" in capitals, in a name that is not all capitals too', () => {
    const release = readRelease(capitalRelease(releaseA, { 604: { fi: "(ARC) Maito, kutunmaito, vuohenmaito" } }));
    const archived = release.foods.filter((f) => f.archived).map((f) => [f.fineliId, f.name]);
    expect(archived).toEqual([
      [572, "(arc) margariini 40%, lätta"],
      [604, "(ARC) Maito, kutunmaito, vuohenmaito"],
    ]);
  });
});

describe("readTable", () => {
  it("keeps only the rows asked for while it parses, so component values hold four codes per food", () => {
    const all = readTable(releaseA, "component_value.csv").rows;
    const kept = readTable(releaseA, "component_value.csv", keepComponent).rows;
    expect(new Set(all.map((r) => r.EUFDNAME)).size).toBe(8);
    expect([...new Set(kept.map((r) => r.EUFDNAME))].sort()).toEqual(["CHOAVL", "ENERC", "FAT", "PROT"]);
    expect(kept.length).toBeLessThan(all.length);
  });
});

describe("readRelease on other encodings and line ends", () => {
  it("reads UTF-8 name files (one with a BOM) and LF line ends to the same foods", () => {
    const latin = readRelease(releaseA);
    const utf8 = readRelease(path.join(FIXTURES, "release-utf8"));
    expect(utf8.encodings["foodname_FI.csv"]).toBe("utf-8");
    expect(utf8.foods).toEqual(latin.foods);
    expect(utf8.skipped).toEqual(latin.skipped);
  });

  it("finds a file whatever the case of its name", () => {
    const dir = brokenCopy((d) => {
      cpSync(path.join(d, "food.csv"), path.join(d, "FOOD.CSV"));
      unlinkSync(path.join(d, "food.csv"));
    });
    expect(readRelease(dir).foods).toHaveLength(16);
  });
});

describe("readRelease refuses a release it cannot read", () => {
  it("names a missing file", () => {
    const dir = brokenCopy((d) => unlinkSync(path.join(d, "foodaddunit.csv")));
    expect(() => readRelease(dir)).toThrow(ReleaseError);
    expect(() => readRelease(dir)).toThrow(`foodaddunit.csv is missing from ${dir}.`);
  });

  it("names a missing column and lists the columns it found", () => {
    const dir = brokenCopy((d) => {
      const file = path.join(d, "component_value.csv");
      writeFileSync(file, readFileSync(file, "latin1").replace("BESTLOC", "VALUE"), "latin1");
    });
    expect(() => readRelease(dir)).toThrow(
      "component_value.csv has no BESTLOC column. Its columns are: FOODID, EUFDNAME, VALUE, ACQTYPE, METHTYPE.",
    );
  });

  it("refuses a UTF-8 name file with a stray byte, naming the file and the line, instead of garbling every name", () => {
    const dir = brokenCopy((d) => {
      const utf8 = readFileSync(path.join(FIXTURES, "release-utf8", "foodname_FI.csv"));
      const lines = utf8.toString("latin1").split("\r\n");
      lines[2] = lines[2] + "\xe4";
      writeFileSync(path.join(d, "foodname_FI.csv"), Buffer.from(lines.join("\r\n"), "latin1"));
    });
    expect(() => readRelease(dir)).toThrow(
      "foodname_FI.csv holds 24 UTF-8 characters but also bytes that are not valid UTF-8, first on line 3. " +
        "It looks like a damaged UTF-8 file. Download and unzip the release again. " +
        "If the file really is Windows-1252, the check in readRelease.ts (MAX_UTF8_SEQUENCES_IN_WINDOWS_1252, now 10) needs adjusting.",
    );
  });

  it("reads a release whose optional descript.txt is damaged, with no release label", () => {
    const dir = brokenCopy((d) => {
      const damaged = Buffer.concat([
        Buffer.from("Versio. Release. 19.0 " + "ä".repeat(20), "utf8"),
        Buffer.from([0xe4]),
      ]);
      writeFileSync(path.join(d, "descript.txt"), damaged);
    });
    const release = readRelease(dir);
    expect(release.label).toBeNull();
    expect(release.foods).toHaveLength(16);
  });

  it("says a file is not semicolon-separated when its header is one field", () => {
    const dir = brokenCopy((d) => {
      const file = path.join(d, "food.csv");
      writeFileSync(file, readFileSync(file, "latin1").replaceAll(";", ","), "latin1");
    });
    expect(() => readRelease(dir)).toThrow(
      'food.csv does not look separated by semicolons: its header row is one field, "FOODID,FOODNAME,FOODTYPE,PROCESS,EDPORT,IGCLASS,IGCLASSP,FUCLASS,FUCLASSP".',
    );
  });

  it("names a folder that does not exist", () => {
    expect(() => readRelease("/nonexistent/fineli")).toThrow("The folder /nonexistent/fineli does not exist.");
  });

  it("refuses a food listed twice", () => {
    const dir = brokenCopy((d) => {
      const file = path.join(d, "food.csv");
      const text = readFileSync(file, "latin1");
      writeFileSync(file, text + text.split("\r\n")[1] + "\r\n", "latin1");
    });
    expect(() => readRelease(dir)).toThrow("food.csv lists FOODID 1 twice.");
  });

  it("leaves out a food with an unreadable value, quoting it", () => {
    const dir = brokenCopy((d) => {
      const file = path.join(d, "component_value.csv");
      writeFileSync(file, readFileSync(file, "latin1").replace("622;PROT;9,81", "622;PROT;9.8.1"), "latin1");
    });
    expect(readRelease(dir).skipped).toContainEqual({
      fineliId: 622,
      name: "Rahka, maitorahka, maustamaton, rasvaa <0,5 %",
      reason: 'unreadable PROT "9.8.1"',
    });
  });
});

describe("parseDecimal and decode", () => {
  it.each([
    ["1698,30", 1698.3],
    ["0", 0],
    ["9.81", 9.81],
    [" 3,000 ", 3],
  ])("reads %p as %p", (raw, value) => {
    expect(parseDecimal(raw)).toBe(value);
  });

  it("reads an empty value as missing and a signed or malformed one as unreadable", () => {
    expect(parseDecimal("")).toBeNull();
    expect(parseDecimal("-1,0")).toBeNaN();
    expect(parseDecimal("1,2,3")).toBeNaN();
    expect(parseDecimal("<0,1")).toBeNaN();
  });

  it("reads a Windows-1252 file with a few UTF-8-looking byte pairs as Windows-1252", () => {
    // "Ã©" is 0xC3 0xA9 in Windows-1252, which is also "é" in UTF-8. Up to ten such pairs are tolerated.
    const bytes = Buffer.from("Jää " + "Ã©".repeat(10), "latin1");
    expect(decode(bytes)).toEqual({ text: "Jää " + "Ã©".repeat(10), encoding: "windows-1252" });
  });

  it("decodes strict UTF-8 as UTF-8 and anything else as Windows-1252", () => {
    expect(decode(Buffer.from("Jäätelö", "utf8"))).toEqual({ text: "Jäätelö", encoding: "utf-8" });
    expect(decode(Buffer.from([0x4a, 0xe4, 0xe4, 0x80]))).toEqual({ text: "Jää€", encoding: "windows-1252" });
  });
});
