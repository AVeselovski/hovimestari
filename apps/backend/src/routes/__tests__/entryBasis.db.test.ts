import { entryFigures, type Figures, type Scale } from "@hovimestari/types";
import { expect, it } from "@jest/globals";
import { signUp, type ApiUser } from "../../__tests__/support/apiUser.js";
import { addDays, daysApi, helsinkiToday } from "../../__tests__/support/daysApi.js";
import { describeWithDb } from "../../db/__tests__/support/throwawayDb.js";

// Every answered entry carries the basis its figures are computed from, so the
// web can preview exactly the figure the server will save.

type AnsweredEntry = {
  kind: "food" | "saved_meal" | "estimate";
  grams: number | null;
  count: number | null;
  basis: Figures;
  figures: Figures;
};

const per100 = (energyKcal: number) => ({ energyKcal, proteinG: 10, carbsG: 0, fatG: 0 });

/** The scale an entry's kind and amount give its basis. */
function scaleOf(e: AnsweredEntry): Scale {
  if (e.kind === "food") return { per: "100g", grams: e.grams! };
  if (e.kind === "saved_meal") return { per: "meal", count: e.count! };
  return { per: "whole" };
}

await describeWithDb("entryBasis", (suite) => {
  const d = daysApi(suite);
  const addedEntry = async (user: ApiUser, body: object) => (await d.added(user, body)) as unknown as AnsweredEntry;

  it("answers the basis of each kind, and its figures are entryFigures of that basis", async () => {
    const user = await signUp(suite.client);
    const fineli = await d.fineliFood();
    const meal = await d.meal(user, { energyKcal: 612.5, proteinG: 41.3, carbsG: 60, fatG: 20.1 });
    const estimate = { energyKcal: 850, proteinG: 35.5, carbsG: 90, fatG: 30.2 };

    const byGrams = await addedEntry(user, d.foodBody(fineli.id, { grams: 137.5 }));
    const byPortion = await addedEntry(user, d.foodBody(fineli.id, { portionId: fineli.portionId, count: 2.5 }));
    const byMeal = await addedEntry(user, d.mealBody(meal, 1.5));
    const byEstimate = await addedEntry(user, d.estimateBody(estimate));

    const fineliBasis = { energyKcal: 59.31, proteinG: 10.5, carbsG: 3.6, fatG: 0.2 };
    expect(byGrams.basis).toEqual(fineliBasis);
    expect(byPortion.basis).toEqual(fineliBasis);
    expect(byMeal.basis).toEqual({ energyKcal: 612.5, proteinG: 41.3, carbsG: 60, fatG: 20.1 });
    expect(byEstimate.basis).toEqual(estimate);

    for (const e of [byGrams, byPortion, byMeal, byEstimate])
      expect(entryFigures(e.basis, scaleOf(e))).toEqual(e.figures);

    const day = (await d.day(user, helsinkiToday())).body.entries as AnsweredEntry[];
    expect(day.map((e) => e.basis)).toEqual([fineliBasis, fineliBasis, byMeal.basis, estimate]);
  });

  // An edit of an entry's own food or saved meal rewrites the basis of its
  // planned entries dated today or later. Every other entry keeps its own.
  const sources = [
    {
      kind: "own food",
      create: (user: ApiUser) => d.ownFood(user, per100(100)),
      body: (id: string, opts: { date: string; status: "planned" | "eaten" }) => d.foodBody(id, { grams: 200 }, opts),
      edit: (user: ApiUser, id: string) =>
        d
          .api()
          .put(d.v1(`/foods/${id}`))
          .set(user.auth)
          .send({ name: "Oma ruoka", per100g: per100(120), barcode: null }),
    },
    {
      kind: "saved meal",
      create: (user: ApiUser) => d.meal(user, per100(100)),
      body: (id: string, opts: { date: string; status: "planned" | "eaten" }) => d.mealBody(id, 1.5, opts),
      edit: (user: ApiUser, id: string) =>
        d
          .api()
          .put(d.v1(`/saved-meals/${id}`))
          .set(user.auth)
          .send({ name: "Lounas", source: null, figures: per100(120) }),
    },
  ];

  it.each(sources)(
    "after its $kind is edited from 100 to 120 kcal: past eaten and today eaten keep 100, today planned and tomorrow planned answer 120",
    async (source) => {
      const user = await signUp(suite.client);
      const id = await source.create(user);
      const today = helsinkiToday();
      const cases = [
        { date: addDays(today, -1), status: "eaten", energy: 100 },
        { date: today, status: "eaten", energy: 100 },
        { date: today, status: "planned", energy: 120 },
        { date: addDays(today, 1), status: "planned", energy: 120 },
      ] as const;
      const ids: string[] = [];
      for (const c of cases)
        ids.push(((await addedEntry(user, source.body(id, c))) as AnsweredEntry & { id: string }).id);

      expect((await source.edit(user, id)).status).toBe(200);

      for (const [i, c] of cases.entries()) {
        const day = (await d.day(user, c.date)).body.entries as (AnsweredEntry & { id: string })[];
        const entry = day.find((e) => e.id === ids[i])!;
        expect({ date: c.date, status: c.status, energy: entry.basis.energyKcal }).toEqual({
          date: c.date,
          status: c.status,
          energy: c.energy,
        });
        expect(entryFigures(entry.basis, scaleOf(entry))).toEqual(entry.figures);
      }
    },
  );

  it("replaces an estimate's basis when its figures are edited", async () => {
    const user = await signUp(suite.client);
    const entry = (await addedEntry(user, d.estimateBody(per100(500)))) as AnsweredEntry & { id: string };
    const edited = { energyKcal: 650.5, proteinG: 22.2, carbsG: 70, fatG: 18.4 };

    const res = await d.patch(user, entry.id, { figures: edited });

    expect(res.status).toBe(200);
    expect(res.body.entry.basis).toEqual(edited);
    expect(res.body.entry.figures).toEqual(entryFigures(edited, { per: "whole" }));
    expect(res.body.entry.figures.energyKcal).toBe(651);
    const day = (await d.day(user, helsinkiToday())).body.entries as AnsweredEntry[];
    expect(day[0]!.basis).toEqual(edited);
  });
});
