import { beforeEach, describe, expect, it } from "@jest/globals";
import path from "node:path";
import { describeWithDb } from "../../../db/__tests__/support/throwawayDb.js";
import type { Db } from "../../../db/types.js";
import type { FineliFood, Release } from "../readRelease.js";

// The import's less travelled paths on a real database: retirement for a
// value the release no longer gives, "(arc)" foods whose values change, the
// lock, a dry run over a full catalogue, the report's sums and the command's
// failure messages. Releases here are release A (fixtures/README.md), read
// once and changed in memory.

const A = path.resolve("src/scripts/fineliImport/__tests__/fixtures/release-a");
const B = path.resolve("src/scripts/fineliImport/__tests__/fixtures/release-b");
const T1 = new Date("2026-11-01T10:00:00Z");
const T2 = new Date("2026-11-02T10:00:00Z");
const options = (now: Date) => ({ allowRetire: false, allowRename: false, dryRun: false, now });

type Mod = typeof import("../applyRelease.js") &
  typeof import("../readRelease.js") &
  typeof import("../cli.js") &
  typeof import("../report.js");

await describeWithDb("fineliImportEdges", (suite) => {
  const mod = {} as Mod;
  let releaseA: Release;

  /** Release A with food `fineliId` changed by `edit`. */
  const withFood = (fineliId: number, edit: (f: FineliFood) => FineliFood): Release => ({
    ...releaseA,
    foods: releaseA.foods.map((f) => (f.fineliId === fineliId ? edit(f) : f)),
  });
  const row = async (fineliId: number) =>
    (
      await suite.client.query("SELECT id, name, energy_kcal, retired_at, updated_at FROM foods WHERE fineli_id = $1", [
        fineliId,
      ])
    ).rows[0];
  const snapshot = async () =>
    (
      await suite.client.query(
        `SELECT 'f' AS t, id, updated_at, retired_at::text AS extra FROM foods
         UNION ALL SELECT 'p', id, updated_at, grams::text FROM food_portions ORDER BY 1, 2`,
      )
    ).rows;

  beforeEach(async () => {
    Object.assign(
      mod,
      await import("../applyRelease.js"),
      await import("../readRelease.js"),
      await import("../cli.js"),
      await import("../report.js"),
    );
    releaseA = mod.readRelease(A);
    await suite.client.query("TRUNCATE foods CASCADE");
    await mod.applyRelease(suite.db, releaseA, options(T1));
  });

  describe("a known food the release now leaves out", () => {
    it("is retired, and counted and named apart from foods gone from the release", async () => {
      const blanked: Release = {
        ...releaseA,
        foods: releaseA.foods.filter((f) => f.fineliId !== 1),
        skipped: [...releaseA.skipped, { fineliId: 1, name: "Sokeri", reason: "no PROT value" }],
      };
      const result = await mod.applyRelease(suite.db, blanked, options(T2));
      expect(result.retired).toEqual({
        absent: 0,
        leftOut: [{ fineliId: 1, name: "Sokeri", reason: "no PROT value" }],
      });
      expect((await row(1)).retired_at).toEqual(T2);
      const report = mod.formatReport(A, blanked, result);
      expect(report).toContain("  No longer in the release: 0");
      expect(report).toContain("  Still in the release, but without usable values: 1\n    1 Sokeri: no PROT value");
    });
  });

  describe('a food named "(arc)" whose values change', () => {
    it("keeps the date it was first retired, and takes the new values", async () => {
      const before = await row(572);
      const result = await mod.applyRelease(
        suite.db,
        withFood(572, (f) => ({ ...f, energyKcal: 700 })),
        options(T2),
      );
      expect(result.foods).toMatchObject({ updated: 1, archived: 0 });
      const after = await row(572);
      expect(after).toMatchObject({ id: before.id, energy_kcal: "700.00", retired_at: T1, updated_at: T2 });
    });

    it('retires a live food that gains "(arc)" and new values, and does not list it as renamed', async () => {
      const result = await mod.applyRelease(
        suite.db,
        withFood(1, (f) => ({ ...f, name: `(arc) ${f.name}`, archived: true, energyKcal: 400 })),
        options(T2),
      );
      expect(result.foods).toMatchObject({ archived: 1, updated: 0 });
      expect(result.renamed).toEqual([]);
      expect(await row(1)).toMatchObject({ name: "(arc) Sokeri", energy_kcal: "400.00", retired_at: T2 });
    });
  });

  describe("the rename guard", () => {
    /** Release A with the first `n` live foods renamed. */
    const renaming = (n: number): Release => {
      const ids = new Set(
        releaseA.foods
          .filter((f) => !f.archived)
          .slice(0, n)
          .map((f) => f.fineliId),
      );
      return {
        ...releaseA,
        foods: releaseA.foods.map((f) => (ids.has(f.fineliId) ? { ...f, name: `${f.name} Ã¤` } : f)),
      };
    };
    const names = async () =>
      (await suite.client.query("SELECT fineli_id, name, updated_at FROM foods ORDER BY fineli_id")).rows;

    it("stops before writing when more than 10 foods and 5 % would be renamed, naming examples and the flag", async () => {
      const before = await names();
      const attempt = mod.applyRelease(suite.db, renaming(11), options(T2));
      await expect(attempt).rejects.toThrow(mod.RenameGuardError);
      await expect(attempt).rejects.toThrow(
        /would rename 11 of the 15 Fineli foods.*1 "Sokeri" to "Sokeri Ã¤".*--allow-rename/,
      );
      expect(await names()).toEqual(before);
    });

    it("proceeds with allowRename, and lets ten renames through without it", async () => {
      const ten = await mod.applyRelease(suite.db, renaming(10), options(T2));
      expect(ten.renamed).toHaveLength(10);
      const eleven = await mod.applyRelease(suite.db, renaming(11), { ...options(T2), allowRename: true });
      expect(eleven.renamed).toHaveLength(1);
    });

    it("counts only renames of live foods toward the guard, and still reports every rename", async () => {
      // Retire 12 foods, then rename those 12 and one live food. 1 live rename is under the limit.
      const retired = releaseA.foods
        .filter((f) => !f.archived)
        .slice(0, 12)
        .map((f) => f.fineliId);
      await suite.client.query("UPDATE foods SET retired_at = $1 WHERE fineli_id = ANY($2)", [T1, retired]);
      const renamedIds = new Set([...retired, releaseA.foods.filter((f) => !f.archived)[12].fineliId]);
      const release: Release = {
        ...releaseA,
        foods: releaseA.foods.map((f) => (renamedIds.has(f.fineliId) ? { ...f, name: `${f.name} uusi` } : f)),
      };
      const result = await mod.applyRelease(suite.db, release, options(T2));
      expect(result.renamed).toHaveLength(13);
    });

    it("takes --allow-rename on the command line", async () => {
      const { parseArgs } = mod;
      expect(parseArgs(["--allow-rename"], { defaultDir: A, cwd: A }).allowRename).toBe(true);
    });
  });

  it("waits for an import that holds the lock, then runs", async () => {
    await suite.client.query("TRUNCATE foods CASCADE");
    await suite.client.query("BEGIN");
    await suite.client.query("SELECT pg_advisory_xact_lock(hashtext('fineli_import'))");
    let settled = false;
    const second = mod.applyRelease(suite.db, releaseA, options(T2)).finally(() => {
      settled = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(settled).toBe(false);
    await suite.client.query("COMMIT");
    expect((await second).foods.inserted).toBe(16);
  });

  it("moves no updated_at in a dry run over a full catalogue", async () => {
    const before = await snapshot();
    const { result } = await mod.runImport(
      suite.db,
      { dir: B, dryRun: true, allowRetire: false, allowRename: false },
      T2,
    );
    expect(result.foods.updated).toBeGreaterThan(0);
    expect(result.portions.removed).toBe(1);
    expect(await snapshot()).toEqual(before);
  });

  describe("the report", () => {
    it("partitions the foods read, and says so in a sum line that adds up", async () => {
      const release = mod.readRelease(B);
      const result = await mod.applyRelease(suite.db, release, options(T2));
      const report = mod.formatReport(B, release, result);
      const sum = report.split("\n").find((l) => l.includes(" read = ")) as string;
      expect(sum).toBe('18 read = 1 added + 2 changed + 12 unchanged + 1 back + 0 newly "(arc)" + 2 left out');
      const [total, ...parts] = sum.match(/\d+/g)!.map(Number);
      expect(parts.reduce((a, b) => a + b, 0)).toBe(total);
    });
  });

  describe("runCli failures", () => {
    const io = () => {
      const log: string[] = [];
      const error: string[] = [];
      return { log, error, out: { log: (l: string) => log.push(l), error: (l: string) => error.push(l) } };
    };
    const defaults = { defaultDir: A, cwd: A };
    /** `suite.db` with `method` replaced by one that fails. */
    const failing = (method: "execute" | "transaction", message: string): Db =>
      new Proxy(suite.db, {
        get(target, prop, receiver) {
          if (prop === method) return () => Promise.reject(new Error(message));
          return Reflect.get(target, prop, receiver) as unknown;
        },
      });

    it("prints the report of a written import before a failed statistics refresh, and answers 3", async () => {
      await suite.client.query("TRUNCATE foods CASCADE");
      const out = io();
      expect(await mod.runCli([B], failing("execute", "no space left"), out.out, defaults)).toBe(3);
      expect(out.log.join("\n")).toContain("Written to the database.");
      expect(out.error).toEqual(["The import was written. Refreshing statistics failed: no space left"]);
      expect((await row(627)).retired_at).toBeNull();
    });

    it("does not call a written import unwritten when printing its report fails", async () => {
      await suite.client.query("TRUNCATE foods CASCADE");
      const error: string[] = [];
      const out = {
        log: () => {
          throw new Error("stdout closed");
        },
        error: (l: string) => error.push(l),
      };
      await expect(mod.runCli([B], suite.db, out, defaults)).rejects.toThrow("stdout closed");
      expect(error).toEqual([]);
      expect((await row(627)).retired_at).toBeNull();
    });

    it("says most likely nothing was written when the database fails, with no stack trace, and answers 1", async () => {
      const out = io();
      expect(await mod.runCli([B], failing("transaction", "connection reset"), out.out, defaults)).toBe(1);
      expect(out.error).toEqual([
        "Fineli import failed. Most likely nothing was written. A dry run shows the catalogue as it is now. connection reset",
      ]);
      expect(out.log).toEqual([]);
      expect(await row(627)).toBeUndefined();
    });
  });
});
