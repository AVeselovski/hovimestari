import { describe, expect, it } from "@jest/globals";
import { readFileSync } from "node:fs";
import { foodOf, OffBodySchema, type OffProduct } from "../product.js";

// On the recorded answers in fixtures/. Every other case is the milk's
// product with one field changed, written here next to its test.

const recorded = (file: string) =>
  OffBodySchema.parse(JSON.parse(readFileSync(new URL(`./fixtures/${file}`, import.meta.url), "utf8")));
const milkBody = recorded("valio-milk-6408430000258.json");
const milk = milkBody.product as OffProduct;

/** The milk's product with `nutriments` and other fields changed, parsed as the client parses it. */
function milkWith(fields: Record<string, unknown>, nutriments: Record<string, unknown> = {}): OffProduct {
  const raw = JSON.parse(readFileSync(new URL("./fixtures/valio-milk-6408430000258.json", import.meta.url), "utf8"));
  Object.assign(raw.product, fields);
  Object.assign(raw.product.nutriments, nutriments);
  for (const [k, v] of Object.entries(nutriments)) if (v === undefined) delete raw.product.nutriments[k];
  for (const [k, v] of Object.entries(fields)) if (v === undefined) delete raw.product[k];
  return OffBodySchema.parse(raw).product as OffProduct;
}

describe("a complete product", () => {
  it("keeps the milk with its Finnish name, its brand and its four values", () => {
    expect(milkBody.status).toBe(1);
    expect(foodOf(milk)).toEqual({
      kind: "complete",
      food: {
        name: "Eila laktoositon kevytmaitojuoma, Valio",
        nameEn: "Eila laktoositon kevytmaito, Valio",
        energyKcal: 39,
        proteinG: 3.3,
        carbsG: 3.1,
        fatG: 1.5,
      },
    });
  });

  it("keeps a UPC-A product under the name it has", () => {
    const water = recorded("upc-a-0012000161155.json");
    expect(water.product?.code).toBe("0012000161155");
    const out = foodOf(water.product as OffProduct);
    expect(out).toMatchObject({
      kind: "complete",
      food: { name: "Life Wtr pH balanced, Hydration LLC", nameEn: null },
    });
  });

  it("converts kilojoules when no kilocalories are given, and never reads kJ as kcal", () => {
    const out = foodOf(milkWith({}, { "energy-kcal_100g": undefined }));
    expect(out).toMatchObject({ kind: "complete", food: { energyKcal: 39.2 } });
    expect(out.kind === "complete" && out.food.energyKcal).not.toBe(164);
  });

  it("reads numeric strings as their numbers", () => {
    const out = foodOf(milkWith({}, { "energy-kcal_100g": "39", proteins_100g: " 3.3 ", fat_100g: "1.5" }));
    expect(out).toMatchObject({ kind: "complete", food: { energyKcal: 39, proteinG: 3.3, fatG: 1.5 } });
  });

  it("rounds macros to three decimals and energy to two", () => {
    const out = foodOf(milkWith({}, { "energy-kcal_100g": 39.4567, proteins_100g: 3.12345 }));
    expect(out).toMatchObject({ kind: "complete", food: { energyKcal: 39.46, proteinG: 3.123 } });
  });
});

describe("names", () => {
  it("falls back to the product's own name, then the English one", () => {
    expect(foodOf(milkWith({ product_name_fi: undefined }))).toMatchObject({
      food: { name: "Eila laktoositon kevytmaitojuoma, Valio" },
    });
    const english = foodOf(milkWith({ product_name_fi: undefined, product_name: undefined }));
    expect(english).toMatchObject({ food: { name: "Eila laktoositon kevytmaito, Valio", nameEn: null } });
  });

  it("does not add a brand the name already holds, with case and accents folded", () => {
    const out = foodOf(milkWith({ product_name_fi: "VALIO Eila  laktoositon", brands: "Válio, Arla" }));
    expect(out).toMatchObject({ food: { name: "VALIO Eila laktoositon" } });
  });

  it("cuts a Finnish and an English name at a word boundary to 120 characters", () => {
    const long = Array.from({ length: 30 }, (_, i) => `sana${i}`).join(" ");
    const out = foodOf(milkWith({ product_name_fi: long, product_name_en: `en ${long}` }));
    if (out.kind !== "complete") throw new Error("expected complete");
    for (const name of [out.food.name, out.food.nameEn as string]) {
      expect(name.length).toBeLessThanOrEqual(120);
      expect(long.includes(name.replace(/^en /, "")) || `en ${long}`.startsWith(name)).toBe(true);
      expect(name).not.toMatch(/[ ,]$/);
    }
  });

  it("drops control characters from names and brands, a NUL and bidi controls among them", () => {
    // Postgres refuses a NUL in text, and a bidi override reorders a name on screen.
    const out = foodOf(
      milkWith({
        product_name_fi: "Rahka\u0000 \u202Eakhar\u202C\u0007 maustamaton\u0085",
        product_name_en: "Quark\u2066\u200F\u061C\u009B plain\u200E",
        brands: "\u202DValio\u2069\u001F, Arla",
      }),
    );
    expect(out).toMatchObject({
      kind: "complete",
      food: { name: "Rahka akhar maustamaton, Valio", nameEn: "Quark plain, Valio" },
    });
  });

  it("counts a name of control characters only as missing", () => {
    const out = foodOf(
      milkWith({ product_name_fi: "\u0000\u202E", product_name: "\u0001 \u2066", product_name_en: "\u200F" }),
    );
    expect(out).toMatchObject({ kind: "incomplete", reason: "missing_values", name: null });
  });

  it("answers incomplete with no name at all", () => {
    const out = foodOf(milkWith({ product_name_fi: undefined, product_name: " ", product_name_en: undefined }));
    expect(out).toMatchObject({ kind: "incomplete", reason: "missing_values", name: null });
  });
});

describe("missing values", () => {
  it("answers incomplete for a missing fat, with what was there and never 0 for it", () => {
    const out = foodOf(milkWith({}, { fat_100g: undefined }));
    expect(out).toEqual({
      kind: "incomplete",
      reason: "missing_values",
      name: "Eila laktoositon kevytmaitojuoma, Valio",
      per100g: { energyKcal: 39, proteinG: 3.3, carbsG: 3.1, fatG: null },
    });
  });

  it("counts an array where a number belongs as missing", () => {
    expect(foodOf(milkWith({}, { proteins_100g: [3.3] }))).toMatchObject({
      reason: "missing_values",
      per100g: { proteinG: null },
    });
  });

  it("counts a product marked with no nutrition data as missing", () => {
    expect(foodOf(milkWith({ no_nutrition_data: "on" }))).toMatchObject({
      kind: "incomplete",
      reason: "missing_values",
    });
    expect(foodOf(milkWith({ no_nutrition_data: "" }))).toMatchObject({ kind: "complete" });
  });
});

describe("values that cannot all be right", () => {
  it("answers incomplete for macros over 101.5 g together", () => {
    const out = foodOf(milkWith({}, { proteins_100g: 40, carbohydrates_100g: 40, fat_100g: 21.6 }));
    expect(out).toMatchObject({ kind: "incomplete", reason: "implausible_values", per100g: { fatG: 21.6 } });
  });

  it("answers incomplete for one macro over 100 g, and for energy over 1000 kcal or below 0", () => {
    expect(foodOf(milkWith({}, { proteins_100g: 100.5 }))).toMatchObject({ reason: "implausible_values" });
    expect(foodOf(milkWith({}, { "energy-kcal_100g": 1000.5 }))).toMatchObject({ reason: "implausible_values" });
    expect(foodOf(milkWith({}, { fat_100g: -1 }))).toMatchObject({ reason: "implausible_values" });
  });
});
