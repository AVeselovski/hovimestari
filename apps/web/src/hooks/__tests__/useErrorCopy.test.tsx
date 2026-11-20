import { renderHook } from "@testing-library/react";
import { AxiosError, type AxiosResponse } from "axios";
import { useErrorCopy } from "../useErrorCopy";

// The catalog line for a refusal, from the real catalog. A refusal whose line
// names something reads the names from the answer's `details`.

function answered(status: number, data: unknown): AxiosError {
  return new AxiosError("failed", "ERR_BAD_REQUEST", undefined, undefined, { status, data } as AxiosResponse);
}

const tooLarge = (details: object) => answered(400, { message: "x", code: "food_edit_recipe_too_large", details });

describe("useErrorCopy", () => {
  it("names the one recipe a refused food edit would take past the cap", () => {
    const { result } = renderHook(() => useErrorCopy());
    expect(result.current.forError(tooLarge({ recipe: "Shakshuka", others: 0, recipes: ["Shakshuka"] }))).toBe(
      "A planned serving of Shakshuka would come to more than 10000 kcal or 1000 g of protein, carbs or fat. Change the recipe or its planned entries first.",
    );
  });

  it("names the first recipe and counts the others", () => {
    const { result } = renderHook(() => useErrorCopy());
    const one = tooLarge({ recipe: "Chili", others: 1, recipes: ["Chili", "Shakshuka"] });
    const four = tooLarge({ recipe: "Chili", others: 4, recipes: ["Chili", "Puuro", "Shakshuka"] });
    expect(result.current.forError(one)).toBe(
      "Planned servings of Chili and one other recipe would come to more than 10000 kcal or 1000 g of protein, carbs or fat. Change those recipes or their planned entries first.",
    );
    expect(result.current.forError(four)).toBe(
      "Planned servings of Chili and 4 other recipes would come to more than 10000 kcal or 1000 g of protein, carbs or fat. Change those recipes or their planned entries first.",
    );
  });

  it("shows a refusal without details by its code alone", () => {
    const { result } = renderHook(() => useErrorCopy());
    expect(result.current.forError(answered(404, { code: "recipe_not_found" }))).toBe(
      result.current.forCode("recipe_not_found"),
    );
  });
});
