import { beforeEach } from "@jest/globals";
import { randomUUID } from "node:crypto";
import request from "supertest";
import type { DbSuite } from "../../db/__tests__/support/throwawayDb.js";
import type { WriteContext } from "../../services/writes/context.js";
import type { ApiUser } from "./apiUser.js";

// The days, entries and saved meal routes as the real-database suites drive
// them, with the dates they need: today in Helsinki, the zone every test user
// keeps, and the days around it.

/** `date` moved by `n` days, both `YYYY-MM-DD`. */
export function addDays(date: string, n: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

/** Today in Helsinki, the stored zone of every test user. */
export function helsinkiToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Helsinki", dateStyle: "short" }).format(new Date());
}

/** Milliseconds from `now` to the next midnight in Helsinki. */
export function untilHelsinkiMidnight(now: Date = new Date()): number {
  const clock = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Helsinki",
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => Number(clock.find((p) => p.type === type)!.value);
  const sinceMidnight = (part("hour") * 3600 + part("minute") * 60 + part("second")) * 1000 + now.getMilliseconds();
  return 86_400_000 - sinceMidnight;
}

/** How close to Helsinki midnight a test may start. Longer than any one test runs. */
const MIDNIGHT_MARGIN_MS = 20_000;

type Figures = { energyKcal: number; proteinG: number; carbsG: number; fatG: number };

let fineliIds = 800_000;

/**
 * The route helpers for `suite`. A route test reads today on the client and
 * the server reads it again, so a test that straddled Helsinki midnight would
 * see two todays. Every test of a suite that uses this therefore starts at
 * least MIDNIGHT_MARGIN_MS clear of it, waiting past midnight when it is closer.
 */
export function daysApi(suite: DbSuite) {
  beforeEach(async () => {
    const wait = untilHelsinkiMidnight();
    if (wait < MIDNIGHT_MARGIN_MS) await new Promise((resolve) => setTimeout(resolve, wait + 1_000));
  }, MIDNIGHT_MARGIN_MS + 5_000);
  const api = () => request(suite.app);
  const v1 = (path: string) => `/api/v1${path}`;

  /** A service context for `userId` at `now`, in Helsinki, on the suite's database. */
  async function contextAt(userId: string, now: Date = new Date()): Promise<WriteContext> {
    const { contextForUser } = await import("../../lib/requestContext.js");
    return contextForUser({ id: userId, timeZone: "Europe/Helsinki" }, now);
  }

  /** A Fineli food: 59.31 kcal, 10.5 g protein, 3.6 g carbohydrates, 0.2 g fat per 100 g, with a 200 g PORTM portion. */
  async function fineliFood(): Promise<{ id: string; portionId: string }> {
    const fineliId = ++fineliIds;
    const { rows } = await suite.client.query(
      `INSERT INTO foods (source, fineli_id, name, name_en, energy_kcal, protein_g, carbs_g, fat_g, fineli_type, fineli_process)
       VALUES ('fineli', $1, $2, $3, 59.31, 10.5, 3.6, 0.2, 'FOOD', 'IND') RETURNING id`,
      [fineliId, `Rahka ${fineliId}`, `Quark ${fineliId}`],
    );
    const id = rows[0].id as string;
    const portion = await suite.client.query(
      "INSERT INTO food_portions (food_id, fineli_unit, grams) VALUES ($1, 'PORTM', 200) RETURNING id",
      [id],
    );
    return { id, portionId: portion.rows[0].id as string };
  }

  /** The user's own food with `per100g`, through the API. Answers its id. */
  async function ownFood(user: ApiUser, per100g: Figures, name = "Oma ruoka", barcode: string | null = null) {
    const res = await api().post(v1("/foods")).set(user.auth).send({ name, per100g, barcode });
    if (res.status !== 201) throw new Error(`own food answered ${res.status} ${JSON.stringify(res.body)}`);
    return res.body.id as string;
  }

  /** The user's own portion of `foodId`. Answers its id. */
  async function ownPortion(user: ApiUser, foodId: string, grams: number, name = "tub") {
    const res = await api()
      .post(v1(`/foods/${foodId}/portions`))
      .set(user.auth)
      .send({ name, grams });
    if (res.status !== 201) throw new Error(`portion answered ${res.status}`);
    return res.body.id as string;
  }

  /** The user's saved meal, through the API. Answers its id. */
  async function meal(user: ApiUser, figures: Figures, name = "Lounas", source: string | null = null) {
    const id = randomUUID();
    const res = await api().post(v1("/saved-meals")).set(user.auth).send({ id, name, source, figures });
    if (res.status !== 201) throw new Error(`saved meal answered ${res.status} ${JSON.stringify(res.body)}`);
    return id;
  }

  const add = (user: ApiUser, body: object) => api().post(v1("/entries")).set(user.auth).send(body);

  /** A food entry body: grams by default, eaten today. */
  const foodBody = (
    foodId: string,
    amount: object,
    opts: { date?: string; status?: "planned" | "eaten"; id?: string } = {},
  ) => ({
    kind: "food",
    id: opts.id ?? randomUUID(),
    date: opts.date ?? helsinkiToday(),
    status: opts.status ?? "eaten",
    foodId,
    amount,
  });

  const mealBody = (
    savedMealId: string,
    count: number,
    opts: { date?: string; status?: "planned" | "eaten"; id?: string } = {},
  ) => ({
    kind: "saved_meal",
    id: opts.id ?? randomUUID(),
    date: opts.date ?? helsinkiToday(),
    status: opts.status ?? "eaten",
    savedMealId,
    count,
  });

  const estimateBody = (
    figures: Figures,
    opts: { date?: string; status?: "planned" | "eaten"; id?: string; name?: string; note?: string | null } = {},
  ) => ({
    kind: "estimate",
    id: opts.id ?? randomUUID(),
    date: opts.date ?? helsinkiToday(),
    status: opts.status ?? "eaten",
    name: opts.name ?? "Ravintola",
    note: opts.note ?? null,
    figures,
  });

  /** Adds an entry and answers it, failing loudly on anything but 201. */
  async function added(user: ApiUser, body: object) {
    const res = await add(user, body);
    if (res.status !== 201) throw new Error(`add answered ${res.status} ${JSON.stringify(res.body)}`);
    return res.body.entry as { id: string; date: string; position: number; figures: Figures };
  }

  const patch = (user: ApiUser, id: string, body: object) =>
    api()
      .patch(v1(`/entries/${id}`))
      .set(user.auth)
      .send(body);
  const setStatus = (user: ApiUser, entryIds: string[], status: string) =>
    api().post(v1("/entries/status")).set(user.auth).send({ entryIds, status });
  const copy = (user: ApiUser, toDate: string, pairs: { sourceId: string; id: string }[]) =>
    api().post(v1("/entries/copy")).set(user.auth).send({ toDate, entries: pairs });
  const remove = (user: ApiUser, id: string) =>
    api()
      .delete(v1(`/entries/${id}`))
      .set(user.auth);
  const restore = (user: ApiUser, id: string) =>
    api()
      .post(v1(`/entries/${id}/restore`))
      .set(user.auth);
  const day = (user: ApiUser, date: string) =>
    api()
      .get(v1(`/days/${date}`))
      .set(user.auth);
  const range = (user: ApiUser, from: string, to: string) => api().get(v1("/days")).query({ from, to }).set(user.auth);

  /** Sets the user's targets from `date`. */
  async function targets(user: ApiUser, date: string, energy: [number, number], protein: [number, number]) {
    const res = await api()
      .put(v1(`/targets/${date}`))
      .set(user.auth)
      .send({
        ranges: {
          energyKcal: { lower: energy[0], upper: energy[1] },
          proteinG: { lower: protein[0], upper: protein[1] },
        },
      });
    if (res.status !== 200) throw new Error(`targets answered ${res.status}`);
  }

  /** How many entries the user has. */
  async function entryCount(userId: string): Promise<number> {
    const { rows } = await suite.client.query("SELECT count(*)::int AS n FROM entries WHERE user_id = $1", [userId]);
    return rows[0].n as number;
  }

  return {
    api,
    v1,
    contextAt,
    fineliFood,
    ownFood,
    ownPortion,
    meal,
    add,
    added,
    foodBody,
    mealBody,
    estimateBody,
    patch,
    setStatus,
    copy,
    remove,
    restore,
    day,
    range,
    targets,
    entryCount,
  };
}
