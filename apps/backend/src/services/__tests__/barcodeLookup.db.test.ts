import { beforeAll, describe, expect, it, jest } from "@jest/globals";
import { format } from "node:util";
import { signUp } from "../../__tests__/support/apiUser.js";
import { fakeClock, newEan13, offBody, offStub, stubDeps, type OffStub } from "../../__tests__/support/offStub.js";
import { describeWithDb } from "../../db/__tests__/support/throwawayDb.js";
import type { LookupDeps } from "../writes/barcode.js";
import type { WriteContext } from "../writes/context.js";

// The barcode lookup service on a real, migrated Postgres, with Open Food
// Facts stubbed: the order of the steps, what is stored, what is sent, and
// the two budgets. Visibility through the routes is in
// routes/__tests__/barcodeVisibility.db.test.ts.

const NOW = new Date("2026-11-18T10:00:00Z");

await describeWithDb("barcodeLookup", (suite) => {
  let lookupBarcode: typeof import("../writes/barcode.js").lookupBarcode;
  let contextForUser: typeof import("../../lib/requestContext.js").contextForUser;

  beforeAll(async () => {
    ({ lookupBarcode } = await import("../writes/barcode.js"));
    ({ contextForUser } = await import("../../lib/requestContext.js"));
  });

  const user = async () => {
    const u = await signUp(suite.client);
    return { ...u, ctx: contextForUser({ id: u.id, timeZone: "Europe/Helsinki" }, NOW) as WriteContext };
  };
  const setup = async () => {
    const stub = offStub();
    const clock = fakeClock();
    return { stub, clock, deps: await stubDeps(stub, clock) };
  };
  const look = (ctx: WriteContext, deps: LookupDeps, barcode: string, format?: "ean_8" | "upc_e") =>
    lookupBarcode(ctx, { barcode, format }, deps).then((o) => o.value);
  const stored = async (barcode: string) =>
    (
      await suite.client.query(
        "SELECT id, barcode FROM foods WHERE source = 'open_food_facts' AND lpad(barcode, 14, '0') = lpad($1, 14, '0')",
        [barcode],
      )
    ).rows;
  const ownFood = async (ctx: WriteContext, barcode: string, name = "Oma rahka") => {
    const { createOwnFood } = await import("../writes/foods.js");
    const per100g = { energyKcal: 60, proteinG: 10, carbsG: 4, fatG: 0.2 };
    return (await createOwnFood(ctx, { name, per100g, barcode })).value;
  };
  /**
   * Resolves when a lookup of `code` asks the memory for it, its last step
   * before it calls Open Food Facts or waits on a call already made.
   */
  const memoryAsked = (deps: LookupDeps, code: string) =>
    new Promise<void>((resolve) => {
      const get = deps.cache.get.bind(deps.cache);
      let seen = 0;
      deps.cache.get = (key) => {
        // Installed after the first lookup asked, so this is the next one.
        if (key === code.padStart(14, "0") && ++seen === 1) resolve();
        return get(key);
      };
    });
  const product = (stub: OffStub, code: string, name: string, fields = {}, nutriments = {}) =>
    stub.answers.set(code, { body: offBody(code, name, fields, nutriments) });

  describe("own foods first", () => {
    it("answers the user's own food, with no call, even when a stored product has the barcode", async () => {
      const { stub, deps } = await setup();
      const [a, b] = [await user(), await user()];
      const code = await newEan13();
      product(stub, code, "Kaurajuoma");
      expect(await look(b.ctx, deps, code)).toMatchObject({ result: "found", food: { source: "open_food_facts" } });
      const own = await ownFood(a.ctx, code);
      const calls = stub.calls.length;
      expect(await look(a.ctx, deps, code)).toEqual({ result: "found", food: own, newlyVisible: false });
      expect(stub.calls.length).toBe(calls);
    });

    it("matches an own food saved under any form of the code", async () => {
      const { stub, deps } = await setup();
      const a = await user();
      const upcA = await ownFood(a.ctx, "012345000058", "UPC-A");
      expect(await look(a.ctx, deps, "0012345000058")).toMatchObject({ food: { id: upcA.id } });
      expect(await look(a.ctx, deps, "01234558")).toMatchObject({ food: { id: upcA.id } });
      const b = await user();
      const upcE = await ownFood(b.ctx, "01234558", "UPC-E");
      expect(await look(b.ctx, deps, "012345000058")).toMatchObject({ food: { id: upcE.id } });
      // An own food is the person's own word, even under a code no product can have.
      const c = await user();
      const wrong = await ownFood(c.ctx, "12345678", "Kaupan oma");
      expect(await look(c.ctx, deps, "12345678")).toMatchObject({ food: { id: wrong.id } });
      expect(stub.calls).toEqual([]);
    });

    it("never finds another user's own food, nor a deleted one", async () => {
      const { stub, deps } = await setup();
      const [a, b] = [await user(), await user()];
      const code = await newEan13();
      await ownFood(b.ctx, code);
      expect(await look(a.ctx, deps, code)).toEqual({ result: "not_found", barcode: code });
      const own = await ownFood(a.ctx, code);
      const { deleteOwnFood } = await import("../writes/foods.js");
      await deleteOwnFood(a.ctx, own.id);
      expect(await look(a.ctx, deps, code)).toEqual({ result: "not_found", barcode: code });
      expect(stub.calls).toHaveLength(1);
    });
  });

  describe("what is sent", () => {
    it("sends no code with a wrong check digit, and no shop's own number", async () => {
      const { stub, deps } = await setup();
      const a = await user();
      expect(await look(a.ctx, deps, "6408430000259")).toEqual({ result: "not_found", barcode: "6408430000259" });
      expect(await look(a.ctx, deps, "2912345000004")).toEqual({ result: "in_store", barcode: "2912345000004" });
      expect(await look(a.ctx, deps, "02912345000004")).toMatchObject({ result: "in_store" });
      expect(await look(a.ctx, deps, "20000004")).toMatchObject({ result: "in_store" });
      // A GTIN-14 with indicator 1 to 8 is a case or a pack, and 9 a variable measure item.
      expect(await look(a.ctx, deps, "16408430000255")).toEqual({ result: "not_found", barcode: "16408430000255" });
      expect(await look(a.ctx, deps, "86408430000254")).toEqual({ result: "not_found", barcode: "86408430000254" });
      expect(await look(a.ctx, deps, "96408430000251")).toEqual({ result: "in_store", barcode: "96408430000251" });
      expect(stub.calls).toEqual([]);
    });

    it("sends a 12 to 14-digit code whatever format a scan reports with it", async () => {
      const { stub, deps } = await setup();
      const a = await user();
      await look(a.ctx, deps, "012345000058", "upc_e");
      await look(a.ctx, deps, "6408430000258", "ean_8");
      expect(stub.calls).toEqual(["/api/v2/product/0012345000058", "/api/v2/product/6408430000258"]);
    });

    it("reads an 8-digit code valid two ways as the format says, and typed as a UPC-E", async () => {
      const { stub, deps } = await setup();
      const a = await user();
      expect(await look(a.ctx, deps, "02345055", "ean_8")).toMatchObject({ result: "in_store" });
      expect(stub.calls).toEqual([]);
      expect(await look(a.ctx, deps, "02345055", "upc_e")).toMatchObject({ result: "not_found" });
      expect(stub.calls).toEqual(["/api/v2/product/0023450000055"]);
      // Typed: the UPC-E is not found, and the EAN-8 reading is the shop's own, so nothing more is sent.
      expect(await look(a.ctx, deps, "02345055")).toEqual({ result: "not_found", barcode: "02345055" });
      expect(stub.calls).toHaveLength(1);
    });

    it("tries a scanned UPC-E with leading digit 1 only as that, and typed only as an EAN-8", async () => {
      const { stub, deps } = await setup();
      const a = await user();
      await look(a.ctx, deps, "12345052", "upc_e");
      await look(a.ctx, deps, "12345052");
      expect(stub.calls).toEqual(["/api/v2/product/0123450000052", "/api/v2/product/0000012345052"]);
    });
  });

  describe("storing", () => {
    it("stores a complete product once, under the requested code, and needs no second call", async () => {
      const { stub, deps } = await setup();
      const [a, b] = [await user(), await user()];
      const code = await newEan13();
      product(stub, code, "Proteiinirahka");
      const first = await look(a.ctx, deps, code);
      expect(first).toMatchObject({
        result: "found",
        newlyVisible: true,
        food: {
          source: "open_food_facts",
          name: "Proteiinirahka, Valio",
          isOwn: false,
          barcode: code,
          per100g: { energyKcal: 39 },
        },
      });
      expect(await look(b.ctx, deps, code)).toMatchObject({ result: "found", newlyVisible: true });
      expect(await look(a.ctx, deps, code)).toMatchObject({ result: "found", newlyVisible: false });
      expect(stub.calls).toHaveLength(1);
      expect(await stored(code)).toHaveLength(1);
    });

    it("stores a UPC-A once whether it is asked for by 12 or 13 digits", async () => {
      const { stub, deps } = await setup();
      const a = await user();
      stub.answers.set("0012000161155", { body: offBody("0012000161155", "Vesi") });
      await look(a.ctx, deps, "012000161155");
      expect(await look(a.ctx, deps, "0012000161155")).toMatchObject({ result: "found", newlyVisible: false });
      expect(stub.calls).toEqual(["/api/v2/product/0012000161155"]);
      expect((await stored("012000161155")).map((r) => r.barcode)).toEqual(["0012000161155"]);
    });

    it("stores a GTIN-8 as its 8 digits, and finds it again by its 8, 13 and 14-digit forms", async () => {
      const { stub, deps } = await setup();
      const [a, b] = [await user(), await user()];
      // Sent as 13 digits. Open Food Facts answers with the product's own 8 digits.
      stub.answers.set("0000096385074", { body: offBody("96385074", "Kahdeksan") });
      expect(await look(a.ctx, deps, "96385074")).toMatchObject({
        result: "found",
        newlyVisible: true,
        food: { barcode: "96385074", name: "Kahdeksan, Valio" },
      });
      expect((await stored("96385074")).map((r) => r.barcode)).toEqual(["96385074"]);
      for (const form of ["96385074", "0000096385074", "00000096385074"]) {
        expect(await look(b.ctx, deps, form)).toMatchObject({ result: "found", food: { barcode: "96385074" } });
      }
      expect(stub.calls).toEqual(["/api/v2/product/0000096385074"]);
    });

    it("stores one row when two machines look up a new product at once, and tells both users it is newly visible", async () => {
      const { stub, deps, clock } = await setup();
      // Two sets of budgets over one stub: two backend processes, which share no memory.
      const other = await stubDeps(stub, clock);
      const [a, b] = [await user(), await user()];
      const code = await newEan13();
      product(stub, code, "Yhtäaikainen");
      const held = stub.hold();
      const both = Promise.all([look(a.ctx, deps, code), look(b.ctx, other, code)]);
      await held.arrived(2);
      held.release();
      const [ra, rb] = await both;
      expect(stub.calls).toHaveLength(2);
      expect(ra).toMatchObject({ result: "found", newlyVisible: true });
      expect(rb).toMatchObject({ result: "found", newlyVisible: true });
      expect(ra.result === "found" && rb.result === "found" && ra.food.id === rb.food.id).toBe(true);
      expect(await stored(code)).toHaveLength(1);
      const { rows } = await suite.client.query("SELECT count(*)::int AS n FROM food_lookups WHERE food_id = $1", [
        (await stored(code))[0].id,
      ]);
      expect(rows[0].n).toBe(2);
    });

    it("makes one call for two lookups of one new code at once, which only the first pays for", async () => {
      const { stub, deps } = await setup();
      const [a, b] = [await user(), await user()];
      const code = await newEan13();
      product(stub, code, "Yksi kutsu");
      // B has no call left, so B can only get an answer by waiting for A's call.
      for (let i = 0; i < 30; i++) deps.userBudget.take(b.id);
      const held = stub.hold();
      const first = look(a.ctx, deps, code);
      await held.arrived(1);
      const asked = memoryAsked(deps, code);
      const second = look(b.ctx, deps, code);
      await asked;
      held.release();
      const [ra, rb] = await Promise.all([first, second]);
      expect(stub.calls).toHaveLength(1);
      expect(ra).toMatchObject({ result: "found", newlyVisible: true });
      expect(rb).toMatchObject({ result: "found", newlyVisible: true });
      expect(ra.result === "found" && rb.result === "found" && ra.food.id === rb.food.id).toBe(true);
      const { rows } = await suite.client.query("SELECT count(*)::int AS n FROM food_lookups WHERE food_id = $1", [
        (await stored(code))[0].id,
      ]);
      expect(rows[0].n).toBe(2);
      expect(deps.inFlight.size).toBe(0);
    });

    it("lets both lookups waiting on one failed call fail, and makes a new call on the next press", async () => {
      const { stub, deps } = await setup();
      const [a, b] = [await user(), await user()];
      const code = await newEan13();
      stub.answers.set(code, "network");
      const held = stub.hold();
      const first = look(a.ctx, deps, code);
      await held.arrived(1);
      const asked = memoryAsked(deps, code);
      const second = look(b.ctx, deps, code);
      await asked;
      held.release();
      await expect(first).rejects.toMatchObject({ status: 503, code: "barcode_lookup_unavailable" });
      await expect(second).rejects.toMatchObject({ status: 503, code: "barcode_lookup_unavailable" });
      expect(stub.calls).toHaveLength(1);
      expect(deps.inFlight.size).toBe(0);
      product(stub, code, "Toisella kertaa");
      expect(await look(b.ctx, deps, code)).toMatchObject({ result: "found" });
      expect(stub.calls).toHaveLength(2);
    });

    it("stores a product whose name holds a NUL and a bidi override, without them", async () => {
      const { stub, deps } = await setup();
      const a = await user();
      const code = await newEan13();
      product(stub, code, "Rahka\u0000 \u202Emaustamaton");
      expect(await look(a.ctx, deps, code)).toMatchObject({
        result: "found",
        food: { name: "Rahka maustamaton, Valio" },
      });
      expect(stub.calls).toHaveLength(1);
    });

    it("answers incomplete, and remembers it, for a product the catalogue refuses", async () => {
      const { stub, deps } = await setup();
      const a = await user();
      const code = await newEan13();
      product(stub, code, "Hylätty tuote");
      await suite.client.query(
        "ALTER TABLE foods ADD CONSTRAINT test_refuses CHECK (name NOT LIKE 'Hylätty%') NOT VALID",
      );
      const logged: string[] = [];
      const log = jest.spyOn(console, "error").mockImplementation(() => {});
      try {
        for (let round = 0; round < 2; round++) {
          expect(await look(a.ctx, deps, code)).toEqual({
            result: "incomplete",
            barcode: code,
            reason: "implausible_values",
            product: {
              name: "Hylätty tuote, Valio",
              per100g: { energyKcal: 39, proteinG: 3.3, carbsG: 3.1, fatG: 1.5 },
            },
          });
        }
      } finally {
        await suite.client.query("ALTER TABLE foods DROP CONSTRAINT test_refuses");
        logged.push(...log.mock.calls.map((args) => format(...args)));
        log.mockRestore();
      }
      // The failure is logged once, without the barcode or the product's name.
      expect(logged).toHaveLength(1);
      expect(logged[0]).not.toMatch(new RegExp(`${code}|Valio`));
      expect(stub.calls).toHaveLength(1);
      expect(await stored(code)).toEqual([]);
    });

    it("lets a storing failure through, remembers what was fetched, and stores it once the database is back", async () => {
      const { stub, deps } = await setup();
      const [a, b] = [await user(), await user()];
      const code = await newEan13();
      product(stub, code, "Kaatuva tuote");
      // A statement timeout on the insert: a busy database, not a refused row.
      await suite.client.query(`
        CREATE FUNCTION test_fails() RETURNS trigger LANGUAGE plpgsql AS
          $$ BEGIN IF NEW.name LIKE 'Kaatuva%' THEN RAISE EXCEPTION 'busy' USING ERRCODE = '57014'; END IF;
          RETURN NEW; END $$;
        CREATE TRIGGER test_fails BEFORE INSERT ON foods FOR EACH ROW EXECUTE FUNCTION test_fails();`);
      const log = jest.spyOn(console, "error").mockImplementation(() => {});
      try {
        for (const u of [a, b]) {
          const err = await look(u.ctx, deps, code).then(
            () => null,
            (e: unknown) => e as Error & { cause?: { code?: string } },
          );
          // The database's own error, for the error middleware, never an AppError.
          expect(err).not.toBeNull();
          expect(err).not.toHaveProperty("status");
          expect(err?.cause?.code).toBe("57014");
        }
        expect(log).not.toHaveBeenCalled();
      } finally {
        await suite.client.query("DROP TRIGGER test_fails ON foods; DROP FUNCTION test_fails()");
        log.mockRestore();
      }
      expect(stub.calls).toHaveLength(1);
      expect(await stored(code)).toEqual([]);
      // The database is back: the next press stores what was fetched, with no call and no budget.
      for (let i = 0; i < 30; i++) deps.userBudget.take(b.id);
      expect(await look(b.ctx, deps, code)).toMatchObject({
        result: "found",
        newlyVisible: true,
        food: { name: "Kaatuva tuote, Valio", barcode: code },
      });
      expect(stub.calls).toHaveLength(1);
      expect(await stored(code)).toHaveLength(1);
      expect(deps.inFlight.size).toBe(0);
    });

    it("stores what was fetched once when two presses retry it at once", async () => {
      const { stub, deps } = await setup();
      const [a, b] = [await user(), await user()];
      const code = await newEan13();
      product(stub, code, "Kaatuva kahdesti");
      await suite.client.query(`
        CREATE FUNCTION test_fails() RETURNS trigger LANGUAGE plpgsql AS
          $$ BEGIN IF NEW.name LIKE 'Kaatuva%' THEN RAISE EXCEPTION 'busy' USING ERRCODE = '57014'; END IF;
          RETURN NEW; END $$;
        CREATE TRIGGER test_fails BEFORE INSERT ON foods FOR EACH ROW EXECUTE FUNCTION test_fails();`);
      try {
        await expect(look(a.ctx, deps, code)).rejects.toMatchObject({ cause: { code: "57014" } });
      } finally {
        await suite.client.query("DROP TRIGGER test_fails ON foods; DROP FUNCTION test_fails()");
      }
      // A slow insert that counts its attempts in a sequence, which other sessions see at once.
      await suite.client.query(`
        CREATE SEQUENCE test_attempts;
        CREATE FUNCTION test_slow() RETURNS trigger LANGUAGE plpgsql AS
          $$ BEGIN IF NEW.name LIKE 'Kaatuva%' THEN PERFORM nextval('test_attempts'); PERFORM pg_sleep(0.3);
          END IF; RETURN NEW; END $$;
        CREATE TRIGGER test_slow BEFORE INSERT ON foods FOR EACH ROW EXECUTE FUNCTION test_slow();`);
      try {
        const first = look(a.ctx, deps, code);
        // Wait until the first press is inside its slow insert.
        const attempts = async () =>
          (
            await suite.client.query(
              "SELECT CASE WHEN is_called THEN last_value ELSE 0 END::int AS n FROM test_attempts",
            )
          ).rows[0].n as number;
        while ((await attempts()) === 0) await new Promise((r) => setTimeout(r, 5));
        const asked = memoryAsked(deps, code);
        const second = look(b.ctx, deps, code);
        await asked;
        const [ra, rb] = await Promise.all([first, second]);
        expect(ra).toMatchObject({ result: "found", newlyVisible: true });
        expect(rb).toMatchObject({ result: "found", newlyVisible: true });
        expect(await attempts()).toBe(1);
      } finally {
        await suite.client.query(
          "DROP TRIGGER test_slow ON foods; DROP FUNCTION test_slow(); DROP SEQUENCE test_attempts",
        );
      }
      expect(stub.calls).toHaveLength(1);
      expect(await stored(code)).toHaveLength(1);
    });

    it("stores nothing for an incomplete or an unknown product, and answers the next lookup from memory", async () => {
      const { stub, deps, clock } = await setup();
      const a = await user();
      const [missing, wrong, unknown] = [await newEan13(), await newEan13(), await newEan13()];
      product(stub, missing, "Ilman rasvaa", {}, { fat_100g: null });
      product(stub, wrong, "Mahdoton", {}, { proteins_100g: 60, carbohydrates_100g: 60 });
      for (let round = 0; round < 2; round++) {
        expect(await look(a.ctx, deps, missing)).toEqual({
          result: "incomplete",
          barcode: missing,
          reason: "missing_values",
          product: { name: "Ilman rasvaa, Valio", per100g: { energyKcal: 39, proteinG: 3.3, carbsG: 3.1, fatG: null } },
        });
        expect(await look(a.ctx, deps, wrong)).toMatchObject({ result: "incomplete", reason: "implausible_values" });
        expect(await look(a.ctx, deps, unknown)).toEqual({ result: "not_found", barcode: unknown });
      }
      expect(stub.calls).toHaveLength(3);
      for (const code of [missing, wrong, unknown]) expect(await stored(code)).toEqual([]);
      clock.advance(10 * 60_000);
      await look(a.ctx, deps, unknown);
      expect(stub.calls).toHaveLength(4);
    });

    it("answers not found, stores nothing and remembers it, when Open Food Facts answers under another code", async () => {
      const { stub, deps } = await setup();
      const a = await user();
      const [asked, other] = [await newEan13(), await newEan13()];
      // The answer echoes the asked code at the top. Only `product.code` says which product it is.
      stub.answers.set(asked, { body: offBody(other, "Yhdistetty tuote") });
      expect(await look(a.ctx, deps, asked)).toEqual({ result: "not_found", barcode: asked });
      expect(await look(a.ctx, deps, asked)).toEqual({ result: "not_found", barcode: asked });
      expect(stub.calls).toHaveLength(1);
      expect(await stored(asked)).toEqual([]);
      expect(await stored(other)).toEqual([]);
    });

    it("answers not found and stores nothing when the product names no code of its own", async () => {
      const { stub, deps } = await setup();
      const a = await user();
      const code = await newEan13();
      stub.answers.set(code, { body: offBody(code, "Nimetön koodi", { code: undefined }) });
      expect(await look(a.ctx, deps, code)).toEqual({ result: "not_found", barcode: code });
      expect(await stored(code)).toEqual([]);
    });

    it("answers not found with no call for a retired stored product", async () => {
      const { stub, deps } = await setup();
      const a = await user();
      const code = await newEan13();
      product(stub, code, "Poistettu");
      await look(a.ctx, deps, code);
      await suite.client.query("UPDATE foods SET retired_at = now() WHERE lpad(barcode, 14, '0') = lpad($1, 14, '0')", [
        code,
      ]);
      const b = await user();
      expect(await look(b.ctx, deps, code)).toEqual({ result: "not_found", barcode: code });
      expect(await look(a.ctx, deps, code)).toEqual({ result: "not_found", barcode: code });
      expect(stub.calls).toHaveLength(1);
    });

    it("keeps the stored product and removes the user's lookups when the account is deleted", async () => {
      const { stub, deps } = await setup();
      const a = await user();
      const code = await newEan13();
      product(stub, code, "Jää jäljelle");
      await look(a.ctx, deps, code);
      await suite.client.query("DELETE FROM users WHERE id = $1", [a.id]);
      expect(await stored(code)).toHaveLength(1);
      const { rows } = await suite.client.query("SELECT count(*)::int AS n FROM food_lookups WHERE user_id = $1", [
        a.id,
      ]);
      expect(rows[0].n).toBe(0);
    });
  });

  describe("budgets", () => {
    const codes = (n: number) => Promise.all(Array.from({ length: n }, () => newEan13()));

    it("refuses a user's 31st call in an hour with barcode_lookup_limit, while another user gets through", async () => {
      const { deps, clock } = await setup();
      // A server bucket that never runs dry here, so only the user's budget is tested.
      const { tokenBucket } = await import("../../lib/openFoodFacts/limiter.js");
      deps.serverBudget = tokenBucket({ capacity: 100, refillEveryMs: 6_000, now: clock.now });
      const [a, b] = [await user(), await user()];
      for (const code of await codes(30)) await look(a.ctx, deps, code);
      clock.advance(119_999);
      await expect(look(a.ctx, deps, await newEan13())).rejects.toMatchObject({
        status: 429,
        code: "barcode_lookup_limit",
      });
      await expect(look(b.ctx, deps, await newEan13())).resolves.toMatchObject({ result: "not_found" });
    });

    it("refuses with barcode_lookup_busy when the server's bucket is empty, and the user keeps their call", async () => {
      const { stub, deps, clock } = await setup();
      const a = await user();
      // Exactly one call left for the user, with no time for their bucket to refill.
      for (let i = 0; i < 29; i++) deps.userBudget.take(a.id);
      // Empty the server's bucket, as other users' calls would.
      for (let i = 0; i < 10; i++) deps.serverBudget.take();
      await expect(look(a.ctx, deps, await newEan13())).rejects.toMatchObject({
        status: 429,
        code: "barcode_lookup_busy",
        retryAfterSeconds: 6,
      });
      expect(stub.calls).toEqual([]);
      // Six seconds give the server one call back and the user a twentieth of one.
      clock.advance(6_000);
      await expect(look(a.ctx, deps, await newEan13())).resolves.toMatchObject({ result: "not_found" });
      expect(stub.calls).toHaveLength(1);
      await expect(look(a.ctx, deps, await newEan13())).rejects.toMatchObject({
        status: 429,
        code: "barcode_lookup_limit",
        retryAfterSeconds: 120,
      });
      expect(stub.calls).toHaveLength(1);
    });

    it("answers the user's limit first when both buckets are empty", async () => {
      const { deps } = await setup();
      const a = await user();
      for (let i = 0; i < 30; i++) deps.userBudget.take(a.id);
      for (let i = 0; i < 10; i++) deps.serverBudget.take();
      await expect(look(a.ctx, deps, await newEan13())).rejects.toMatchObject({ code: "barcode_lookup_limit" });
    });

    it("spends nothing on an own food, a stored product or a remembered answer", async () => {
      const { stub, deps } = await setup();
      const a = await user();
      const [known, unknown, own] = [await newEan13(), await newEan13(), await newEan13()];
      product(stub, known, "Tunnettu");
      await look(a.ctx, deps, known);
      await look(a.ctx, deps, unknown);
      await ownFood(a.ctx, own);
      for (let i = 0; i < 30; i++) deps.userBudget.take(a.id);
      expect(await look(a.ctx, deps, known)).toMatchObject({ result: "found" });
      expect(await look(a.ctx, deps, unknown)).toMatchObject({ result: "not_found" });
      expect(await look(a.ctx, deps, own)).toMatchObject({ result: "found", food: { isOwn: true } });
    });

    it("answers 503 barcode_lookup_unavailable when Open Food Facts fails, and remembers nothing", async () => {
      const { stub, deps } = await setup();
      const a = await user();
      const code = await newEan13();
      stub.answers.set(code, "network");
      await expect(look(a.ctx, deps, code)).rejects.toMatchObject({ status: 503, code: "barcode_lookup_unavailable" });
      stub.answers.set(code, { status: 503 });
      await expect(look(a.ctx, deps, code)).rejects.toMatchObject({ status: 503 });
      expect(stub.calls).toHaveLength(2);
      expect(await stored(code)).toEqual([]);
    });
  });
});
