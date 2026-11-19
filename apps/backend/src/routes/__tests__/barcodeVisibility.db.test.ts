import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { format } from "node:util";
import request from "supertest";
import { signUp, type ApiUser } from "../../__tests__/support/apiUser.js";
import { daysApi } from "../../__tests__/support/daysApi.js";
import { fakeClock, newEan13, offBody, offStub, stubDeps, type OffStub } from "../../__tests__/support/offStub.js";
import { describeWithDb } from "../../db/__tests__/support/throwawayDb.js";

// POST /foods/lookup through the API, and who sees a stored product on every
// read path: search, the detail, favourites, recents and logging. A stored
// product shows only to the users who looked it up, through visibleTo.

await describeWithDb("barcodeVisibility", (suite) => {
  const d = daysApi(suite);
  const api = () => request(suite.app);
  let stub: OffStub;
  let clock: ReturnType<typeof fakeClock>;

  beforeEach(async () => {
    stub = offStub();
    clock = fakeClock();
    const { setSharedLookupDepsForTests } = await import("../../services/writes/barcode.js");
    setSharedLookupDepsForTests(await stubDeps(stub, clock));
  });

  afterEach(async () => {
    const { setSharedLookupDepsForTests } = await import("../../services/writes/barcode.js");
    setSharedLookupDepsForTests(undefined);
  });

  const lookup = (u: ApiUser, body: object) => api().post("/api/v1/foods/lookup").set(u.auth).send(body);
  const searchIds = async (u: ApiUser, q: string) =>
    ((await api().get("/api/v1/foods/search").query({ q }).set(u.auth)).body.foods as { id: string }[]).map(
      (f) => f.id,
    );
  const recentIds = async (u: ApiUser) =>
    ((await api().get("/api/v1/log/recents").set(u.auth)).body.items as { food?: { id: string } }[]).map(
      (i) => i.food?.id,
    );
  const keep = async (name: string) => {
    const code = await newEan13();
    stub.answers.set(code, { body: offBody(code, name) });
    return code;
  };

  describe("the route", () => {
    it("answers 200 with the lookup, 400 barcode_invalid for a bad body, and asks for a session", async () => {
      const a = await signUp(suite.client);
      const code = await keep("Reittijuoma");
      const ok = await lookup(a, { barcode: ` ${code.slice(0, 6)} ${code.slice(6)} ` });
      expect(ok.status).toBe(200);
      expect(ok.body).toMatchObject({ result: "found", newlyVisible: true, food: { barcode: code } });
      for (const body of [{}, { barcode: "1234567" }, { barcode: code, format: "qr" }]) {
        const bad = await lookup(a, body);
        expect(bad.status).toBe(400);
        expect(bad.body.code).toBe("barcode_invalid");
      }
      expect((await api().post("/api/v1/foods/lookup").send({ barcode: code })).status).toBe(401);
    });

    it("answers 429 with its code and a Retry-After for each budget", async () => {
      const a = await signUp(suite.client);
      const { sharedLookupDeps } = await import("../../services/writes/barcode.js");
      for (let i = 0; i < 10; i++) sharedLookupDeps().serverBudget.take();
      const busy = await lookup(a, { barcode: await newEan13() });
      expect([busy.status, busy.body.code, busy.headers["retry-after"]]).toEqual([429, "barcode_lookup_busy", "6"]);
      for (let i = 0; i < 30; i++) sharedLookupDeps().userBudget.take(a.id);
      const limit = await lookup(a, { barcode: await newEan13() });
      expect([limit.status, limit.body.code, limit.headers["retry-after"]]).toEqual([
        429,
        "barcode_lookup_limit",
        "120",
      ]);
    });

    it("answers 503 barcode_lookup_unavailable when Open Food Facts does not answer", async () => {
      const a = await signUp(suite.client);
      const code = await newEan13();
      stub.answers.set(code, { status: 502 });
      const res = await lookup(a, { barcode: code });
      expect([res.status, res.body.code]).toEqual([503, "barcode_lookup_unavailable"]);
    });

    it("answers a busy database while storing as the server's busy 503, and stores the product on the next press", async () => {
      const a = await signUp(suite.client);
      const code = await keep("Kiireinen kanta");
      await suite.client.query(`
        CREATE FUNCTION test_busy() RETURNS trigger LANGUAGE plpgsql AS
          $$ BEGIN IF NEW.name LIKE 'Kiireinen%' THEN RAISE EXCEPTION 'busy' USING ERRCODE = '57014'; END IF;
          RETURN NEW; END $$;
        CREATE TRIGGER test_busy BEFORE INSERT ON foods FOR EACH ROW EXECUTE FUNCTION test_busy();`);
      const log = jest.spyOn(console, "error").mockImplementation(() => {});
      const logged: string[] = [];
      try {
        for (let press = 0; press < 2; press++) {
          const res = await lookup(a, { barcode: code });
          expect([res.status, res.body.code, res.headers["retry-after"]]).toEqual([503, undefined, "2"]);
        }
      } finally {
        await suite.client.query("DROP TRIGGER test_busy ON foods; DROP FUNCTION test_busy()");
        logged.push(...log.mock.calls.map((args) => format(...args)));
        log.mockRestore();
      }
      // Logged as the busy database it was, without the barcode, the name or the user.
      expect(logged.length).toBeGreaterThan(0);
      for (const line of logged) expect(line).not.toMatch(new RegExp(`${code}|Kiireinen|${a.id}`));
      expect(stub.calls).toHaveLength(1);
      const res = await lookup(a, { barcode: code });
      expect(res.body).toMatchObject({ result: "found", food: { barcode: code } });
      expect(stub.calls).toHaveLength(1);
    });

    it("refuses an edit or a delete of a stored product with 403 food_read_only", async () => {
      const a = await signUp(suite.client);
      const { body } = await lookup(a, { barcode: await keep("Vain luku") });
      const per100g = { energyKcal: 1, proteinG: 1, carbsG: 1, fatG: 1 };
      const put = await api().put(`/api/v1/foods/${body.food.id}`).set(a.auth).send({ name: "Muutettu", per100g });
      expect([put.status, put.body.code]).toEqual([403, "food_read_only"]);
      const del = await api().delete(`/api/v1/foods/${body.food.id}`).set(a.auth);
      expect([del.status, del.body.code]).toEqual([403, "food_read_only"]);
    });
  });

  describe("who sees a stored product", () => {
    it("shows it on every read path to the users who looked it up, and to nobody else", async () => {
      const [a, b] = [await signUp(suite.client), await signUp(suite.client)];
      const code = await keep("Näkyvyysrahka");
      const first = await lookup(a, { barcode: code });
      expect(first.body).toMatchObject({ result: "found", newlyVisible: true });
      const id = first.body.food.id as string;

      expect(await searchIds(a, "näkyvyysrahka")).toEqual([id]);
      expect(await searchIds(b, "näkyvyysrahka")).toEqual([]);
      expect((await api().get(`/api/v1/foods/${id}`).set(b.auth)).status).toBe(404);
      expect((await api().put(`/api/v1/foods/${id}/favourite`).set(b.auth)).status).toBe(404);
      const add = await d.add(b, d.foodBody(id, { grams: 100 }));
      expect([add.status, add.body.code]).toEqual([404, "food_not_found"]);

      // A logs and stars it: it is in A's recents and favourites, never in B's.
      expect((await d.add(a, d.foodBody(id, { grams: 150 }))).status).toBe(201);
      expect((await api().put(`/api/v1/foods/${id}/favourite`).set(a.auth)).status).toBe(204);
      expect(await recentIds(a)).toContain(id);
      expect(await recentIds(b)).not.toContain(id);

      // B's first lookup: no call, and the same shape as A's first answer.
      const calls = stub.calls.length;
      const second = await lookup(b, { barcode: code });
      expect(stub.calls.length).toBe(calls);
      expect(Object.keys(second.body).sort()).toEqual(Object.keys(first.body).sort());
      expect(second.body).toMatchObject({ result: "found", newlyVisible: true, food: { id } });
      expect(await searchIds(b, "näkyvyysrahka")).toEqual([id]);
      expect((await d.add(b, d.foodBody(id, { grams: 100 }))).status).toBe(201);
      expect((await lookup(b, { barcode: code })).body.newlyVisible).toBe(false);
    });

    it("keeps a retired product in its user's favourites and days, and out of search and lookup", async () => {
      const a = await signUp(suite.client);
      const code = await keep("Poistuva tuote");
      const id = (await lookup(a, { barcode: code })).body.food.id as string;
      const entry = await d.add(a, d.foodBody(id, { grams: 200 }));
      await api().put(`/api/v1/foods/${id}/favourite`).set(a.auth);
      await suite.client.query("UPDATE foods SET retired_at = now() WHERE id = $1", [id]);

      expect(await searchIds(a, "poistuva")).toEqual([]);
      const favourites = await api().get("/api/v1/foods/favourites").set(a.auth);
      expect(favourites.body.foods).toEqual([expect.objectContaining({ id, retired: true })]);
      const day = await api().get(`/api/v1/days/${entry.body.entry.date}`).set(a.auth);
      expect(day.body.entries).toEqual([
        expect.objectContaining({ id: entry.body.entry.id, food: expect.objectContaining({ id }) }),
      ]);
      const calls = stub.calls.length;
      expect((await lookup(a, { barcode: code })).body).toEqual({ result: "not_found", barcode: code });
      expect(stub.calls.length).toBe(calls);
    });
  });
});
