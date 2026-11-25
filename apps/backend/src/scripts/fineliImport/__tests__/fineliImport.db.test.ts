import { beforeEach, describe, expect, it } from "@jest/globals";
import { cpSync, mkdtempSync, rmSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import request from "supertest";
import { signUp, type ApiUser } from "../../../__tests__/support/apiUser.js";
import { describeWithDb } from "../../../db/__tests__/support/throwawayDb.js";

// The import on a real database, from the release 18 fixtures. Release B
// changes the banana's protein, renames 153, drops 31924, adds 627, removes
// the quark's TL measure, drops "(arc)" from 572 and drops the one recipe
// that uses the turkey, 752 (fixtures/README.md).

const FIXTURES = path.resolve("src/scripts/fineliImport/__tests__/fixtures");
const A = path.join(FIXTURES, "release-a");
const B = path.join(FIXTURES, "release-b");
const QUARK = 622;
const T1 = new Date("2026-11-01T10:00:00Z");
const T2 = new Date("2026-11-02T10:00:00Z");

type Mod = {
  applyRelease: typeof import("../applyRelease.js").applyRelease;
  RetireGuardError: typeof import("../applyRelease.js").RetireGuardError;
  readRelease: typeof import("../readRelease.js").readRelease;
  runImport: typeof import("../cli.js").runImport;
  runCli: typeof import("../cli.js").runCli;
};

await describeWithDb("fineliImport", (suite) => {
  const mod = {} as Mod;
  const args = (dir: string, extra: Partial<{ dryRun: boolean; allowRetire: boolean }> = {}) => ({
    dir,
    dryRun: false,
    allowRetire: false,
    allowRename: false,
    ...extra,
  });

  /** Fineli id to [UUID, retired_at, updated_at], for every Fineli food. */
  const catalogue = async () => {
    const { rows } = await suite.client.query(
      "SELECT fineli_id, id, retired_at, updated_at FROM foods WHERE source = 'fineli' ORDER BY fineli_id",
    );
    return new Map(
      rows.map((r) => [
        r.fineli_id as number,
        { id: r.id as string, retiredAt: r.retired_at, updatedAt: r.updated_at },
      ]),
    );
  };
  const idOf = async (fineliId: number) => (await catalogue()).get(fineliId)?.id as string;
  const counts = async () => {
    const { rows } = await suite.client.query(
      "SELECT (SELECT count(*) FROM foods)::int AS foods, (SELECT count(*) FROM food_portions)::int AS portions",
    );
    return rows[0] as { foods: number; portions: number };
  };

  beforeEach(async () => {
    Object.assign(
      mod,
      await import("../applyRelease.js"),
      await import("../readRelease.js"),
      await import("../cli.js"),
    );
    await suite.client.query("TRUNCATE foods CASCADE");
  });

  describe("release A into an empty catalogue", () => {
    it("adds every food it can, with values in kcal and grams, and its measures", async () => {
      const { result } = await mod.runImport(suite.db, args(A), T1);
      expect(result.foods).toEqual({ inserted: 16, updated: 0, unchanged: 0, revived: 0, archived: 0 });
      expect(result.portions).toMatchObject({ inserted: 85, updated: 0, removed: 0 });
      const { rows } = await suite.client.query(
        "SELECT name, name_en, energy_kcal, protein_g, carbs_g, fat_g, fineli_type, fineli_process, user_id, retired_at FROM foods WHERE fineli_id = $1",
        [QUARK],
      );
      expect(rows[0]).toEqual({
        name: "Rahka, maitorahka, maustamaton, rasvaa <0,5 %",
        name_en: "Quark, <0.5% fat",
        energy_kcal: "59.31",
        protein_g: "9.810",
        carbs_g: "3.000",
        fat_g: "0.400",
        fineli_type: "FOOD",
        fineli_process: "IND",
        user_id: null,
        retired_at: null,
      });
      const portions = await suite.client.query(
        "SELECT fineli_unit, grams, user_id, name FROM food_portions WHERE food_id = $1 ORDER BY fineli_unit",
        [await idOf(QUARK)],
      );
      expect(portions.rows).toEqual([
        { fineli_unit: "DL", grams: "100.0", user_id: null, name: null },
        { fineli_unit: "PORTL", grams: "250.0", user_id: null, name: null },
        { fineli_unit: "PORTM", grams: "200.0", user_id: null, name: null },
        { fineli_unit: "PORTS", grams: "125.0", user_id: null, name: null },
        { fineli_unit: "RKL", grams: "15.0", user_id: null, name: null },
        { fineli_unit: "TL", grams: "5.0", user_id: null, name: null },
      ]);
    });

    it("leaves out the foods missing a value", async () => {
      await mod.runImport(suite.db, args(A), T1);
      const ids = await catalogue();
      expect(ids.has(29)).toBe(false);
      expect(ids.has(11184)).toBe(false);
    });

    it('imports a food named "(arc)" retired', async () => {
      await mod.runImport(suite.db, args(A), T1);
      expect((await catalogue()).get(572)?.retiredAt).toEqual(T1);
    });

    it("changes nothing on a second run, and keeps every UUID", async () => {
      await mod.runImport(suite.db, args(A), T1);
      const before = await catalogue();
      const { result } = await mod.runImport(suite.db, args(A), T2);
      expect(result.foods).toEqual({ inserted: 0, updated: 0, unchanged: 16, revived: 0, archived: 0 });
      expect(result.portions).toEqual({ inserted: 0, updated: 0, unchanged: 85, removed: 0 });
      expect(result.renamed).toEqual([]);
      expect(result.namesChangedInCaseOnly).toBe(0);
      expect(await catalogue()).toEqual(before);
    });

    it("runs VACUUM ANALYZE on foods, and a dry run neither writes nor vacuums", async () => {
      const vacuums = async () =>
        (await suite.client.query("SELECT vacuum_count::int AS n FROM pg_stat_user_tables WHERE relname = 'foods'"))
          .rows[0].n as number;
      const start = await vacuums();
      const { result } = await mod.runImport(suite.db, args(A, { dryRun: true }), T1);
      expect(result.dryRun).toBe(true);
      expect(result.foods.inserted).toBe(16);
      expect(await counts()).toEqual({ foods: 0, portions: 0 });
      expect(await vacuums()).toBe(start);
      await mod.runImport(suite.db, args(A), T1);
      expect(await vacuums()).toBe(start + 1);
    });
  });

  describe("release B after release A", () => {
    let user: ApiUser;
    let ownPortionId: string;

    beforeEach(async () => {
      await mod.runImport(suite.db, args(A), T1);
      user = await signUp(suite.client);
      for (const fineliId of [31924, QUARK]) {
        await suite.client.query("INSERT INTO food_favourites (user_id, food_id) VALUES ($1, $2)", [
          user.id,
          await idOf(fineliId),
        ]);
      }
      const own = await suite.client.query(
        "INSERT INTO food_portions (food_id, user_id, name, grams) VALUES ($1, $2, 'one tub', 200) RETURNING id",
        [await idOf(QUARK), user.id],
      );
      ownPortionId = own.rows[0].id as string;
    });

    it("updates a changed value in place, under the same UUID", async () => {
      const before = await catalogue();
      const { result } = await mod.runImport(suite.db, args(B), T2);
      const after = await catalogue();
      expect(after.get(11049)?.id).toBe(before.get(11049)?.id);
      expect(after.get(11049)?.updatedAt).toEqual(T2);
      const { rows } = await suite.client.query("SELECT protein_g FROM foods WHERE fineli_id = 11049");
      expect(rows[0].protein_g).toBe("1.300");
      expect(after.get(1)?.updatedAt).toEqual(T1);
      expect(result.foods).toEqual({ inserted: 1, updated: 3, unchanged: 11, revived: 1, archived: 0 });
      expect(result.retired).toEqual({ absent: 1, leftOut: [] });
    });

    it('lists a food renamed under the same id, but not one that only lost "(arc)"', async () => {
      const { result } = await mod.runImport(suite.db, args(B), T2);
      expect(result.renamed).toEqual([{ fineliId: 153, from: "Kaurahiutale", to: "Kaurahiutale, täysjyvä" }]);
    });

    it("retires a dropped food: still readable by id, still a favourite, gone from search", async () => {
      const id = await idOf(31924);
      await mod.runImport(suite.db, args(B), T2);
      expect((await catalogue()).get(31924)).toEqual({ id, retiredAt: T2, updatedAt: T2 });
      const detail = await request(suite.app).get(`/api/v1/foods/${id}`).set(user.auth);
      expect(detail.status).toBe(200);
      expect(detail.body.retired).toBe(true);
      const favourites = await request(suite.app).get("/api/v1/foods/favourites").set(user.auth);
      expect(favourites.body.foods.map((f: { id: string }) => f.id)).toContain(id);
      const search = await request(suite.app).get("/api/v1/foods/search").query({ q: "oivallus" }).set(user.auth);
      expect(search.status).toBe(200);
      expect(search.body.foods).toEqual([]);
    });

    it('revives a food that no longer starts with "(arc)", and adds a new one', async () => {
      const id = await idOf(572);
      await mod.runImport(suite.db, args(B), T2);
      const after = await catalogue();
      expect(after.get(572)).toEqual({ id, retiredAt: null, updatedAt: T2 });
      expect(after.get(627)?.retiredAt).toBeNull();
    });

    it("revives a dropped food when a later release has it again", async () => {
      await mod.runImport(suite.db, args(B), T2);
      const { result } = await mod.runImport(suite.db, args(A), T2);
      expect((await catalogue()).get(31924)?.retiredAt).toBeNull();
      expect(result.foods.revived).toBe(1);
      expect(result.foods.archived).toBe(1);
      expect(result.retired.absent).toBe(1);
    });

    it("removes a measure the release dropped and leaves the user's own portion on that food", async () => {
      const { result } = await mod.runImport(suite.db, args(B), T2);
      expect(result.portions.removed).toBe(1);
      const { rows } = await suite.client.query(
        "SELECT id, fineli_unit, name FROM food_portions WHERE food_id = $1 ORDER BY fineli_unit NULLS LAST",
        [await idOf(QUARK)],
      );
      expect(rows.map((r) => r.fineli_unit ?? r.name)).toEqual(["DL", "PORTL", "PORTM", "PORTS", "RKL", "one tub"]);
      expect(rows[5].id).toBe(ownPortionId);
    });

    it("keeps a retired food's measures", async () => {
      await mod.runImport(suite.db, args(B), T2);
      const { rows } = await suite.client.query("SELECT count(*)::int AS n FROM food_portions WHERE food_id = $1", [
        await idOf(31924),
      ]);
      expect(rows[0].n).toBeGreaterThan(0);
    });
  });

  describe("the retire guard", () => {
    it("stops before writing when more than 10 % of live foods would retire, and proceeds with allowRetire", async () => {
      await mod.runImport(suite.db, args(A), T1);
      const full = mod.readRelease(A);
      // 15 live foods after release A. Two missing is 13 %, above the guard.
      const short = { ...full, foods: full.foods.filter((f) => f.fineliId !== 1 && f.fineliId !== 153) };
      const before = await catalogue();
      await expect(
        mod.applyRelease(suite.db, short, { allowRetire: false, allowRename: false, dryRun: false, now: T2 }),
      ).rejects.toThrow(mod.RetireGuardError);
      expect(await catalogue()).toEqual(before);

      const result = await mod.applyRelease(suite.db, short, {
        allowRetire: true,
        allowRename: false,
        dryRun: false,
        now: T2,
      });
      expect(result.retired.absent).toBe(2);
      expect((await catalogue()).get(153)?.retiredAt).toEqual(T2);
    });

    it("lets one missing food through: 1 of 15 is under 10 %", async () => {
      await mod.runImport(suite.db, args(A), T1);
      const full = mod.readRelease(A);
      const short = { ...full, foods: full.foods.filter((f) => f.fineliId !== 1) };
      const result = await mod.applyRelease(suite.db, short, {
        allowRetire: false,
        allowRename: false,
        dryRun: false,
        now: T2,
      });
      expect(result.retired.absent).toBe(1);
    });
  });

  describe("runCli", () => {
    const lines = () => {
      const log: string[] = [];
      const error: string[] = [];
      return { log, error, out: { log: (l: string) => log.push(l), error: (l: string) => error.push(l) } };
    };
    const defaults = { defaultDir: A, cwd: FIXTURES };

    it("imports, prints the report and answers 0", async () => {
      const io = lines();
      expect(await mod.runCli(["release-a"], suite.db, io.out, defaults)).toBe(0);
      const report = io.log.join("\n");
      expect(report).toContain("Release: 18.0");
      expect(report).toContain("  Added: 16");
      expect(report).toContain("    29 Lihaliemi, laimennettu: no PROT value");
      expect(report).toContain("THL does not produce or endorse Hovimestari.");
      expect((await counts()).foods).toBe(16);
    });

    it("writes nothing with --dry-run", async () => {
      const io = lines();
      expect(await mod.runCli(["--dry-run"], suite.db, io.out, defaults)).toBe(0);
      expect(io.log.join("\n")).toContain("Dry run: nothing was written.");
      expect(await counts()).toEqual({ foods: 0, portions: 0 });
    });

    it("answers 1 and writes nothing for a release missing foodaddunit.csv, naming it", async () => {
      const dir = mkdtempSync(path.join(tmpdir(), "fineli-"));
      cpSync(A, dir, { recursive: true });
      unlinkSync(path.join(dir, "foodaddunit.csv"));
      const io = lines();
      expect(await mod.runCli([dir], suite.db, io.out, defaults)).toBe(1);
      expect(io.error).toEqual([`Fineli import stopped. foodaddunit.csv is missing from ${dir}.`]);
      expect(await counts()).toEqual({ foods: 0, portions: 0 });
      rmSync(dir, { recursive: true, force: true });
    });

    it("answers 1 when the retire guard trips, and says how to proceed", async () => {
      await mod.runImport(suite.db, args(A), T1);
      const io = lines();
      const dir = mkdtempSync(path.join(tmpdir(), "fineli-"));
      cpSync(A, dir, { recursive: true });
      // An empty food list: every food would retire.
      const { writeFileSync } = await import("node:fs");
      writeFileSync(path.join(dir, "food.csv"), "FOODID;FOODNAME;FOODTYPE;PROCESS;IGCLASS\r\n");
      expect(await mod.runCli([dir], suite.db, io.out, defaults)).toBe(1);
      expect(io.error[0]).toContain("would retire 15 of the 15 Fineli foods");
      expect(io.error[0]).toContain("--allow-retire");
      rmSync(dir, { recursive: true, force: true });
    });

    it.each([["--force"], ["a", "b"]])("answers 2 for bad arguments %p", async (...argv) => {
      const io = lines();
      expect(await mod.runCli(argv, suite.db, io.out, defaults)).toBe(2);
      expect(io.error[0]).toContain("Usage: fineli:import");
    });
  });
});
