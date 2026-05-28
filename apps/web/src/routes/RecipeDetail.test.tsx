import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { Recipe } from "@hovi/shared";
import { RecipeDetailView } from "./RecipeDetail.js";

// MemoryRouter uses useLayoutEffect; React emits an SSR warning for it.
// Silence it for these tests — we're using renderToStaticMarkup deliberately.
const errorSpy = vi.spyOn(console, "error").mockImplementation((msg, ...rest) => {
  if (typeof msg === "string" && msg.includes("useLayoutEffect")) return;
  console.warn(msg, ...rest);
});
beforeAll(() => errorSpy.mockClear());
afterAll(() => errorSpy.mockRestore());

function baseRecipe(overrides: Partial<Recipe> = {}): Recipe {
  return {
    id: "r1",
    name: "Jauhelihapasta",
    time: 20,
    servings: 4,
    category: "common",
    ingredients: [
      { name: "Pasta", amount: "400", unit: "g", category: "pantry" },
    ],
    instructions: [],
    ...overrides,
  };
}

function render(recipe: Recipe): string {
  return renderToStaticMarkup(
    <MemoryRouter>
      <Routes>
        <Route
          path="*"
          element={
            <RecipeDetailView
              recipe={recipe}
              onBack={() => {}}
              onEdit={() => {}}
            />
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("RecipeDetail", () => {
  it("renders instructions as an ordered list in saved order", () => {
    const html = render(
      baseRecipe({
        instructions: [
          "Keitä pasta runsaassa suolatussa vedessä.",
          "Paista jauheliha sipulin kanssa.",
          "Yhdistä ja tarjoile.",
        ],
      }),
    );
    expect(html).toContain("<ol");
    const olStart = html.indexOf("<ol");
    const olEnd = html.indexOf("</ol>");
    const inside = html.slice(olStart, olEnd);
    const i1 = inside.indexOf("Keitä pasta");
    const i2 = inside.indexOf("Paista jauheliha");
    const i3 = inside.indexOf("Yhdistä ja tarjoile");
    expect(i1).toBeGreaterThanOrEqual(0);
    expect(i2).toBeGreaterThan(i1);
    expect(i3).toBeGreaterThan(i2);
  });

  it("shows the empty-state copy when instructions are missing", () => {
    const html = render(baseRecipe({ instructions: [] }));
    expect(html).toContain("Ei ohjeita vielä — lisää itse.");
    expect(html).not.toContain("<ol");

    const noField = baseRecipe();
    delete (noField as { instructions?: unknown }).instructions;
    const html2 = render(noField as Recipe);
    expect(html2).toContain("Ei ohjeita vielä — lisää itse.");
    expect(html2).not.toContain("<ol");
  });
});
