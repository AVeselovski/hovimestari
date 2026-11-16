import { AddEntryBodySchema } from "@hovimestari/types";
import { describe, expect, it } from "@jest/globals";
import { randomUUID } from "node:crypto";
import { signUp, type ApiUser } from "../../__tests__/support/apiUser.js";
import { addDays, daysApi } from "../../__tests__/support/daysApi.js";
import { serviceHolder, sqlHolder } from "../../__tests__/support/holder.js";
import { sessionApi } from "../../__tests__/support/sessionApi.js";
import { describeWithDb } from "../../db/__tests__/support/throwawayDb.js";
import { addEntry, copyEntries } from "../writes/entries.js";

// The races the locks close, run on two connections. One side holds its
// transaction open, the other goes through the API, and pg_locks shows the
// API request waiting before the holder commits, so no test depends on a
// sleep. What each test pins:
//
// - "deleting a food" and the first "editing a food" test: the food edit and
//   delete wait for an add that holds the food FOR SHARE. The holder replays
//   the add in raw SQL, so they pin the edit and the delete, not addEntry.
// - "an add through the service": the real addEntry on the holder side, so
//   it pins addEntry's FOR SHARE read of the food.
// - "the user lock comes first": addEntry takes the user's row before the
//   food, so it holds nothing on the food while it queues.
// - "repeats in flight": the real addEntry and copyEntries on both sides.
//   A repeat that meets the first request's uncommitted row answers replayed.
// - "another user's id in flight": a copy that inserted some rows and then
//   meets another user's id answers 409 and its transaction keeps none.
// - "rows locked in id order": the planned-entry rewrite and the status
//   batch lock the entries they change in id order, so the two never deadlock.

const tomorrow = () => addDays(new Date().toISOString().slice(0, 10), 2);
const per100g = (energyKcal: number) => ({ energyKcal, proteinG: 10, carbsG: 0, fatG: 0 });

await describeWithDb("entryRaces", (suite) => {
  const d = daysApi(suite);
  const sessions = sessionApi(suite);

  /** What addEntry does for a planned food entry, in raw SQL on `tx`: the food read FOR SHARE, then the insert. */
  async function addOnHolder(tx: Awaited<ReturnType<typeof sqlHolder>>, user: ApiUser, foodId: string) {
    const id = randomUUID();
    const { rows } = await tx.query("SELECT energy_kcal FROM foods WHERE id = $1 FOR SHARE", [foodId]);
    await tx.query(
      `INSERT INTO entries (id, user_id, date, status, kind, food_id, grams,
         basis_energy_kcal, basis_protein_g, basis_carbs_g, basis_fat_g)
       VALUES ($1, $2, $3, 'planned', 'food', $4, 100, $5, 10, 0, 0)`,
      [id, user.id, tomorrow(), foodId, rows[0].energy_kcal],
    );
    return id;
  }

  const basisOf = async (entryId: string) =>
    Number(
      (await suite.client.query("SELECT basis_energy_kcal FROM entries WHERE id = $1", [entryId])).rows[0]
        ?.basis_energy_kcal,
    );
  const editFood = (user: ApiUser, food: string, energyKcal: number) =>
    d
      .api()
      .put(d.v1(`/foods/${food}`))
      .set(user.auth)
      .send({ name: "Oma ruoka", per100g: per100g(energyKcal), barcode: null })
      .then((res) => res);

  describe("deleting a food while an add is in flight", () => {
    it("waits for the add, then hides the food and keeps the entry", async () => {
      const user = await signUp(suite.client);
      const food = await d.ownFood(user, per100g(100));
      const add = await sqlHolder(suite.url);
      const entryId = await addOnHolder(add, user, food);

      const deleting = d
        .api()
        .delete(d.v1(`/foods/${food}`))
        .set(user.auth)
        .then((res) => res);
      const waited = await sessions.queuedOnLock(1);
      await add.commit();
      const res = await deleting;

      expect(waited).toBe(1);
      expect(res.status).toBe(204);
      const entry = await suite.client.query("SELECT id FROM entries WHERE id = $1", [entryId]);
      expect(entry.rows).toHaveLength(1); // deleted outright, the cascade would have taken it
      const row = await suite.client.query("SELECT deleted_at FROM foods WHERE id = $1", [food]);
      expect(row.rows[0].deleted_at).toBeInstanceOf(Date);
    });
  });

  describe("editing a food while an add is in flight", () => {
    it("an add holding the food FOR SHARE ends with the new values: the edit waits, and its rewrite sees the entry", async () => {
      const user = await signUp(suite.client);
      const food = await d.ownFood(user, per100g(100));
      const add = await sqlHolder(suite.url);
      const entryId = await addOnHolder(add, user, food);

      const editing = editFood(user, food, 150);
      const waited = await sessions.queuedOnLock(1);
      await add.commit();
      const res = await editing;

      expect(waited).toBe(1);
      expect(res.status).toBe(200);
      expect(await basisOf(entryId)).toBe(150);
    });

    it("an add through the service holds the food, so the edit waits and rewrites the new entry", async () => {
      const user = await signUp(suite.client);
      const food = await d.ownFood(user, per100g(100));
      const body = d.foodBody(food, { grams: 100 }, { date: tomorrow(), status: "planned" });
      const add = await serviceHolder(await d.contextAt(user.id), (ctx) =>
        addEntry(ctx, AddEntryBodySchema.parse(body)),
      );

      const editing = editFood(user, food, 150);
      const waited = await sessions.queuedOnLock(1);
      await add.commit();
      const res = await editing;

      expect(add.value.outcome).toBe("created");
      expect(waited).toBe(1);
      expect(res.status).toBe(200);
      expect(await basisOf(body.id)).toBe(150);
    });

    it("an add that comes while the edit holds the food waits for it and reads the new values", async () => {
      const user = await signUp(suite.client);
      const food = await d.ownFood(user, per100g(100));
      const edit = await sqlHolder(suite.url);
      await edit.query("UPDATE foods SET energy_kcal = 150 WHERE id = $1", [food]);

      const body = d.foodBody(food, { grams: 100 }, { date: tomorrow(), status: "planned" });
      const adding = d.add(user, body).then((res) => res);
      const waited = await sessions.queuedOnLock(1);
      await edit.commit();
      const res = await adding;

      expect(waited).toBe(1);
      expect(res.status).toBe(201);
      expect(res.body.entry.figures.energyKcal).toBe(150);
      expect(await basisOf(body.id)).toBe(150);
    });
  });

  describe("the user lock comes first", () => {
    it("an add queued on the user's row holds no lock on the food yet", async () => {
      const user = await signUp(suite.client);
      const food = await d.ownFood(user, per100g(100));
      const deletion = await sqlHolder(suite.url);
      await deletion.query("SELECT id FROM users WHERE id = $1 FOR UPDATE", [user.id]);

      const adding = d.add(user, d.foodBody(food, { grams: 100 })).then((res) => res);
      const waited = await sessions.queuedOnLock(1);
      // A lock on the food that conflicts with the add's FOR SHARE, refused at once if the add held one.
      const food_locked = suite.client.query("SELECT id FROM foods WHERE id = $1 FOR UPDATE NOWAIT", [food]).then(
        () => "free" as const,
        (err: { code?: string }) => err.code,
      );
      const onFood = await food_locked;
      await deletion.rollback();
      const res = await adding;

      expect(waited).toBe(1);
      expect(onFood).toBe("free");
      expect(res.status).toBe(201);
    });
  });

  describe("repeats in flight", () => {
    it("an add repeated while the first is uncommitted answers 200 replayed, with one row", async () => {
      const user = await signUp(suite.client);
      const food = await d.fineliFood();
      const body = d.foodBody(food.id, { grams: 120 });
      const first = await serviceHolder(await d.contextAt(user.id), (ctx) =>
        addEntry(ctx, AddEntryBodySchema.parse(body)),
      );

      const repeat = d.add(user, body).then((res) => res);
      const waited = await sessions.queuedOnLock(1);
      await first.commit();
      const res = await repeat;

      expect(first.value.outcome).toBe("created");
      expect(waited).toBe(1);
      expect({ status: res.status, outcome: res.body.outcome }).toEqual({ status: 200, outcome: "replayed" });
      expect(res.body.entry.id).toBe(body.id);
      expect(await d.entryCount(user.id)).toBe(1);
    });

    it("a copy repeated while the first is uncommitted answers 200 replayed, with no duplicate", async () => {
      const user = await signUp(suite.client);
      const food = await d.fineliFood();
      const source = await d.added(user, d.foodBody(food.id, { grams: 120 }));
      const toDate = tomorrow();
      const pairs = [{ sourceId: source.id, id: randomUUID() }];
      const first = await serviceHolder(await d.contextAt(user.id), (ctx) =>
        copyEntries(ctx, { toDate, entries: pairs }),
      );

      const repeat = d.copy(user, toDate, pairs).then((res) => res);
      const waited = await sessions.queuedOnLock(1);
      await first.commit();
      const res = await repeat;

      expect(first.value.outcome).toBe("created");
      expect(waited).toBe(1);
      expect({ status: res.status, outcome: res.body.outcome }).toEqual({ status: 200, outcome: "replayed" });
      expect(res.body.entries.map((e: { id: string }) => e.id)).toEqual([pairs[0].id]);
      expect(await d.entryCount(user.id)).toBe(2);
    });

    it("a copy that meets one held id inserts the rest and answers 201 with all of them", async () => {
      const user = await signUp(suite.client);
      const food = await d.fineliFood();
      const source = await d.added(user, d.foodBody(food.id, { grams: 120 }));
      const toDate = tomorrow();
      const pairs = [
        { sourceId: source.id, id: randomUUID() },
        { sourceId: source.id, id: randomUUID() },
      ];
      const first = await serviceHolder(await d.contextAt(user.id), (ctx) =>
        copyEntries(ctx, { toDate, entries: pairs.slice(0, 1) }),
      );

      const wider = d.copy(user, toDate, pairs).then((res) => res);
      const waited = await sessions.queuedOnLock(1);
      await first.commit();
      const res = await wider;

      expect(waited).toBe(1);
      expect({ status: res.status, outcome: res.body.outcome }).toEqual({ status: 201, outcome: "created" });
      expect(res.body.entries.map((e: { id: string }) => e.id).sort()).toEqual(pairs.map((p) => p.id).sort());
      expect(await d.entryCount(user.id)).toBe(3);
    });
  });

  describe("another user's id in flight", () => {
    it("a copy that meets another user's uncommitted id answers 409 and keeps none of its copies", async () => {
      const user = await signUp(suite.client);
      const other = await signUp(suite.client);
      const food = await d.fineliFood();
      const source = await d.added(user, d.foodBody(food.id, { grams: 120 }));
      const toDate = tomorrow();
      const pairs = [
        { sourceId: source.id, id: randomUUID() },
        { sourceId: source.id, id: randomUUID() },
      ];
      const theirs = await sqlHolder(suite.url);
      await theirs.query(
        `INSERT INTO entries (id, user_id, date, status, kind, name, basis_energy_kcal, basis_protein_g, basis_carbs_g, basis_fat_g)
         VALUES ($1, $2, $3, 'planned', 'estimate', 'Theirs', 100, 10, 10, 1)`,
        [pairs[1].id, other.id, toDate],
      );

      const copying = d.copy(user, toDate, pairs).then((res) => res);
      const waited = await sessions.queuedOnLock(1);
      await theirs.commit();
      const res = await copying;

      expect(waited).toBe(1);
      expect([res.status, res.body.code]).toEqual([409, "entry_id_taken"]);
      const mine = await suite.client.query("SELECT id FROM entries WHERE id = $1", [pairs[0].id]);
      expect(mine.rows).toEqual([]);
      expect(await d.entryCount(user.id)).toBe(1);
    });
  });

  describe("rows locked in id order", () => {
    /** Two entries of `food`, added so the higher id is stored first: [lower id, higher id]. Planned tomorrow by default. */
    async function twoEntries(user: ApiUser, food: string, opts: { status?: "eaten" } = {}): Promise<[string, string]> {
      const [low, high] = [randomUUID(), randomUUID()].sort();
      const at = opts.status ? {} : { date: tomorrow(), status: "planned" as const };
      for (const id of [high, low]) await d.added(user, d.foodBody(food, { grams: 100 }, { id, ...at }));
      return [low, high];
    }

    /**
     * The holder locks the lower id, the request queues, then the holder
     * locks the higher id. A request that locked the higher id first would
     * deadlock with the holder here.
     */
    async function lockInOrderAgainst(ids: [string, string], send: () => Promise<{ status: number }>) {
      const other = await sqlHolder(suite.url);
      await other.query("SELECT id FROM entries WHERE id = $1 FOR NO KEY UPDATE", [ids[0]]);
      const sending = send().then((res) => res);
      const waited = await sessions.queuedOnLock(1);
      const second = await other.query("SELECT id FROM entries WHERE id = $1 FOR NO KEY UPDATE", [ids[1]]).then(
        () => "locked" as const,
        (err: { code?: string }) => err.code,
      );
      await other.commit().catch(() => {});
      return { waited, second, res: await sending };
    }

    it("a food edit's rewrite of planned entries", async () => {
      const user = await signUp(suite.client);
      const food = await d.ownFood(user, per100g(100));
      const ids = await twoEntries(user, food);
      const { waited, second, res } = await lockInOrderAgainst(ids, () => editFood(user, food, 150));
      expect({ waited, second, status: res.status }).toEqual({ waited: 1, second: "locked", status: 200 });
      expect(await basisOf(ids[1])).toBe(150);
    });

    it("a status batch", async () => {
      const user = await signUp(suite.client);
      const food = await d.ownFood(user, per100g(100));
      const ids = await twoEntries(user, food, { status: "eaten" });
      const { waited, second, res } = await lockInOrderAgainst(ids, () =>
        d.setStatus(user, [ids[1], ids[0]], "planned").then((r) => r),
      );
      expect({ waited, second, status: res.status }).toEqual({ waited: 1, second: "locked", status: 200 });
    });
  });
});
