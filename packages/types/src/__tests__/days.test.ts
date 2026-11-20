import { describe, expect, it } from "@jest/globals";
import {
  AddEntryBodySchema,
  CopyEntriesBodySchema,
  DayParamSchema,
  DayRangeQuerySchema,
  EntryPatchBodySchema,
  EntrySchema,
  FoodAmountSchema,
  SavedMealBodySchema,
  SavedMealsQuerySchema,
} from "../index.js";

function firstMessage(result: { success: boolean; error?: { issues: { message: string }[] } }): string | undefined {
  return result.success ? undefined : result.error?.issues[0]?.message;
}

const id = "7d0b5c9e-2f0a-4c1e-9b8a-1a2b3c4d5e6f";
const other = "8e1c6d0f-3a1b-4d2f-8c9b-2b3c4d5e6f70";
const figures = { energyKcal: 600, proteinG: 40, carbsG: 60, fatG: 20 };

describe("FoodAmountSchema", () => {
  it("takes grams, or a portion and a count, and nothing in between", () => {
    expect(FoodAmountSchema.parse({ grams: 137.5 })).toEqual({ grams: 137.5 });
    expect(FoodAmountSchema.parse({ portionId: id, count: 2.5 })).toEqual({ portionId: id, count: 2.5 });
    expect(firstMessage(FoodAmountSchema.safeParse({ grams: -1 }))).toBe("entry_grams_invalid");
    expect(firstMessage(FoodAmountSchema.safeParse({ portionId: id, count: 0.001 }))).toBe("entry_count_invalid");
    expect(firstMessage(FoodAmountSchema.safeParse({ portionId: id }))).toBe("invalid_request");
    expect(firstMessage(FoodAmountSchema.safeParse({ grams: 1, count: 1 }))).toBe("invalid_request");
    expect(firstMessage(FoodAmountSchema.safeParse({ grams: 1, extra: 1 }))).toBe("invalid_request");
  });
});

describe("AddEntryBodySchema", () => {
  it("defaults an estimate's note to null and folds a blank one into null", () => {
    const body = { kind: "estimate", id, date: "2026-11-16", status: "eaten", name: " Pizza ", figures };
    expect(AddEntryBodySchema.parse(body)).toMatchObject({ name: "Pizza", note: null });
    expect(AddEntryBodySchema.parse({ ...body, note: "   " })).toMatchObject({ note: null });
  });
});

describe("EntryPatchBodySchema", () => {
  it("needs at least one field", () => {
    expect(firstMessage(EntryPatchBodySchema.safeParse({}))).toBe("invalid_request");
    expect(EntryPatchBodySchema.parse({ status: "eaten" })).toEqual({ status: "eaten" });
    expect(EntryPatchBodySchema.parse({ note: null })).toEqual({ note: null });
  });
});

describe("CopyEntriesBodySchema", () => {
  it("refuses the same new id twice", () => {
    const pair = { sourceId: other, id };
    expect(CopyEntriesBodySchema.safeParse({ toDate: "2026-11-16", entries: [pair] }).success).toBe(true);
    expect(firstMessage(CopyEntriesBodySchema.safeParse({ toDate: "2026-11-16", entries: [pair, pair] }))).toBe(
      "invalid_request",
    );
  });
});

describe("DayParamSchema and DayRangeQuerySchema", () => {
  it("takes a date or today, and nothing else", () => {
    expect(DayParamSchema.parse("today")).toBe("today");
    expect(DayParamSchema.parse("2026-11-16")).toBe("2026-11-16");
    expect(firstMessage(DayParamSchema.safeParse("tomorrow"))).toBe("invalid_date");
  });

  it("takes a range from 1 to 42 days, forwards", () => {
    expect(DayRangeQuerySchema.safeParse({ from: "2026-11-16", to: "2026-11-16" }).success).toBe(true);
    expect(DayRangeQuerySchema.safeParse({ from: "2026-11-01", to: "2026-12-12" }).success).toBe(true);
    expect(firstMessage(DayRangeQuerySchema.safeParse({ from: "2026-11-01", to: "2026-12-13" }))).toBe(
      "invalid_request",
    );
    expect(firstMessage(DayRangeQuerySchema.safeParse({ from: "2026-11-02", to: "2026-11-01" }))).toBe(
      "invalid_request",
    );
  });
});

describe("SavedMealBodySchema", () => {
  it("trims the source, keeps none as null, and caps it at 40 characters", () => {
    const body = { id, name: "Lounas", figures };
    expect(SavedMealBodySchema.parse(body).source).toBeNull();
    expect(SavedMealBodySchema.parse({ ...body, source: "  Foodie " }).source).toBe("Foodie");
    expect(firstMessage(SavedMealBodySchema.safeParse({ ...body, source: "x".repeat(41) }))).toBe(
      "meal_source_too_long",
    );
  });

  it("reads archived=true as the archived list and anything absent as the active one", () => {
    expect(SavedMealsQuerySchema.parse({})).toEqual({ archived: false });
    expect(SavedMealsQuerySchema.parse({ archived: "true" })).toEqual({ archived: true });
    expect(SavedMealsQuerySchema.safeParse({ archived: "yes" }).success).toBe(false);
  });
});

describe("EntrySchema", () => {
  const entry = {
    id,
    date: "2026-11-16",
    position: 1,
    status: "eaten",
    kind: "estimate",
    name: "Ravintola",
    food: null,
    savedMeal: null,
    grams: null,
    portion: null,
    count: null,
    servings: null,
    recipe: null,
    note: null,
    basis: figures,
    figures,
    isEstimate: true,
  };

  it("takes an entry with its basis and refuses one without it", () => {
    expect(EntrySchema.parse(entry).basis).toEqual(figures);
    expect(EntrySchema.safeParse({ ...entry, basis: undefined }).success).toBe(false);
    expect(EntrySchema.safeParse({ ...entry, basis: null }).success).toBe(false);
  });

  it("refuses an entry that lacks servings or recipe", () => {
    for (const field of ["servings", "recipe"]) {
      const lacking: Record<string, unknown> = { ...entry };
      delete lacking[field];
      expect(EntrySchema.safeParse(lacking).success).toBe(false);
    }
  });
});
