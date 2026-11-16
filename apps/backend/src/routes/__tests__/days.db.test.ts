import { describe, expect, it } from "@jest/globals";
import { signUp } from "../../__tests__/support/apiUser.js";
import { addDays, daysApi, helsinkiToday } from "../../__tests__/support/daysApi.js";
import { describeWithDb } from "../../db/__tests__/support/throwawayDb.js";

// A day and a week on a real Postgres: the two readings as sums of rounded
// rows, positions against the targets in force, estimates, unmarked planned
// entries on a past day, "today" across Helsinki midnights, and the week
// equal to the days it holds.

const estimateFigures = { energyKcal: 500, proteinG: 20, carbsG: 50, fatG: 20 };

await describeWithDb("days", (suite) => {
  const d = daysApi(suite);
  const today = () => helsinkiToday();

  describe("the two readings", () => {
    it("sums rounded rows: three rows of 0.35 g show 0.4 g each and total 1.2 g, never 1.1", async () => {
      const user = await signUp(suite.client);
      const food = await d.ownFood(user, { energyKcal: 1, proteinG: 0.35, carbsG: 0, fatG: 0 });
      for (let i = 0; i < 3; i++) await d.added(user, d.foodBody(food, { grams: 100 }));
      const day = (await d.day(user, today())).body;
      expect(day.entries.map((e: { figures: { proteinG: number } }) => e.figures.proteinG)).toEqual([0.4, 0.4, 0.4]);
      expect(day.eaten.figures.proteinG).toBe(1.2);
      expect(day.withPlan.figures.proteinG).toBe(1.2);
    });

    it("answers eaten, and with plan as eaten plus planned, with positions against the ranges", async () => {
      const user = await signUp(suite.client);
      await d.targets(user, "2026-01-01", [1900, 2200], [130, 180]);
      const meal = await d.meal(user, { energyKcal: 620, proteinG: 46, carbsG: 60, fatG: 20 });
      await d.added(user, d.mealBody(meal, 2)); // 1240 kcal, 92 g eaten
      await d.added(user, d.mealBody(meal, 1, { status: "planned" })); // + 620 kcal, 46 g planned
      const res = await d.day(user, today());
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        date: today(),
        today: today(),
        relation: "today",
        targets: { energyKcal: { lower: 1900, upper: 2200 }, proteinG: { lower: 130, upper: 180 } },
        entryCount: 2,
        plannedCount: 1,
        unmarkedCount: 0,
        eaten: {
          figures: { energyKcal: 1240, proteinG: 92, carbsG: 120, fatG: 40 },
          energy: { position: "below", distance: 660 },
          protein: { position: "below", distance: 38 },
          includesEstimate: false,
        },
        withPlan: {
          figures: { energyKcal: 1860, proteinG: 138, carbsG: 180, fatG: 60 },
          energy: { position: "below", distance: 40 },
          protein: { position: "within", distance: 42 },
          includesEstimate: false,
        },
      });
    });

    it("answers a kcal distance with its decimal: 1240 against an upper bound of 2199.5 is within by 959.5", async () => {
      const user = await signUp(suite.client);
      await d.targets(user, "2026-01-01", [1000, 2199.5], [130, 180]);
      await d.added(user, d.estimateBody({ energyKcal: 1240, proteinG: 129.9, carbsG: 0, fatG: 0 }));
      const { eaten } = (await d.day(user, today())).body;
      expect(eaten.energy).toEqual({ position: "within", distance: 959.5 });
      expect(eaten.protein).toEqual({ position: "below", distance: 0.1 });
    });

    it("says per reading whether an estimate is in it", async () => {
      const user = await signUp(suite.client);
      await d.added(user, d.estimateBody(estimateFigures, { status: "planned" }));
      const { eaten, withPlan } = (await d.day(user, today())).body;
      expect(eaten.includesEstimate).toBe(false);
      expect(withPlan.includesEstimate).toBe(true);
    });

    it("answers no positions and no targets for a user without targets, and zeros for an empty day", async () => {
      const user = await signUp(suite.client);
      const { body } = await d.day(user, "2026-03-03");
      expect(body).toMatchObject({ targets: null, entries: [], entryCount: 0 });
      expect(body.eaten).toEqual({
        figures: { energyKcal: 0, proteinG: 0, carbsG: 0, fatG: 0 },
        energy: null,
        protein: null,
        includesEstimate: false,
      });
    });

    it("counts a past day's planned entries as never marked, and today's as not yet", async () => {
      const user = await signUp(suite.client);
      const food = await d.fineliFood();
      const yesterday = addDays(today(), -1);
      await d.added(user, d.foodBody(food.id, { grams: 100 }, { date: yesterday, status: "planned" }));
      await d.added(user, d.foodBody(food.id, { grams: 100 }, { status: "planned" }));
      const past = (await d.day(user, yesterday)).body;
      expect([past.relation, past.plannedCount, past.unmarkedCount]).toEqual(["past", 1, 1]);
      const now = (await d.day(user, "today")).body;
      expect([now.date, now.relation, now.plannedCount, now.unmarkedCount]).toEqual([today(), "today", 1, 0]);
    });

    it("never holds another user's entries", async () => {
      const user = await signUp(suite.client);
      const other = await signUp(suite.client);
      const food = await d.fineliFood();
      await d.added(other, d.foodBody(food.id, { grams: 100 }));
      expect((await d.day(user, today())).body.entries).toEqual([]);
    });

    it.each(["2026-02-30", "yesterday", "0000-01-01"])("refuses the date %p with invalid_date", async (date) => {
      const user = await signUp(suite.client);
      const res = await d.day(user, date);
      expect([res.status, res.body.code]).toEqual([400, "invalid_date"]);
    });
  });

  describe("today across Helsinki midnights", () => {
    it.each([
      ["2026-03-28T21:59:59Z", "2026-03-28"],
      ["2026-03-28T22:00:00Z", "2026-03-29"],
      ["2026-10-24T20:59:59Z", "2026-10-24"],
      ["2026-10-24T21:00:00Z", "2026-10-25"],
    ])("at %s the user's today is %s, and the relation of the days around it follows", async (instant, date) => {
      const user = await signUp(suite.client);
      const { getDay } = await import("../../services/reads/days.js");
      const ctx = await d.contextAt(user.id, new Date(instant));
      expect(ctx.today).toBe(date);
      expect((await getDay(ctx, addDays(date, -1))).relation).toBe("past");
      expect((await getDay(ctx, date)).relation).toBe("today");
      expect((await getDay(ctx, addDays(date, 1))).relation).toBe("future");
    });
  });

  describe("the week", () => {
    it("equals getDay without entries on every date of a range spanning three target changes", async () => {
      const user = await signUp(suite.client);
      await d.targets(user, "2026-11-03", [1800, 2000], [120, 160]);
      await d.targets(user, "2026-11-06", [1900, 2100], [130, 170]);
      await d.targets(user, "2026-11-09", [2000, 2200], [140, 180]);
      const meal = await d.meal(user, { energyKcal: 600, proteinG: 40, carbsG: 60, fatG: 20 });
      for (const [date, status] of [
        ["2026-11-02", "eaten"],
        ["2026-11-05", "planned"],
        ["2026-11-06", "eaten"],
        ["2026-11-10", "eaten"],
      ] as const) {
        await d.added(user, d.mealBody(meal, 1, { date, status }));
        await d.added(user, d.estimateBody(estimateFigures, { date, status: "planned" }));
      }
      const res = await d.range(user, "2026-11-01", "2026-11-12");
      expect(res.status).toBe(200);
      expect(res.body.days).toHaveLength(12);
      for (const summary of res.body.days) {
        const { entries, ...day } = (await d.day(user, summary.date)).body;
        expect(summary).toEqual(day);
        expect(entries).toBeDefined();
      }
      expect(res.body.days[0].targets.energyKcal.lower).toBe(1800);
      expect(res.body.days[11].targets.energyKcal.lower).toBe(2000);
    });

    it("pins inForceOn to targetsOn on every date around three changes", async () => {
      const user = await signUp(suite.client);
      await d.targets(user, "2026-11-03", [1800, 2000], [120, 160]);
      await d.targets(user, "2026-11-06", [1900, 2100], [130, 170]);
      await d.targets(user, "2026-11-09", [2000, 2200], [140, 180]);
      const { inForceOn, listTargetChanges, targetsOn } = await import("../../services/reads/targets.js");
      const ctx = await d.contextAt(user.id);
      const changes = await listTargetChanges(ctx);
      for (let i = 0; i < 12; i++) {
        const date = addDays("2026-11-01", i);
        expect(inForceOn(changes, date)).toEqual(await targetsOn(ctx, date));
      }
      expect(inForceOn([], "2026-11-01")).toBeNull();
    });

    it("refuses a range backwards or longer than 42 days, and takes 42", async () => {
      const user = await signUp(suite.client);
      const backwards = await d.range(user, "2026-11-10", "2026-11-09");
      expect([backwards.status, backwards.body.code]).toEqual([400, "invalid_request"]);
      const long = await d.range(user, "2026-11-01", addDays("2026-11-01", 42));
      expect([long.status, long.body.code]).toEqual([400, "invalid_request"]);
      expect((await d.range(user, "2026-11-01", addDays("2026-11-01", 41))).body.days).toHaveLength(42);
      const bad = await d.range(user, "2026-11-31", "2026-12-01");
      expect([bad.status, bad.body.code]).toEqual([400, "invalid_date"]);
    });
  });
});
