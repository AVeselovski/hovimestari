import {
  estimateEntry,
  foodEntry,
  mealEntry,
  portionEntry,
  recipeEntry,
  TODAY,
} from "@/components/day/__tests__/support";
import { GRAMS, switchUnit, type UnitChip } from "../amount";
import { buildPatch, fieldsOf, inverseOf, previewOf } from "../entryForm";

const grams: UnitChip = { id: GRAMS, label: null };
const glass: UnitChip = { id: "11111111-1111-4111-8111-111111111111", label: "Glass", grams: 55 };
const cup: UnitChip = { id: "22222222-2222-4222-8222-222222222222", label: "Cup", grams: 200 };

describe("switchUnit", () => {
  it("turns 2 of a 55 g portion into 110 g", () => {
    expect(switchUnit("2", glass, grams)).toBe("110");
    expect(switchUnit("2,5", glass, grams)).toBe("137.5");
  });

  it("starts a portion at 1, from grams or from another portion", () => {
    expect(switchUnit("250", grams, glass)).toBe("1");
    expect(switchUnit("3", glass, cup)).toBe("1");
  });

  it("leaves an empty or refused value as typed", () => {
    expect(switchUnit("", glass, grams)).toBe("");
    expect(switchUnit("abc", grams, glass)).toBe("abc");
    expect(switchUnit("2,000", grams, glass)).toBe("2,000");
  });
});

describe("buildPatch", () => {
  it("sends only what changed, a planned entry's amount and Eaten together", () => {
    const quark = foodEntry("Quark", 250, { status: "planned" });
    const fields = { ...fieldsOf(quark), amount: "300", status: "eaten" as const };
    expect(buildPatch(quark, fields, TODAY)).toEqual({ ok: true, patch: { status: "eaten", amount: { grams: 300 } } });
    expect(buildPatch(quark, fieldsOf(quark), TODAY)).toEqual({ ok: true, patch: {} });
  });

  it("sends a portion amount as the portion and its count", () => {
    const milk = portionEntry("Milk", 2, 55, { id: glass.id });
    expect(fieldsOf(milk)).toMatchObject({ unit: glass.id, amount: "2" });
    const fields = { ...fieldsOf(milk), amount: "3" };
    expect(buildPatch(milk, fields, TODAY)).toEqual({ ok: true, patch: { amount: { portionId: glass.id, count: 3 } } });
  });

  it("plans an entry moved to a future date, whatever the choice says", () => {
    const quark = foodEntry("Quark", 250);
    const fields = { ...fieldsOf(quark), date: "2026-11-18" };
    expect(buildPatch(quark, fields, TODAY)).toEqual({ ok: true, patch: { date: "2026-11-18", status: "planned" } });
  });

  it("refuses an amount out of range or a digit group with the field's code", () => {
    const quark = foodEntry("Quark", 250);
    expect(buildPatch(quark, { ...fieldsOf(quark), amount: "5000.1" }, TODAY)).toEqual({
      ok: false,
      errors: { amount: "entry_grams_invalid" },
    });
    expect(buildPatch(quark, { ...fieldsOf(quark), amount: "1,000" }, TODAY)).toEqual({
      ok: false,
      errors: { amount: "digit_group" },
    });
    // A count is at most 100, so a thousands group in it is out of range whichever way it reads.
    const meal = mealEntry("Bowl", 1, { energyKcal: 600, proteinG: 40, carbsG: 50, fatG: 20 });
    expect(buildPatch(meal, { ...fieldsOf(meal), amount: "1,000" }, TODAY)).toEqual({
      ok: false,
      errors: { amount: "entry_count_invalid" },
    });
  });
});

describe("inverseOf", () => {
  it("puts back every field that differs between the entry before and the entry answered", () => {
    const before = portionEntry("Milk", 2, 55, { id: glass.id });
    const after = { ...before, date: "2026-11-20", status: "planned" as const, grams: 300, portion: null };
    expect(inverseOf(before, after)).toEqual({
      date: before.date,
      status: "eaten",
      amount: { portionId: glass.id, count: 2 },
    });
  });

  it("sends grams back for an amount whose portion is gone", () => {
    const before = portionEntry("Milk", 2, 55, { id: null });
    expect(inverseOf(before, { ...before, grams: 200, portion: null })).toEqual({ amount: { grams: 110 } });
  });

  it("puts back an estimate's name, figures and note", () => {
    const before = estimateEntry("Dinner", { energyKcal: 900, proteinG: 40, carbsG: 80, fatG: 35 }, { note: "Pizza" });
    const after = { ...before, name: "Dinner out", figures: { ...before.figures, proteinG: 45 }, note: null };
    expect(inverseOf(before, after)).toEqual({ name: "Dinner", figures: before.figures, note: "Pizza" });
    expect(inverseOf(before, before)).toEqual({});
  });
});

describe("previewOf", () => {
  it("is the server's own figures while the amount is as saved, then computed from the stored basis", () => {
    // The food was edited since: its basis is the stored one, not today's values.
    const quark = foodEntry("Quark", 250, { basis: { energyKcal: 100, proteinG: 10, carbsG: 4, fatG: 1 } });
    const server = { ...quark, figures: { energyKcal: 251, proteinG: 25, carbsG: 10, fatG: 2.5 } };
    const chips = [grams];
    expect(previewOf(server, fieldsOf(server), chips)).toBe(server.figures);
    expect(previewOf(server, { ...fieldsOf(server), amount: "300" }, chips)).toEqual({
      energyKcal: 300,
      proteinG: 30,
      carbsG: 12,
      fatG: 3,
    });
    expect(previewOf(server, { ...fieldsOf(server), amount: "" }, chips)).toBeNull();
  });

  it("weighs a count on a portion at the portion's grams", () => {
    const milk = portionEntry(
      "Milk",
      2,
      55,
      { id: glass.id },
      { basis: { energyKcal: 50, proteinG: 3.4, carbsG: 4.8, fatG: 1.5 } },
    );
    const fields = { ...fieldsOf(milk), amount: "3" };
    expect(previewOf(milk, fields, [grams, glass])?.energyKcal).toBe(83);
  });
});

describe("a recipe entry", () => {
  const serving = { energyKcal: 365.1, proteinG: 21.78, carbsG: 9.87, fatG: 25.69 };

  it("holds its servings as its amount and sends a change of them, never a name or figures", () => {
    const shakshuka = recipeEntry("Shakshuka", 1, serving, { status: "planned" });
    expect(fieldsOf(shakshuka)).toMatchObject({ amount: "1", name: "" });
    expect(buildPatch(shakshuka, fieldsOf(shakshuka), TODAY)).toEqual({ ok: true, patch: {} });
    expect(buildPatch(shakshuka, { ...fieldsOf(shakshuka), amount: "1.5" }, TODAY)).toEqual({
      ok: true,
      patch: { servings: 1.5 },
    });
    const moved = { ...fieldsOf(shakshuka), date: "2026-11-18" };
    expect(buildPatch(shakshuka, moved, TODAY)).toEqual({ ok: true, patch: { date: "2026-11-18" } });
    expect(buildPatch(shakshuka, { ...fieldsOf(shakshuka), amount: "100.01" }, TODAY)).toEqual({
      ok: false,
      errors: { amount: "entry_count_invalid" },
    });
  });

  it("puts its servings back", () => {
    const before = recipeEntry("Shakshuka", 2, serving);
    expect(inverseOf(before, { ...before, servings: 1 })).toEqual({ servings: 2 });
  });

  it("previews N servings from its basis per serving", () => {
    const shakshuka = recipeEntry("Shakshuka", 1, serving);
    expect(previewOf(shakshuka, fieldsOf(shakshuka), [grams])).toBe(shakshuka.figures);
    expect(previewOf(shakshuka, { ...fieldsOf(shakshuka), amount: "3" }, [grams])).toEqual({
      energyKcal: 1095,
      proteinG: 65.3,
      carbsG: 29.6,
      fatG: 77.1,
    });
  });
});
