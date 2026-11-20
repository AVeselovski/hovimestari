import { RecipeBodySchema } from "@hovimestari/types";
import { describe, expect, it } from "@jest/globals";
import { z } from "zod";
import { AppError } from "../errors.js";
import { parseBody } from "../parseBody.js";

// A refused body answers the first issue's code, and a refusal inside a
// recipe's lines names the line by its index, so the editor puts it under
// that ingredient.

function refusal(schema: z.ZodType, body: unknown): { code?: string; line?: number } {
  try {
    parseBody(schema, body);
  } catch (err) {
    if (err instanceof AppError) return { code: err.code, line: err.line };
    throw err;
  }
  throw new Error("parsed");
}

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

describe("parseBody", () => {
  it("names the line of a refused recipe line", () => {
    const lines = [
      { id: id(1), counted: false, name: "Salt" },
      { id: id(2), counted: false, name: "Pepper" },
      { id: id(3), counted: false, name: "Water" },
      { id: id(4), counted: true, foodId: id(9), amount: { portionId: id(8), count: 0 } },
    ];
    expect(refusal(RecipeBodySchema, { id: id(10), name: "Soup", servings: 2, lines })).toEqual({
      code: "entry_count_invalid",
      line: 3,
    });
  });

  it("names no line for a refusal elsewhere, nor for the list of lines itself", () => {
    expect(refusal(RecipeBodySchema, { id: id(10), name: "", servings: 2, lines: [] })).toEqual({
      code: "name_required",
      line: undefined,
    });
    expect(refusal(RecipeBodySchema, { id: id(10), name: "Soup", servings: 2, lines: [] })).toEqual({
      code: "recipe_lines_required",
      line: undefined,
    });
  });

  it("answers invalid_request for an issue that names no code", () => {
    expect(refusal(z.object({ n: z.number() }), { n: "x" })).toEqual({ code: "invalid_request", line: undefined });
  });
});
