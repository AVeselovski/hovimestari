import type { Day } from "@hovimestari/types";
import { afterAll, beforeAll, describe, expect, it, jest } from "@jest/globals";
import type { Client } from "@modelcontextprotocol/client";
import { randomUUID } from "node:crypto";
import { signUp, type ApiUser } from "../../__tests__/support/apiUser.js";
import { daysApi } from "../../__tests__/support/daysApi.js";
import { fakeClock, newEan13, offBody, offStub, stubDeps, type OffStub } from "../../__tests__/support/offStub.js";
import { describeWithDb } from "../../db/__tests__/support/throwawayDb.js";
import { connect, freezeDate, listen, quietConsole } from "./harness.js";

// Every read tool against the REST route that calls the same service, on a
// real, migrated Postgres, through a real MCP client and a key made by
// POST /connections, on one frozen clock. A tool answers the route's fields
// as the route names them, and drops only what the design drops. The clock
// is 23:30 UTC, already the next day in Helsinki, so a tool's today is the
// person's today in their zone, as the route's is.

quietConsole();
const NOW = "2026-11-19T23:30:00.000Z";
const TODAY = "2026-11-20"; // a Friday in Helsinki
const YESTERDAY = "2026-11-19";
const BEFORE_TARGETS = "2026-11-15"; // the Sunday before the first change
const FIRST_CHANGE = "2026-11-16";
const SECOND_CHANGE = "2026-11-21";
// Numbers no figure of the seeded entries comes near, so a day that answered
// a nearby change's numbers would show one of them.
const FIRST_RANGES = { energy: [1777, 2333], protein: [133, 177] } as const;
const SECOND_RANGES = { energy: [1888, 2444], protein: [144, 188] } as const;

const READ_TOOL_NAMES = [
  "get_context",
  "get_targets",
  "get_day",
  "get_days",
  "search_foods",
  "get_food",
  "list_favourite_foods",
  "list_own_foods",
  "list_recent_items",
  "list_saved_meals",
  "get_saved_meal",
  "look_up_barcode",
];

const FOOD_GONE = "This food is no longer available. (food_not_found)";
const MEAL_GONE = "This saved meal is no longer available. (saved_meal_not_found)";

type ToolResult = { isError?: boolean; content: { type: string; text: string }[] };

/** Every number anywhere in `value`. */
function numbersIn(value: unknown): number[] {
  if (typeof value === "number") return [value];
  if (value && typeof value === "object") return Object.values(value).flatMap(numbersIn);
  return [];
}

await describeWithDb("mcp read tools", (suite) => {
  const d = daysApi(suite);
  const api = d.api;

  describe("on a frozen clock", () => {
    let server: Awaited<ReturnType<typeof listen>>;
    let user: ApiUser;
    let client: Client;
    const ids = {} as { fineli: string; own: string; meal: string; archivedMeal: string };

    /** A signed-in user in Helsinki with a read key made through the API. */
    async function userWithKey(): Promise<{ user: ApiUser; key: string }> {
      const u = await signUp(suite.client);
      await suite.client.query("UPDATE users SET time_zone = 'Europe/Helsinki' WHERE id = $1", [u.id]);
      const res = await api().post("/api/v1/connections").set(u.auth).send({ name: "Claude on my laptop" });
      expect(res.status).toBe(201);
      return { user: u, key: res.body.key as string };
    }

    beforeAll(async () => {
      freezeDate(NOW);
      server = await listen(suite.app);
      const made = await userWithKey();
      user = made.user;
      await d.targets(user, FIRST_CHANGE, [...FIRST_RANGES.energy], [...FIRST_RANGES.protein]);
      await d.targets(user, SECOND_CHANGE, [...SECOND_RANGES.energy], [...SECOND_RANGES.protein]);
      ids.fineli = (await d.fineliFood()).id;
      ids.own = await d.ownFood(user, { energyKcal: 120, proteinG: 11, carbsG: 4, fatG: 6 }, "Oma rahka");
      ids.meal = await d.meal(user, { energyKcal: 650, proteinG: 42, carbsG: 70, fatG: 20 }, "Lounas", "Wolt");
      ids.archivedMeal = await d.meal(user, { energyKcal: 500, proteinG: 30, carbsG: 50, fatG: 15 }, "Vanha");
      expect((await api().put(`/api/v1/saved-meals/${ids.archivedMeal}/archived`).set(user.auth)).status).toBe(204);
      expect((await api().put(`/api/v1/foods/${ids.fineli}/favourite`).set(user.auth)).status).toBe(204);
      const entries = [
        d.foodBody(ids.fineli, { grams: 150 }, { date: BEFORE_TARGETS }),
        d.foodBody(ids.fineli, { grams: 200 }, { date: YESTERDAY }),
        d.mealBody(ids.meal, 1, { date: YESTERDAY, status: "planned" }),
        d.foodBody(ids.own, { grams: 100 }, { date: YESTERDAY }),
        d.foodBody(ids.own, { grams: 250 }, { date: TODAY }),
        d.estimateBody({ energyKcal: 700, proteinG: 25, carbsG: 80, fatG: 30 }, { date: TODAY, status: "planned" }),
        d.mealBody(ids.meal, 2, { date: "2026-11-22", status: "planned" }),
      ];
      for (const body of entries) await d.added(user, body);
      client = await connect(server.url, made.key);
    });

    afterAll(async () => {
      await client?.close();
      await server?.close();
      jest.useRealTimers();
    });

    const call = async (name: string, args: Record<string, unknown> = {}, on: Client = client) =>
      (await on.callTool({ name, arguments: args })) as ToolResult;

    /** The tool's `data`, after checking the envelope carries the person's today and zone. */
    async function data(name: string, args: Record<string, unknown> = {}, on: Client = client): Promise<unknown> {
      const result = await call(name, args, on);
      expect(result.isError).toBeFalsy();
      const answer = JSON.parse(result.content[0].text) as { today: string; timeZone: string; data: unknown };
      expect([answer.today, answer.timeZone]).toEqual([TODAY, "Europe/Helsinki"]);
      return answer.data;
    }

    async function route(path: string, query: Record<string, string> = {}, as: ApiUser = user): Promise<unknown> {
      const res = await api().get(`/api/v1${path}`).query(query).set(as.auth);
      expect(res.status).toBe(200);
      return res.body;
    }

    describe("the list", () => {
      // Their annotations are pinned in router.test.ts, which needs no database.
      it("is exactly the 12 read tools", async () => {
        const { READ_TOOLS } = await import("../tools/index.js");
        const { tools } = await client.listTools();
        expect(tools.map((t) => t.name).sort()).toEqual([...READ_TOOL_NAMES].sort());
        expect(READ_TOOLS.map((t) => t.name).sort()).toEqual([...READ_TOOL_NAMES].sort());
      });
    });

    describe("targets and days", () => {
      it("get_targets answers GET /targets without the screen's first-run flag", async () => {
        /** The route's answer without `firstRunDue`, which it does carry. */
        const withoutFirstRun = (body: unknown): Record<string, unknown> => {
          const copy = { ...(body as Record<string, unknown>) };
          expect(copy).toHaveProperty("firstRunDue");
          delete copy.firstRunDue;
          return copy;
        };
        const onToday = withoutFirstRun(await route("/targets"));
        expect(await data("get_targets")).toEqual(onToday);
        expect(await data("get_targets", { date: "today" })).toEqual(onToday);
        const later = withoutFirstRun(await route("/targets", { date: SECOND_CHANGE }));
        expect(await data("get_targets", { date: SECOND_CHANGE })).toEqual(later);
        expect((later.inForce as { effectiveFrom: string }).effectiveFrom).toBe(SECOND_CHANGE);
      });

      it("get_day answers GET /days/:date field for field, with both readings", async () => {
        for (const date of [TODAY, YESTERDAY, BEFORE_TARGETS, "2026-11-22"]) {
          expect(await data("get_day", { date })).toEqual(await route(`/days/${date}`));
        }
        const today = (await data("get_day", { date: "today" })) as Record<string, { figures: { energyKcal: number } }>;
        expect(today).toEqual(await route(`/days/${TODAY}`));
        // The planned estimate is in the reading with the plan only.
        expect(today.withPlan.figures.energyKcal).toBeGreaterThan(today.eaten.figures.energyKcal);
      });

      it("get_day on a day without targets answers targets null, positions null and the figures", async () => {
        const day = (await data("get_day", { date: BEFORE_TARGETS })) as {
          targets: unknown;
          eaten: { energy: unknown; protein: unknown; figures: { energyKcal: number } };
          withPlan: { energy: unknown; protein: unknown };
        };
        expect(day.targets).toBeNull();
        expect([day.eaten.energy, day.eaten.protein, day.withPlan.energy, day.withPlan.protein]).toEqual([
          null,
          null,
          null,
          null,
        ]);
        expect(day.eaten.figures.energyKcal).toBe(89);
      });

      it("get_day on a past day with targets and no entries answers null positions, the targets and the route's answer", async () => {
        const date = "2026-11-17"; // after the first change, before today, nothing logged
        const day = (await data("get_day", { date })) as Day;
        expect(day).toEqual(await route(`/days/${date}`));
        expect([day.relation, day.entryCount, day.targets?.energyKcal.lower]).toEqual([
          "past",
          0,
          FIRST_RANGES.energy[0],
        ]);
        expect([day.eaten.energy, day.eaten.protein, day.withPlan.energy, day.withPlan.protein]).toEqual([
          null,
          null,
          null,
          null,
        ]);
      });

      it("never answers a nearby change's numbers for a day before the first change", async () => {
        const nearby: number[] = [...FIRST_RANGES.energy, ...FIRST_RANGES.protein, ...SECOND_RANGES.energy];
        const answers = [
          await data("get_day", { date: BEFORE_TARGETS }),
          await data("get_days", { from: "2026-11-14", to: BEFORE_TARGETS }),
        ];
        for (const answer of answers) expect(numbersIn(answer).filter((n) => nearby.includes(n))).toEqual([]);
        const targets = (await data("get_targets", { date: BEFORE_TARGETS })) as { inForce: unknown };
        expect(targets.inForce).toBeNull();
        // The pin can fail: the same tools on the next day do answer the change's numbers.
        expect(numbersIn(await data("get_day", { date: FIRST_CHANGE }))).toEqual(
          expect.arrayContaining([...FIRST_RANGES.energy]),
        );
      });

      it("get_days answers GET /days for a range, every day with both readings", async () => {
        const days = (await data("get_days", { from: BEFORE_TARGETS, to: "2026-11-22" })) as {
          days: Record<string, unknown>[];
        };
        expect(days).toEqual(await route("/days", { from: BEFORE_TARGETS, to: "2026-11-22" }));
        expect(days.days).toHaveLength(8);
        for (const day of days.days) expect(day).toEqual(expect.objectContaining({ eaten: expect.anything() }));
        for (const day of days.days) expect(day).toEqual(expect.objectContaining({ withPlan: expect.anything() }));
      });

      it("get_days { weekOf } reads Monday to Sunday of that week, today included", async () => {
        const week = await route("/days", { from: "2026-11-16", to: "2026-11-22" });
        const of19 = (await data("get_days", { weekOf: "2026-11-19" })) as { days: { date: string }[] };
        expect(of19.days.map((day) => day.date)).toEqual([
          "2026-11-16",
          "2026-11-17",
          "2026-11-18",
          "2026-11-19",
          "2026-11-20",
          "2026-11-21",
          "2026-11-22",
        ]);
        expect(of19).toEqual(week);
        expect(await data("get_days", { weekOf: "today" })).toEqual(week);
        expect(await data("get_days", { weekOf: "2026-11-22" })).toEqual(week);
      });

      it("get_days refuses weekOf with from or to, from without to, and more than 42 days", async () => {
        for (const args of [
          { from: "2026-11-16", weekOf: "2026-11-19" },
          { to: "2026-11-22", weekOf: "2026-11-19" },
          { from: "2026-11-16" },
          {},
          { from: "2026-10-01", to: "2026-11-12" },
          { from: "2026-11-22", to: "2026-11-16" },
        ]) {
          expect((await call("get_days", args)).isError).toBe(true);
        }
        const both = await call("get_days", { from: "2026-11-16", weekOf: "2026-11-19" });
        expect(both.content[0].text).toContain("Give weekOf alone, or from and to without weekOf.");
        // The bound is the route's: 42 days with both ends counted. `to` 41 days
        // after `from` answers. 42 days after is refused by both, and the
        // refusal says what was wrong, as the description of `to` does.
        const longest = { from: "2026-10-01", to: "2026-11-11" };
        expect(await data("get_days", longest)).toEqual(await route("/days", longest));
        const tooLong = await call("get_days", { from: "2026-10-01", to: "2026-11-12" });
        expect(tooLong.content[0].text).toBe(
          "Input validation error: Invalid arguments for tool get_days: " +
            "from must be on or before to, and a range holds at most 42 days, both ends counted.",
        );
        const route43 = await api().get("/api/v1/days").query({ from: "2026-10-01", to: "2026-11-12" }).set(user.auth);
        expect(route43.status).toBe(400);
        const { tools } = await client.listTools();
        const to = tools.find((t) => t.name === "get_days")?.inputSchema.properties?.to as { description: string };
        expect(to.description).toContain("A range holds at most 42 days, both ends counted.");
      });

      it("get_days answers a date that is not a date with that date's refusal alone", async () => {
        for (const from of ["today", "2026-02-30", "nope"]) {
          const refused = await call("get_days", { from, to: "2026-11-22" });
          expect(refused.isError).toBe(true);
          expect(refused.content[0].text).toBe(
            "Input validation error: Invalid arguments for tool get_days: from: invalid_date",
          );
        }
      });
    });

    describe("foods", () => {
      it("search_foods answers GET /foods/search, with and without a limit", async () => {
        expect(await data("search_foods", { q: "rahka" })).toEqual(await route("/foods/search", { q: "rahka" }));
        const one = (await data("search_foods", { q: "rahka", limit: 1 })) as { foods: unknown[] };
        expect(one).toEqual(await route("/foods/search", { q: "rahka", limit: "1" }));
        expect(one.foods).toHaveLength(1);
      });

      it("get_food answers GET /foods/:id, and refuses another person's own food as the route does", async () => {
        for (const id of [ids.fineli, ids.own]) {
          expect(await data("get_food", { foodId: id })).toEqual(await route(`/foods/${id}`));
        }
        const other = await signUp(suite.client);
        const theirs = await d.ownFood(other, { energyKcal: 100, proteinG: 10, carbsG: 10, fatG: 1 }, "Heidän ruoka");
        const refused = await call("get_food", { foodId: theirs });
        expect(refused.isError).toBe(true);
        expect(refused.content[0].text).toBe("This food is no longer available. (food_not_found)");
        expect((await api().get(`/api/v1/foods/${theirs}`).set(user.auth)).status).toBe(404);
      });

      it("list_favourite_foods, list_own_foods and list_recent_items answer their routes", async () => {
        const favourites = (await data("list_favourite_foods")) as { foods: { id: string }[] };
        expect(favourites).toEqual(await route("/foods/favourites"));
        expect(favourites.foods.map((f) => f.id)).toEqual([ids.fineli]);
        expect(await data("list_favourite_foods", { limit: 1 })).toEqual(
          await route("/foods/favourites", { limit: "1" }),
        );
        const own = (await data("list_own_foods")) as { foods: { id: string }[] };
        expect(own).toEqual(await route("/foods/own"));
        expect(own.foods.map((f) => f.id)).toEqual([ids.own]);
        const recents = (await data("list_recent_items")) as { items: unknown[] };
        expect(recents).toEqual(await route("/log/recents"));
        expect(recents.items.length).toBeGreaterThan(1);
        expect(await data("list_recent_items", { limit: 1 })).toEqual(await route("/log/recents", { limit: "1" }));
      });
    });

    describe("saved meals", () => {
      it("list_saved_meals answers GET /saved-meals, the active ones or the archived ones", async () => {
        const active = (await data("list_saved_meals")) as { meals: { id: string }[] };
        expect(active).toEqual(await route("/saved-meals"));
        expect(active.meals.map((m) => m.id)).toEqual([ids.meal]);
        const archived = (await data("list_saved_meals", { archived: true })) as { meals: { id: string }[] };
        expect(archived).toEqual(await route("/saved-meals", { archived: "true" }));
        expect(archived.meals.map((m) => m.id)).toEqual([ids.archivedMeal]);
      });

      it("get_saved_meal answers GET /saved-meals/:id, archived or not", async () => {
        for (const id of [ids.meal, ids.archivedMeal]) {
          expect(await data("get_saved_meal", { savedMealId: id })).toEqual(await route(`/saved-meals/${id}`));
        }
      });

      it("get_saved_meal answers another person's meal and a deleted one as a missing id", async () => {
        const other = await signUp(suite.client);
        const theirs = await d.meal(other, { energyKcal: 400, proteinG: 20, carbsG: 40, fatG: 10 }, "Heidän lounas");
        // A meal a day uses is kept, marked deleted, when its owner deletes it.
        const deleted = await d.meal(user, { energyKcal: 300, proteinG: 15, carbsG: 30, fatG: 8 }, "Poistettu");
        await d.added(user, d.mealBody(deleted, 1, { date: "2026-11-18" }));
        expect((await api().delete(`/api/v1/saved-meals/${deleted}`).set(user.auth)).status).toBe(204);
        const { rows } = await suite.client.query("SELECT deleted_at FROM saved_meals WHERE id = $1", [deleted]);
        expect(rows[0].deleted_at).not.toBeNull();
        for (const id of [theirs, deleted, randomUUID()]) {
          expect((await call("get_saved_meal", { savedMealId: id })).content[0].text).toBe(MEAL_GONE);
          expect((await api().get(`/api/v1/saved-meals/${id}`).set(user.auth)).status).toBe(404);
        }
      });
    });

    describe("look_up_barcode", () => {
      let stub: OffStub;

      beforeAll(async () => {
        stub = offStub();
        const { setSharedLookupDepsForTests } = await import("../../services/writes/barcode.js");
        setSharedLookupDepsForTests(await stubDeps(stub, fakeClock()));
      });

      afterAll(async () => {
        const { setSharedLookupDepsForTests } = await import("../../services/writes/barcode.js");
        setSharedLookupDepsForTests(undefined);
      });

      it("answers as POST /foods/lookup, through the stand-in for Open Food Facts", async () => {
        const code = await newEan13();
        stub.answers.set(code, { body: offBody(code, "Kauramaito") });
        const looker = await userWithKey();
        const other = await signUp(suite.client);
        const onLooker = await connect(server.url, looker.key);
        try {
          const found = (await data("look_up_barcode", { barcode: code }, onLooker)) as {
            result: string;
            food: { id: string };
          };
          const res = await api().post("/api/v1/foods/lookup").set(other.auth).send({ barcode: code });
          expect(res.status).toBe(200);
          expect(found).toEqual(res.body);
          expect(found).toMatchObject({ result: "found", newlyVisible: true, food: { barcode: code } });
          expect(stub.calls.length).toBeGreaterThan(0);
          // Kept by others, never looked up by this person: as a missing id, in the tool and the route.
          const keptId = found.food.id;
          for (const id of [keptId, randomUUID()]) {
            expect((await call("get_food", { foodId: id })).content[0].text).toBe(FOOD_GONE);
          }
          expect((await api().get(`/api/v1/foods/${keptId}`).set(user.auth)).status).toBe(404);
        } finally {
          await onLooker.close();
        }
      });

      it("spends the person's own lookup budget, the one their scans in the app spend", async () => {
        const { sharedLookupDeps } = await import("../../services/writes/barcode.js");
        const looker = await userWithKey();
        const onLooker = await connect(server.url, looker.key);
        try {
          for (let i = 0; i < 29; i++) sharedLookupDeps().userBudget.take(looker.user.id);
          const last = await newEan13();
          stub.answers.set(last, { body: offBody(last, "Viimeinen") });
          await data("look_up_barcode", { barcode: last }, onLooker);
          expect(sharedLookupDeps().userBudget.has(looker.user.id)).toBe(false);

          const scan = await api()
            .post("/api/v1/foods/lookup")
            .set(looker.user.auth)
            .send({ barcode: await newEan13() });
          expect([scan.status, scan.body.code]).toEqual([429, "barcode_lookup_limit"]);
          const refused = await call("look_up_barcode", { barcode: await newEan13() }, onLooker);
          expect(refused.isError).toBe(true);
          expect(refused.content[0].text).toBe(
            "You have looked up many barcodes this hour. Try again later. (barcode_lookup_limit, retryAfterSeconds: 120)",
          );
          // The person's own food comes first and spends nothing.
          const ownCode = await newEan13();
          await d.ownFood(looker.user, { energyKcal: 50, proteinG: 3, carbsG: 5, fatG: 1 }, "Oma juoma", ownCode);
          const own = (await data("look_up_barcode", { barcode: ownCode }, onLooker)) as Record<string, unknown>;
          expect(own).toMatchObject({ result: "found", newlyVisible: false });
        } finally {
          await onLooker.close();
        }
      });
    });
  });

  // Sunday 22 November 23:30 UTC is already Monday 23 November in Helsinki:
  // the week of today is the person's new week, not the one UTC is still in.
  describe("on a clock where the week turns in the person's zone first", () => {
    let server: Awaited<ReturnType<typeof listen>>;

    beforeAll(async () => {
      freezeDate("2026-11-22T23:30:00.000Z");
      server = await listen(suite.app);
    });

    afterAll(async () => {
      await server?.close();
      jest.useRealTimers();
    });

    it("get_days { weekOf: today } reads the person's week, Monday 23 to Sunday 29", async () => {
      const u = await signUp(suite.client);
      await suite.client.query("UPDATE users SET time_zone = 'Europe/Helsinki' WHERE id = $1", [u.id]);
      const made = await api().post("/api/v1/connections").set(u.auth).send({ name: "Claude on my laptop" });
      expect(made.status).toBe(201);
      const client = await connect(server.url, made.body.key as string);
      try {
        const result = (await client.callTool({ name: "get_days", arguments: { weekOf: "today" } })) as ToolResult;
        const week = JSON.parse(result.content[0].text) as { today: string; data: { days: { date: string }[] } };
        expect(week.today).toBe("2026-11-23");
        expect(week.data.days.map((day) => day.date)).toEqual([
          "2026-11-23",
          "2026-11-24",
          "2026-11-25",
          "2026-11-26",
          "2026-11-27",
          "2026-11-28",
          "2026-11-29",
        ]);
        const route = await api().get("/api/v1/days").query({ from: "2026-11-23", to: "2026-11-29" }).set(u.auth);
        expect(week.data).toEqual(route.body);
      } finally {
        await client.close();
      }
    });
  });
});
