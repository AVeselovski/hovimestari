import { describe, expect, it } from "@jest/globals";
import { RecipeBodySchema, RecipeQuerySchema, RecipeReadQuerySchema } from "../index.js";

// The recipe schemas where a query string or a body can be read wrong: a
// flag that is the string "false", a tag sent once or twice, and the codes a
// refused body answers with.

const issue = (result: { success: boolean; error?: { issues: { message: string; path: PropertyKey[] }[] } }) =>
  result.success ? null : { code: result.error!.issues[0]!.message, path: result.error!.issues[0]!.path };

describe("RecipeQuerySchema", () => {
  it("reads archived as the strings true and false, false when absent, and refuses anything else", () => {
    expect(RecipeQuerySchema.parse({ archived: "false" }).archived).toBe(false);
    expect(RecipeQuerySchema.parse({ archived: "true" }).archived).toBe(true);
    expect(RecipeQuerySchema.parse({}).archived).toBe(false);
    expect(RecipeQuerySchema.safeParse({ archived: "yes" }).success).toBe(false);
  });

  it("reads favourites the same way, absent as no filter", () => {
    expect(RecipeQuerySchema.parse({ favourites: "false" }).favourites).toBe(false);
    expect(RecipeQuerySchema.parse({ favourites: "true" }).favourites).toBe(true);
    expect(RecipeQuerySchema.parse({}).favourites).toBeUndefined();
    expect(RecipeQuerySchema.safeParse({ favourites: "yes" }).success).toBe(false);
  });

  it("makes one tag a list of one and keeps a list of two", () => {
    expect(RecipeQuerySchema.parse({ tags: "x" }).tags).toEqual(["x"]);
    expect(RecipeQuerySchema.parse({ tags: ["x", "y"] }).tags).toEqual(["x", "y"]);
  });

  it("reads figure bounds as numbers and sorts by name by default", () => {
    expect(RecipeQuerySchema.parse({ minProteinG: "30", sort: "protein" })).toEqual({
      archived: false,
      minProteinG: 30,
      sort: "protein",
    });
    expect(RecipeQuerySchema.parse({}).sort).toBe("name");
  });
});

describe("RecipeReadQuerySchema", () => {
  it("takes servings as a whole number from 1 to 100", () => {
    expect(RecipeReadQuerySchema.parse({ servings: "3" }).servings).toBe(3);
    expect(RecipeReadQuerySchema.parse({}).servings).toBeUndefined();
    expect(RecipeReadQuerySchema.safeParse({ servings: "1.5" }).success).toBe(false);
    expect(RecipeReadQuerySchema.safeParse({ servings: "101" }).success).toBe(false);
  });
});

describe("RecipeBodySchema", () => {
  const id = "00000000-0000-4000-8000-000000000001";
  const line = (n: number) => ({
    id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    counted: false,
    name: "Salt",
  });
  const body = (extra: object = {}) => ({ id, name: "Shakshuka", servings: 2, lines: [line(10)], ...extra });

  it("fills in what a recipe may leave out", () => {
    expect(RecipeBodySchema.parse(body())).toEqual({
      id,
      name: "Shakshuka",
      servings: 2,
      timeMinutes: null,
      lines: [{ ...line(10), written: null, note: null }],
      steps: [],
      notes: null,
      tags: [],
    });
  });

  it("keeps a tag once, compared without case, in the first spelling", () => {
    expect(RecipeBodySchema.parse(body({ tags: [" Brunch ", "brunch", "Quick"] })).tags).toEqual(["Brunch", "Quick"]);
  });

  it("answers each refusal's code, and the line a line's refusal is on", () => {
    expect(issue(RecipeBodySchema.safeParse(body({ lines: [] })))?.code).toBe("recipe_lines_required");
    expect(
      issue(RecipeBodySchema.safeParse(body({ lines: Array.from({ length: 61 }, (_, i) => line(i + 10)) })))?.code,
    ).toBe("recipe_lines_too_many");
    expect(issue(RecipeBodySchema.safeParse(body({ servings: 2.5 })))?.code).toBe("recipe_servings_invalid");
    expect(issue(RecipeBodySchema.safeParse(body({ timeMinutes: 1441 })))?.code).toBe("recipe_time_invalid");
    expect(issue(RecipeBodySchema.safeParse(body({ tags: Array.from({ length: 11 }, (_, i) => `t${i}`) })))?.code).toBe(
      "tags_too_many",
    );
    expect(issue(RecipeBodySchema.safeParse(body({ steps: ["x".repeat(1001)] })))?.code).toBe("step_too_long");
    expect(issue(RecipeBodySchema.safeParse(body({ notes: "x".repeat(2001) })))?.code).toBe("notes_too_long");
    const counted = {
      id: "00000000-0000-4000-8000-000000000099",
      counted: true,
      foodId: id,
      amount: { grams: 0 },
    };
    expect(issue(RecipeBodySchema.safeParse(body({ lines: [line(10), line(11), counted] })))).toEqual({
      code: "entry_grams_invalid",
      path: ["lines", 2, "amount", "grams"],
    });
    expect(issue(RecipeBodySchema.safeParse(body({ lines: [{ ...line(10), name: " " }] })))?.code).toBe(
      "line_name_required",
    );
    expect(
      issue(RecipeBodySchema.safeParse(body({ lines: [{ ...line(10), written: { amount: 2, unit: "tlk" } }] })))?.code,
    ).toBe("written_amount_invalid");
  });

  it("refuses two lines with one id", () => {
    expect(RecipeBodySchema.safeParse(body({ lines: [line(10), line(10)] })).success).toBe(false);
  });
});
