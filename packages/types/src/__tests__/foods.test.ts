import { describe, expect, it } from "@jest/globals";
import {
  FoodListQuerySchema,
  FoodSearchQuerySchema,
  hasAtMostDecimals,
  OwnFoodBodySchema,
  OwnFoodUpdateBodySchema,
  Per100gSchema,
  PortionBodySchema,
  SettingsBodySchema,
} from "../index.js";

function firstMessage(result: { success: boolean; error?: { issues: { message: string }[] } }): string | undefined {
  return result.success ? undefined : result.error?.issues[0]?.message;
}

const per100g = { energyKcal: 59.31, proteinG: 10.5, carbsG: 3.6, fatG: 0.2 };

describe("OwnFoodBodySchema", () => {
  it("accepts a name and four values, trims the name and defaults the barcode to null", () => {
    expect(OwnFoodBodySchema.parse({ name: "  Rahka  ", per100g })).toEqual({ name: "Rahka", per100g, barcode: null });
  });

  it("accepts zero values and the caps", () => {
    const edge = { energyKcal: 1000, proteinG: 0, carbsG: 100, fatG: 0 };
    expect(OwnFoodBodySchema.safeParse({ name: "Edge", per100g: edge }).success).toBe(true);
  });

  it.each([
    [{ name: " ", per100g }, "food_name_required"],
    [{ per100g }, "food_name_required"],
    [{ name: "x".repeat(121), per100g }, "food_name_too_long"],
    [{ name: "A", per100g }, "food_name_not_searchable"],
    [{ name: "- % -", per100g }, "food_name_not_searchable"],
    [{ name: "a b c", per100g }, "food_name_not_searchable"],
    [{ name: "½", per100g }, "food_name_not_searchable"],
    [{ name: "Ab", per100g: { ...per100g, energyKcal: undefined } }, "food_value_required"],
    [{ name: "Ab", per100g: { ...per100g, energyKcal: 1000.1 } }, "food_energy_invalid"],
    [{ name: "Ab", per100g: { ...per100g, energyKcal: -1 } }, "food_energy_invalid"],
    [{ name: "Ab", per100g: { ...per100g, fatG: 100.5 } }, "food_macro_invalid"],
    [{ name: "Ab", per100g: { ...per100g, proteinG: "9" } }, "food_macro_invalid"],
    [{ name: "Ab", per100g: { ...per100g, energyKcal: 59.315 } }, "food_energy_invalid"],
    [{ name: "Ab", per100g: { ...per100g, proteinG: 1.2345 } }, "food_macro_invalid"],
    [{ name: "Ab", per100g, barcode: "1234567" }, "barcode_invalid"],
    [{ name: "Ab", per100g, barcode: "12345678901234x" }, "barcode_invalid"],
  ])("refuses %j with %p", (input, code) => {
    expect(firstMessage(OwnFoodBodySchema.safeParse(input))).toBe(code);
  });

  it.each(["Ab", "Ö1", "e\u0301e", "1 % rasvaa", "C-vitamiini"])(
    "accepts %p, a name with a searchable word",
    (name) => {
      expect(OwnFoodBodySchema.safeParse({ name, per100g }).success).toBe(true);
    },
  );

  it("accepts a barcode of 8 to 14 digits", () => {
    expect(OwnFoodBodySchema.parse({ name: "Ab", per100g, barcode: "6408430000012" }).barcode).toBe("6408430000012");
  });

  it("stores a barcode typed with spaces without them, as a lookup reads it", () => {
    expect(OwnFoodBodySchema.parse({ name: "Ab", per100g, barcode: " 6 408430 000012 " }).barcode).toBe(
      "6408430000012",
    );
  });
});

describe("OwnFoodUpdateBodySchema", () => {
  // The service checks a changed name for search, so an edit of a food's
  // values never fails on the name it already has.
  it.each(["A", "- % -", "½"])("accepts %p, a name search cannot find", (name) => {
    expect(OwnFoodUpdateBodySchema.parse({ name, per100g })).toEqual({ name, per100g, barcode: null });
  });

  it.each([
    [{ name: " ", per100g }, "food_name_required"],
    [{ name: "x".repeat(121), per100g }, "food_name_too_long"],
    [{ name: "Ab", per100g: { ...per100g, fatG: 100.5 } }, "food_macro_invalid"],
    [{ name: "Ab", per100g, barcode: "1234567" }, "barcode_invalid"],
  ])("refuses %j with %p, as a create does", (input, code) => {
    expect(firstMessage(OwnFoodUpdateBodySchema.safeParse(input))).toBe(code);
  });
});

describe("an own food's macros together", () => {
  const macros = (proteinG: number, carbsG: number, fatG: number) => ({ energyKcal: 400, proteinG, carbsG, fatG });
  const issuesOf = (schema: typeof OwnFoodBodySchema | typeof OwnFoodUpdateBodySchema, p: object) => {
    const result = schema.safeParse({ name: "Ab", per100g: p });
    return result.success ? [] : result.error.issues.map((i) => ({ message: i.message, path: i.path }));
  };

  it.each([
    ["exactly 100 g", macros(50, 30, 20)],
    ["101.5 g, the rounding allowance", macros(33.5, 33.5, 34.5)],
    ["101.5 g in thousandths", macros(33.833, 33.833, 33.834)],
    ["protein alone at 100 g", macros(100, 0, 0)],
    ["carbohydrates alone at 100 g", macros(0, 100, 0)],
    ["fat alone at 100 g", macros(0, 0, 100)],
    ["no macros at all", macros(0, 0, 0)],
    ["30.1 + 34.2 + 37.2, which floating point adds to 101.50000000000001", macros(30.1, 34.2, 37.2)],
  ])("accepts %s, on create and on edit", (_, p) => {
    expect(issuesOf(OwnFoodBodySchema, p)).toEqual([]);
    expect(issuesOf(OwnFoodUpdateBodySchema, p)).toEqual([]);
  });

  it.each([
    ["101.501 g, one thousandth past the allowance", macros(33.5, 33.5, 34.501)],
    ["101.6 g", macros(50, 50, 1.6)],
    ["200 g", macros(100, 50, 50)],
    ["300 g, each at its own cap", macros(100, 100, 100)],
  ])("refuses %s with one food_macro_sum_too_high on per100g.fatG, on create and on edit", (_, p) => {
    const refused = [{ message: "food_macro_sum_too_high", path: ["per100g", "fatG"] }];
    expect(issuesOf(OwnFoodBodySchema, p)).toEqual(refused);
    expect(issuesOf(OwnFoodUpdateBodySchema, p)).toEqual(refused);
  });

  it("answers a missing macro's own code, not the sum's", () => {
    expect(issuesOf(OwnFoodBodySchema, { energyKcal: 400, proteinG: 100, carbsG: 100 })).toEqual([
      { message: "food_value_required", path: ["per100g", "fatG"] },
    ]);
  });

  it("answers a macro above its own cap with food_macro_invalid alone", () => {
    expect(issuesOf(OwnFoodBodySchema, macros(100.5, 50, 0))).toEqual([
      { message: "food_macro_invalid", path: ["per100g", "proteinG"] },
    ]);
  });

  it("leaves the shared values shape alone, so a stored food over the sum still reads", () => {
    expect(Per100gSchema.safeParse(macros(100, 100, 100)).success).toBe(true);
  });
});

describe("PortionBodySchema", () => {
  it("accepts a name and grams with one decimal", () => {
    expect(PortionBodySchema.parse({ name: " one tub ", grams: 200.5 })).toEqual({ name: "one tub", grams: 200.5 });
  });

  it.each([
    [{ name: "", grams: 1 }, "portion_name_required"],
    [{ name: "x".repeat(61), grams: 1 }, "portion_name_too_long"],
    [{ name: "a", grams: 0 }, "portion_grams_invalid"],
    [{ name: "a", grams: 5000.1 }, "portion_grams_invalid"],
    [{ name: "a", grams: 1.25 }, "portion_grams_invalid"],
    [{ name: "a", grams: 0.00000001 }, "portion_grams_invalid"],
    [{ name: "a" }, "portion_grams_invalid"],
  ])("refuses %j with %p", (input, code) => {
    expect(firstMessage(PortionBodySchema.safeParse(input))).toBe(code);
  });
});

describe("hasAtMostDecimals", () => {
  it("is exact", () => {
    expect([0.1, 1.1, 142.5, 99_999.9].every((v) => hasAtMostDecimals(v, 1))).toBe(true);
    expect(hasAtMostDecimals(0.29, 2)).toBe(true);
    expect(hasAtMostDecimals(0.00000001, 1)).toBe(false);
    expect(hasAtMostDecimals(1.2345, 3)).toBe(false);
    expect(hasAtMostDecimals(Number.NaN, 1)).toBe(false);
  });
});

describe("FoodListQuerySchema", () => {
  it("defaults the limit to 100 and caps it at 200", () => {
    expect(FoodListQuerySchema.parse({})).toEqual({ limit: 100 });
    expect(FoodListQuerySchema.parse({ limit: "200" })).toEqual({ limit: 200 });
    expect(FoodListQuerySchema.safeParse({ limit: "201" }).success).toBe(false);
  });
});

describe("FoodSearchQuerySchema", () => {
  it("trims the query and defaults the limit to 30", () => {
    expect(FoodSearchQuerySchema.parse({ q: " rahka " })).toEqual({ q: "rahka", limit: 30 });
    expect(FoodSearchQuerySchema.parse({ q: "rahka", limit: "5" })).toEqual({ q: "rahka", limit: 5 });
  });

  it.each([{}, { q: "   " }, { q: "x".repeat(101) }, { q: "a", limit: "51" }, { q: ["a", "b"] }])(
    "refuses %j",
    (input) => {
      expect(FoodSearchQuerySchema.safeParse(input).success).toBe(false);
    },
  );
});

describe("SettingsBodySchema", () => {
  it("accepts either field or both", () => {
    expect(SettingsBodySchema.safeParse({ foodNameLanguage: "en" }).success).toBe(true);
    expect(SettingsBodySchema.safeParse({ timeZone: "America/New_York" }).success).toBe(true);
    expect(SettingsBodySchema.safeParse({ foodNameLanguage: "fi", timeZone: "UTC" }).success).toBe(true);
  });

  it("refuses an empty body and an unknown language", () => {
    expect(SettingsBodySchema.safeParse({}).success).toBe(false);
    expect(SettingsBodySchema.safeParse({ foodNameLanguage: "sv" }).success).toBe(false);
  });

  it("refuses a zone Intl does not know with invalid_time_zone", () => {
    expect(firstMessage(SettingsBodySchema.safeParse({ timeZone: "Mars/Olympus" }))).toBe("invalid_time_zone");
    expect(firstMessage(SettingsBodySchema.safeParse({ timeZone: "+02:00" }))).toBe("invalid_time_zone");
    expect(SettingsBodySchema.parse({ timeZone: "america/new_york" })).toEqual({ timeZone: "America/New_York" });
  });
});
