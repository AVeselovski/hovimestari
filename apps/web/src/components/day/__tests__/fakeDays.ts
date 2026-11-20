import { change, overview } from "@/components/targets/__tests__/support";
import { getDay, getDaySummaries } from "@/lib/api/days";
import {
  addEntry,
  copyEntries,
  patchEntry,
  removeEntries,
  removeEntry,
  restoreEntry,
  setEntriesStatus,
} from "@/lib/api/entries";
import { getFavouriteFoods, getOwnFoods } from "@/lib/api/foods";
import { getRecents } from "@/lib/api/log";
import {
  createSavedMeal,
  deleteSavedMeal,
  getSavedMeals,
  saveAndLog,
  setSavedMealArchived,
  updateSavedMeal,
} from "@/lib/api/savedMeals";
import { getTargets } from "@/lib/api/targets";
import { daySummaryOf } from "@/lib/daySummary";
import { addDays } from "@/lib/localDate";
import {
  CopyEntriesBodySchema,
  EntryRemoveManyBodySchema,
  averageOfDays,
  entryFigures,
  gramsForPortion,
  type AddEntryBody,
  type CopyEntriesBody,
  type Day,
  type DaySummary,
  type DaySummaryList,
  type Entry,
  type EntryPatchBody,
  type EntryStatus,
  type FoodSummary,
  type RecentItem,
  type SaveAndLogBody,
  type SavedMeal,
  type SavedMealBody,
  type SavedMealEditBody,
  type TargetChange,
} from "@hovimestari/types";
import { RANGES, TODAY, dayOf } from "./support";

// ---------------------------------------------------------------------------
// A small fake of the entry routes, behind the mocked API modules, that
// keeps the server's rules that matter on screen: an entry keeps its place
// (position) through every write, a restore brings it back at its place and
// answers created (a second restore answers replayed, one past its window
// 404), a status change skips entries already in that state and answers the ids it
// changed, a move of an eaten entry to a future date plans it, and every
// write answers the days it changed. An add follows `addEntry` in
// apps/backend/src/services/writes/entries.ts: an id already added answers
// that entry replayed (before any other check), an id added and removed
// answers replayed with no entry, eaten on a future date is refused, and a
// new entry takes the food's per-100 g values or the meal's figures as its
// basis, at the end of its day. An estimate's basis is its typed figures.
// It holds no recipes, so a recipe add answers `recipe_not_found`, and a
// recipe entry a test starts with changes its servings over its own basis.
//
// The saved meal routes follow apps/backend/src/services/writes/savedMeals.ts:
// a create with an id of the user's answers that meal again unchanged, and an
// id another account holds answers 409 `saved_meal_id_taken`. Save and log
// runs the create, then the add, so a repeat replays both and one meal "Save
// meal" made first is logged, not made twice. An edit rewrites the figures of
// the meal's planned entries dated today or later. Archive and restore set a
// flag, a delete takes the meal away, and a meal that is not there answers
// 404 `saved_meal_not_found`. Lists are by name in Finnish order. The test
// file mocks the API modules.
// ---------------------------------------------------------------------------

/** The one change a test user has unless the test says otherwise: from long before any day a test shows. */
export function defaultChanges(): TargetChange[] {
  return [change("2026-01-01", [RANGES.energyKcal.lower, RANGES.energyKcal.upper], [140, 180])];
}

export class FakeDays {
  today = TODAY;
  /** The user's targets changes. A day takes the latest on or before it, else it has no targets. */
  changes: TargetChange[] = defaultChanges();
  entries: Entry[] = [];
  removed = new Map<string, Entry>();
  /** Removed entries past their restore window: a restore answers 404. */
  expired = new Set<string>();
  /** Portion weights by id, for amounts sent as a portion count. */
  portionGrams = new Map<string, number>();
  /** The foods and saved meals an add can name, by id. */
  foods = new Map<string, FoodSummary>();
  meals = new Map<string, SavedMeal>();
  /** What `GET /log/recents` answers. */
  recents: RecentItem[] = [];
  /** Saved meal ids another account holds. */
  foreignMealIds = new Set<string>();

  constructor(entries: Entry[] = []) {
    this.entries = entries.map((e) => ({ ...e }));
  }

  day(date: string): Day {
    const on = this.entries.filter((e) => e.date === date).sort((a, b) => a.position - b.position);
    return dayOf(on, date, this.today, overview(this.changes, date, this.today).inForce?.ranges ?? null);
  }

  /**
   * `GET /days?from=&to=`: every day of the range, each the day's own summary, without its entries, and
   * their average day through `averageOfDays`, the computation the server answers with.
   */
  range(from: string, to: string): DaySummaryList {
    const days: DaySummary[] = [];
    for (let date = from; date <= to; date = addDays(date, 1)) days.push(daySummaryOf(this.day(date)));
    return { days, average: averageOfDays(days) };
  }

  status(ids: readonly string[], status: EntryStatus) {
    const changed: string[] = [];
    for (const id of ids) {
      const e = this.entries.find((x) => x.id === id);
      if (!e || e.status === status || (status === "eaten" && e.date > this.today)) continue;
      e.status = status;
      changed.push(id);
    }
    const dates = [...new Set(this.entries.filter((e) => changed.includes(e.id)).map((e) => e.date))];
    return { changedIds: changed, days: dates.map((d) => this.day(d)) };
  }

  patch(id: string, patch: EntryPatchBody) {
    const e = this.entries.find((x) => x.id === id);
    if (!e) throw notFound();
    const from = e.date;
    if (patch.date !== undefined) {
      e.date = patch.date;
      if (patch.date > this.today && patch.status === undefined) e.status = "planned";
    }
    if (patch.status !== undefined) e.status = patch.status;
    if (patch.amount !== undefined) {
      if ("grams" in patch.amount) {
        e.grams = patch.amount.grams;
        e.portion = null;
      } else {
        const grams = gramsForPortion(patch.amount.count, this.portionGrams.get(patch.amount.portionId) ?? 0);
        e.grams = grams;
        e.portion = {
          id: patch.amount.portionId,
          unit: null,
          name: e.portion?.name ?? "Portion",
          count: patch.amount.count,
        };
      }
      e.figures = entryFigures(e.basis, { per: "100g", grams: e.grams });
    }
    if (patch.count !== undefined) {
      e.count = patch.count;
      e.figures = entryFigures(e.basis, { per: "meal", count: patch.count });
    }
    if (patch.servings !== undefined) {
      e.servings = patch.servings;
      e.figures = entryFigures(e.basis, { per: "serving", count: patch.servings });
    }
    if (patch.name !== undefined) e.name = patch.name;
    if (patch.figures !== undefined) {
      e.basis = patch.figures;
      e.figures = patch.figures;
    }
    if (patch.note !== undefined) e.note = patch.note;
    const dates = [...new Set([from, e.date])];
    return { entry: { ...e }, days: dates.map((d) => this.day(d)), outcome: "changed" as const };
  }

  remove(id: string) {
    const e = this.entries.find((x) => x.id === id);
    if (!e) throw notFound();
    this.entries = this.entries.filter((x) => x.id !== id);
    this.removed.set(id, e);
    return { days: [this.day(e.date)] };
  }

  add(body: AddEntryBody) {
    const held = this.entries.find((x) => x.id === body.id);
    if (held) return { entry: { ...held }, days: [this.day(held.date)], outcome: "replayed" as const };
    if (this.removed.has(body.id)) return { entry: null, days: [this.day(body.date)], outcome: "replayed" as const };
    if (body.status === "eaten" && body.date > this.today) throw refused(400, "entry_eaten_in_future");
    const position = Math.max(0, ...this.entries.map((e) => e.position)) + 1;
    const base = {
      id: body.id,
      date: body.date,
      position,
      status: body.status,
      note: null,
      servings: null,
      recipe: null,
      isEstimate: false,
    };
    let entry: Entry;
    if (body.kind === "food") {
      const food = this.foods.get(body.foodId);
      if (!food) throw refused(404, "food_not_found");
      let grams: number;
      let portion: Entry["portion"] = null;
      if ("grams" in body.amount) grams = body.amount.grams;
      else {
        const each = this.portionGrams.get(body.amount.portionId);
        if (each === undefined) throw refused(404, "portion_not_found");
        grams = gramsForPortion(body.amount.count, each);
        portion = { id: body.amount.portionId, unit: null, name: "Portion", count: body.amount.count };
      }
      const basis = food.per100g;
      entry = {
        ...base,
        kind: "food",
        name: food.name,
        food: { id: food.id, source: food.source, retired: food.retired, deleted: false },
        savedMeal: null,
        grams,
        portion,
        count: null,
        basis,
        figures: entryFigures(basis, { per: "100g", grams }),
      };
    } else if (body.kind === "saved_meal") {
      const meal = this.meals.get(body.savedMealId);
      if (!meal) throw refused(404, "saved_meal_not_found");
      entry = {
        ...base,
        kind: "saved_meal",
        name: meal.name,
        food: null,
        savedMeal: { id: meal.id, source: meal.source, archived: meal.archived, deleted: false },
        grams: null,
        portion: null,
        count: body.count,
        basis: meal.figures,
        figures: entryFigures(meal.figures, { per: "meal", count: body.count }),
      };
    } else if (body.kind === "recipe") {
      // The harness holds no recipes: the screen cannot add one yet.
      throw refused(404, "recipe_not_found");
    } else {
      entry = {
        ...base,
        kind: "estimate",
        name: body.name,
        food: null,
        savedMeal: null,
        grams: null,
        portion: null,
        count: null,
        note: body.note ?? null,
        basis: body.figures,
        figures: entryFigures(body.figures, { per: "whole" }),
        isEstimate: true,
      };
    }
    this.entries.push(entry);
    return { entry: { ...entry }, days: [this.day(entry.date)], outcome: "created" as const };
  }

  /** `GET /log/recents`: the recent items, a saved meal as it is now, an archived or deleted one left out. */
  recentList(): { items: RecentItem[] } {
    const items = this.recents.flatMap((item): RecentItem[] => {
      if (item.kind !== "saved_meal") return [item];
      const meal = this.meals.get(item.meal.id);
      return meal && !meal.archived ? [{ ...item, meal: { ...meal } }] : [];
    });
    return { items };
  }

  mealList(archived: boolean): { meals: SavedMeal[] } {
    const meals = [...this.meals.values()].filter((m) => m.archived === archived);
    return { meals: meals.sort((a, b) => a.name.localeCompare(b.name, "fi")).map((m) => ({ ...m })) };
  }

  meal(id: string): SavedMeal {
    const meal = this.meals.get(id);
    if (!meal) throw refused(404, "saved_meal_not_found");
    return meal;
  }

  createMeal(body: SavedMealBody): { meal: SavedMeal; outcome: "created" | "replayed" } {
    if (this.foreignMealIds.has(body.id)) throw refused(409, "saved_meal_id_taken");
    const held = this.meals.get(body.id);
    if (held) return { meal: { ...held }, outcome: "replayed" };
    const meal: SavedMeal = {
      id: body.id,
      name: body.name,
      source: body.source,
      figures: body.figures,
      archived: false,
      lastCount: null,
    };
    this.meals.set(meal.id, meal);
    return { meal: { ...meal }, outcome: "created" };
  }

  saveAndLog(body: SaveAndLogBody) {
    const created = this.createMeal(body.meal);
    let logged;
    try {
      logged = this.add({ kind: "saved_meal", savedMealId: body.meal.id, ...body.entry });
    } catch (err) {
      // One transaction on the server: a refused add saves no meal either.
      if (created.outcome === "created") this.meals.delete(body.meal.id);
      throw err;
    }
    const meal = this.meal(body.meal.id);
    if (logged.outcome === "created" && body.entry.status === "eaten") meal.lastCount = body.entry.count;
    return { meal: { ...meal }, entry: logged.entry, days: logged.days, outcome: logged.outcome };
  }

  updateMeal(id: string, body: SavedMealEditBody): SavedMeal {
    const meal = this.meal(id);
    Object.assign(meal, { name: body.name, source: body.source, figures: body.figures });
    for (const e of this.entries) {
      if (e.savedMeal?.id !== id || e.status !== "planned" || e.date < this.today) continue;
      e.basis = body.figures;
      e.figures = entryFigures(body.figures, { per: "meal", count: e.count ?? 1 });
    }
    return { ...meal };
  }

  setMealArchived(id: string, archived: boolean): void {
    this.meal(id).archived = archived;
  }

  deleteMeal(id: string): void {
    this.meal(id);
    this.meals.delete(id);
  }

  /**
   * `POST /entries/copy`, as `copyEntries` on the server: a body the route
   * refuses (no entries, more than 100, an id twice) answers 400, an id held or
   * removed is skipped, a missing source answers 404 before anything is
   * added, and each copy goes after the target day's entries, planned, with
   * every value of its source but its id and position. It answers the live
   * entries of the ids sent and the target day.
   */
  copy(body: CopyEntriesBody) {
    if (!CopyEntriesBodySchema.safeParse(body).success) throw refused(400, "invalid_request");
    const ids = body.entries.map((p) => p.id);
    const todo = body.entries.filter((p) => !this.entries.some((e) => e.id === p.id) && !this.removed.has(p.id));
    const sources = todo.map((p) => this.entries.find((e) => e.id === p.sourceId));
    if (sources.some((s) => s === undefined)) throw notFound();
    const order = (e: Entry) => [e.date, e.position] as const;
    const pairs = todo
      .map((p, i) => ({ p, source: sources[i]! }))
      .sort((a, b) => {
        const [da, pa] = order(a.source);
        const [db, pb] = order(b.source);
        return da < db ? -1 : da > db ? 1 : pa - pb;
      });
    for (const { p, source } of pairs) {
      const position = Math.max(0, ...this.entries.map((e) => e.position)) + 1;
      this.entries.push({ ...source, id: p.id, date: body.toDate, position, status: "planned" });
    }
    const entries = this.entries.filter((e) => ids.includes(e.id)).map((e) => ({ ...e }));
    return {
      entries,
      days: [this.day(body.toDate)],
      outcome: todo.length > 0 ? ("created" as const) : ("replayed" as const),
    };
  }

  /**
   * `POST /entries/remove`: a body the route refuses (no ids, more than 100,
   * an id twice) answers 400. It removes each listed entry still there, skips
   * the rest, and answers each day it removed from.
   */
  removeMany(ids: readonly string[]) {
    if (!EntryRemoveManyBodySchema.safeParse({ entryIds: ids }).success) throw refused(400, "invalid_request");
    const gone = this.entries
      .filter((e) => ids.includes(e.id))
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.position - b.position));
    for (const e of gone) {
      this.entries = this.entries.filter((x) => x.id !== e.id);
      this.removed.set(e.id, e);
    }
    const dates = [...new Set(gone.map((e) => e.date))].sort();
    return { removedIds: gone.map((e) => e.id), days: dates.map((d) => this.day(d)) };
  }

  /** A restore of an entry already back answers 200 replayed, as the server does. Past its window, 404. */
  restore(id: string) {
    const back = this.entries.find((x) => x.id === id);
    if (back) return { entry: { ...back }, days: [this.day(back.date)], outcome: "replayed" as const };
    const e = this.removed.get(id);
    if (!e || this.expired.has(id)) throw notFound();
    this.removed.delete(id);
    this.entries.push(e);
    return { entry: { ...e }, days: [this.day(e.date)], outcome: "created" as const };
  }
}

/** A 404 as axios rejects it. */
export function notFound(): Error {
  return refused(404, "entry_not_found");
}

/** A refusal as axios rejects it. */
export function refused(status: number, code: string): Error {
  return Object.assign(new Error(`Request failed with status code ${status}`), {
    isAxiosError: true,
    response: { status, data: { code } },
  });
}

/** Puts the fake behind the mocked API functions. Each call's arguments stay on the mocks. */
export function serve(server: FakeDays): void {
  jest.mocked(getDay).mockImplementation(async (date) => server.day(date));
  jest.mocked(getDaySummaries).mockImplementation(async (from, to) => server.range(from, to));
  jest.mocked(setEntriesStatus).mockImplementation(async (ids, status) => server.status(ids, status));
  jest.mocked(patchEntry).mockImplementation(async (id, patch) => server.patch(id, patch));
  jest.mocked(removeEntry).mockImplementation(async (id) => server.remove(id));
  jest.mocked(restoreEntry).mockImplementation(async (id) => server.restore(id));
  // The copy's routes, where the suite mocks them.
  if (jest.isMockFunction(copyEntries)) jest.mocked(copyEntries).mockImplementation(async (body) => server.copy(body));
  if (jest.isMockFunction(removeEntries)) {
    jest.mocked(removeEntries).mockImplementation(async (ids) => server.removeMany(ids));
  }
  // The log sheet's routes, where the suite mocks them.
  if (jest.isMockFunction(addEntry)) jest.mocked(addEntry).mockImplementation(async (body) => server.add(body));
  if (jest.isMockFunction(getRecents)) jest.mocked(getRecents).mockImplementation(async () => server.recentList());
  if (jest.isMockFunction(getSavedMeals)) {
    jest.mocked(getSavedMeals).mockImplementation(async (archived) => server.mealList(archived));
    jest.mocked(createSavedMeal).mockImplementation(async (body) => server.createMeal(body).meal);
    jest.mocked(saveAndLog).mockImplementation(async (body) => server.saveAndLog(body));
    jest.mocked(updateSavedMeal).mockImplementation(async (id, body) => server.updateMeal(id, body));
    jest.mocked(setSavedMealArchived).mockImplementation(async (id, archived) => server.setMealArchived(id, archived));
    jest.mocked(deleteSavedMeal).mockImplementation(async (id) => server.deleteMeal(id));
  }
  if (jest.isMockFunction(getFavouriteFoods) && !jest.mocked(getFavouriteFoods).getMockImplementation()) {
    jest.mocked(getFavouriteFoods).mockResolvedValue({ foods: [] });
  }
  if (jest.isMockFunction(getOwnFoods) && !jest.mocked(getOwnFoods).getMockImplementation()) {
    jest.mocked(getOwnFoods).mockResolvedValue({ foods: [] });
  }
  jest.mocked(getTargets).mockImplementation(async () => overview(server.changes, server.today, server.today));
}
