import { afterAll, beforeEach, expect, it } from "@jest/globals";
import path from "node:path";
import { describeWithDb } from "../../../db/__tests__/support/throwawayDb.js";
import { capitalRelease, removeCapitalReleases } from "./support/capitalRelease.js";

// A release written in capitals over a catalogue that already holds Fineli's
// names. An import before the case rule stored such a release's names in
// capitals, so the next import rewrites every one of them once. A change of
// case cannot make a food another food, so it is counted on its own line and
// kept out of the renamed list and the rename guard. Release A is the release
// 18 fixture (fixtures/README.md), here in capitals by a temp copy.

const A = path.resolve("src/scripts/fineliImport/__tests__/fixtures/release-a");
const T1 = new Date("2026-11-01T10:00:00Z");
const T2 = new Date("2026-11-02T10:00:00Z");
const T3 = new Date("2026-11-03T10:00:00Z");
const options = (now: Date) => ({ allowRetire: false, allowRename: false, dryRun: false, now });

type Mod = typeof import("../applyRelease.js") & typeof import("../readRelease.js") & typeof import("../report.js");

await describeWithDb("fineliImportCase", (suite) => {
  const mod = {} as Mod;

  const names = async () =>
    (await suite.client.query("SELECT fineli_id, name, name_en FROM foods ORDER BY fineli_id")).rows as {
      fineli_id: number;
      name: string;
      name_en: string | null;
    }[];
  /** Stores names in capitals, as an import before the case rule did: the Finnish and English names of the foods `which` lists, or of every food. */
  const storeInCapitals = async (which: { fi?: number[]; en?: number[] } = {}) => {
    for (const row of await names()) {
      const fi = !which.fi || which.fi.includes(row.fineli_id);
      const en = !which.en || which.en.includes(row.fineli_id);
      await suite.client.query("UPDATE foods SET name = $2, name_en = $3 WHERE fineli_id = $1", [
        row.fineli_id,
        fi ? row.name.toLocaleUpperCase("fi") : row.name,
        en ? row.name_en?.toLocaleUpperCase("en") : row.name_en,
      ]);
    }
  };

  beforeEach(async () => {
    Object.assign(
      mod,
      await import("../applyRelease.js"),
      await import("../readRelease.js"),
      await import("../report.js"),
    );
    await suite.client.query("TRUNCATE foods CASCADE");
    await mod.applyRelease(suite.db, mod.readRelease(A), options(T1));
  });
  afterAll(removeCapitalReleases);

  it("rewrites capital names in sentence case once, counted apart from renames and past the rename guard", async () => {
    const sentenceCase = await names();
    await storeInCapitals();
    const dir = capitalRelease(A);
    const release = mod.readRelease(dir);
    const first = await mod.applyRelease(suite.db, release, options(T2));
    expect(first.namesChangedInCaseOnly).toBe(16);
    expect(first.renamed).toEqual([]);
    expect(first.foods).toEqual({ inserted: 0, updated: 16, unchanged: 0, revived: 0, archived: 0 });
    expect(await names()).toEqual(sentenceCase);
    const report = mod.formatReport(dir, release, first);
    expect(report).toContain("\nNames changed in case only: 16\nRenamed under the same id: none\n");

    const second = await mod.applyRelease(suite.db, mod.readRelease(dir), options(T3));
    expect(second.namesChangedInCaseOnly).toBe(0);
    expect(second.renamed).toEqual([]);
    expect(second.foods).toEqual({ inserted: 0, updated: 0, unchanged: 16, revived: 0, archived: 0 });
  });

  it("still lists a name that changed in more than case", async () => {
    await storeInCapitals();
    const release = mod.readRelease(capitalRelease(A, { 153: { fi: "KAURAHIUTALE, TÄYSJYVÄ" } }));
    const result = await mod.applyRelease(suite.db, release, options(T2));
    expect(result.renamed).toEqual([{ fineliId: 153, from: "KAURAHIUTALE", to: "Kaurahiutale, täysjyvä" }]);
    expect(result.namesChangedInCaseOnly).toBe(15);
  });

  it("counts an English name changed in case only, and not a food whose English name was rewritten", async () => {
    await storeInCapitals({ fi: [858], en: [11049] });
    const release = mod.readRelease(capitalRelease(A, { 858: { en: "HEN'S EGG, WITHOUT SHELL" } }));
    const result = await mod.applyRelease(suite.db, release, options(T2));
    expect(result.namesChangedInCaseOnly).toBe(1);
    expect(result.renamed).toEqual([]);
    expect(result.foods.updated).toBe(2);
  });
});
