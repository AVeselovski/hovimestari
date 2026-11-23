import type { FakeDays } from "@/components/day/__tests__/fakeDays";
import { createCook } from "@/lib/api/cooks";
import {
  cookDiff,
  cookDiffers,
  entryFigures,
  gramsForPortion,
  MAX_FIGURE_G,
  MAX_FIGURE_KCAL,
  recipeBasis,
  type Cook,
  type CookBody,
  type CookLine,
  type CookWriteResult,
  type DiffLine,
  type Entry,
  type RecipeLine,
} from "@hovimestari/types";
import { lineOf } from "./recipeFixtures";
import { refusedAt, type FakeRecipes } from "./recipeServer";

// ---------------------------------------------------------------------------
// A fake of `POST /cooks` behind the mocked
// `@/lib/api/cooks`, over the fake days server's entries and the fake recipe
// server's recipes and foods. It follows `createCook` in
// apps/backend/src/services/writes/cooks.ts where the screen can tell:
//
// - An id it holds answers that batch again, `replayed`, and writes nothing.
// - Eaten on a date after today is refused, for an added serving and for a
//   state set on an attached one.
// - The recipe must be there. A line on a food it does not know, or a count
//   of a portion it does not know, is refused with its `line`, the index
//   from 0 among the lines sent.
// - One serving's basis comes from `recipeBasis` over the lines sent and the
//   foods' values, and is refused past what an entry holds. The batch's
//   figures come from `entryFigures` on that basis, and what it changed from
//   `cookDiff` against the recipe as it is: the shared functions the server
//   runs. So a figure the sheet shows is compared here with the same
//   computation, not with the real server. The browser walk against the real
//   backend is what shows that the web and the server agree.
// - An attached entry must be a plain entry of this recipe, else
//   `cook_entry_invalid` and nothing is written. It takes the batch and its
//   basis, and the state sent for it. An added serving goes to the end of
//   its day.
// - The answer names the entries the request named, by date and place, and
//   their days.
// ---------------------------------------------------------------------------

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const diffLine = (line: RecipeLine): DiffLine => ({
  id: line.id,
  foodId: line.food?.id ?? null,
  grams: line.grams,
  written: line.written,
  name: line.food === null ? line.name : null,
});

export class FakeCooks {
  cooks = new Map<string, Cook>();
  /** Every body sent, in order. */
  created: CookBody[] = [];
  /** Thrown by the next create, once, before anything is written. */
  refuseNext: Error | null = null;

  constructor(
    private readonly days: FakeDays,
    private readonly recipes: FakeRecipes,
  ) {}

  get(id: string): Cook {
    const cook = this.cooks.get(id);
    if (!cook) throw refusedAt(404, "cook_not_found");
    return clone({ ...cook, entries: this.entriesOf(id) });
  }

  private entriesOf(cookId: string): Entry[] {
    return this.days.entries
      .filter((e) => e.cook?.id === cookId)
      .sort((a, b) => a.date.localeCompare(b.date) || a.position - b.position);
  }

  create(body: CookBody): CookWriteResult {
    this.created.push(clone(body));
    if (this.refuseNext) {
      const refusal = this.refuseNext;
      this.refuseNext = null;
      throw refusal;
    }
    const named = new Set([...body.attach, ...body.add.map((a) => a.id)]);
    const answer = (outcome: "created" | "replayed"): CookWriteResult => {
      const entries = this.entriesOf(body.id).filter((e) => named.has(e.id));
      const dates = [...new Set(entries.map((e) => e.date))];
      return clone({ cook: this.get(body.id), entries, days: dates.map((d) => this.days.day(d)), outcome });
    };
    if (this.cooks.has(body.id)) return answer("replayed");

    const today = this.days.today;
    if (body.add.some((a) => a.status === "eaten" && a.date > today)) throw refusedAt(400, "entry_eaten_in_future");
    const recipe = this.recipes.recipes.get(body.recipeId);
    if (!recipe || recipe.deleted) throw refusedAt(404, "recipe_not_found");

    const lines = body.lines.map((line, i): CookLine => {
      const extra = { written: line.written ?? undefined, note: line.note ?? undefined };
      if (!line.counted) return { ...lineOf({ name: line.name, ...extra }, i, line.id), fromLineId: line.fromLineId };
      const food = this.recipes.foods.get(line.foodId);
      if (!food) throw refusedAt(404, "food_not_found", i);
      if ("grams" in line.amount) {
        return { ...lineOf({ food, grams: line.amount.grams, ...extra }, i, line.id), fromLineId: line.fromLineId };
      }
      const portion = this.recipes.portions.get(line.amount.portionId);
      if (!portion || portion.foodId !== food.id) throw refusedAt(404, "portion_not_found", i);
      const grams = gramsForPortion(line.amount.count, portion.grams);
      const counted = { id: line.amount.portionId, unit: portion.unit, name: null, count: line.amount.count };
      return { ...lineOf({ food, grams, portion: counted, ...extra }, i, line.id), fromLineId: line.fromLineId };
    });
    const basis = recipeBasis(
      lines.flatMap((l) => (l.food && l.grams !== null ? [{ per100g: l.food.per100g, grams: l.grams }] : [])),
      body.servings,
    );
    if (
      basis.energyKcal > MAX_FIGURE_KCAL ||
      [basis.proteinG, basis.carbsG, basis.fatG].some((g) => g > MAX_FIGURE_G)
    ) {
      throw refusedAt(400, "recipe_serving_too_large");
    }

    const attached = body.attach.map((id) => this.days.entries.find((e) => e.id === id));
    if (attached.some((e) => !e || e.kind !== "recipe" || e.recipe?.id !== recipe.id || e.cook !== null)) {
      throw refusedAt(400, "cook_entry_invalid");
    }
    for (const mark of body.attachStatus) {
      const entry = attached.find((e) => e?.id === mark.id);
      if (mark.status === "eaten" && entry && entry.date > today) throw refusedAt(400, "entry_eaten_in_future");
    }

    const diff = cookDiff(
      recipe.lines.map(diffLine),
      recipe.servings,
      lines.map((l) => ({ ...diffLine(l), fromLineId: l.fromLineId })),
      body.servings,
    );
    const from = { id: body.id, date: body.date, servings: body.servings, differs: cookDiffers(diff) };
    for (const entry of attached) {
      if (!entry) continue;
      entry.cook = from;
      entry.basis = basis;
      entry.figures = entryFigures(basis, { per: "serving", count: entry.servings ?? 0 });
      const mark = body.attachStatus.find((s) => s.id === entry.id);
      if (mark) entry.status = mark.status;
    }
    for (const add of body.add) {
      const position = Math.max(0, ...this.days.entries.map((e) => e.position)) + 1;
      this.days.entries.push({
        id: add.id,
        date: add.date,
        position,
        status: add.status,
        kind: "recipe",
        name: recipe.name,
        food: null,
        savedMeal: null,
        grams: null,
        portion: null,
        count: null,
        servings: add.servings,
        recipe: { id: recipe.id, archived: recipe.archived, deleted: false },
        cook: from,
        note: null,
        basis,
        figures: entryFigures(basis, { per: "serving", count: add.servings }),
        isEstimate: false,
      });
    }
    this.cooks.set(body.id, {
      id: body.id,
      recipe: { id: recipe.id, name: recipe.name, servings: recipe.servings, deleted: false },
      date: body.date,
      servings: body.servings,
      lines,
      perServing: entryFigures(basis, { per: "serving", count: 1 }),
      whole: entryFigures(basis, { per: "serving", count: body.servings }),
      basis,
      diff,
      entries: [],
    });
    return answer("created");
  }
}

/** Answers the mocked batch routes from a fake over `days` and `recipes`. */
export function serveCooks(days: FakeDays, recipes: FakeRecipes): FakeCooks {
  const server = new FakeCooks(days, recipes);
  jest.mocked(createCook).mockImplementation(async (body) => server.create(body));
  return server;
}
