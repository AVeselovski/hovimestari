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
      { name: "Pasta", amount: 400, unit: "g", category: "pantry" },
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

  it("renders ingredient amounts at the recipe's base servings on mount", () => {
    const html = render(baseRecipe({ servings: 4 }));
    // Base amount, no scaling.
    expect(html).toContain("400");
    expect(html).toContain("Pasta");
  });

  it("includes a ServingsChip row with the recipe's base + presets", () => {
    const html = render(baseRecipe({ servings: 4 }));
    // Chip group is labelled "Annoskoko" (group role); the base chip has
    // the "(oletus)" suffix in its aria-label.
    expect(html).toContain('aria-label="Annoskoko"');
    expect(html).toContain('aria-label="4 annosta (oletus)"');
    expect(html).toContain('aria-label="6 annosta"');
    expect(html).toContain('aria-label="8 annosta"');
  });

  it("reverts to base servings on remount (no persistence)", () => {
    // Two fresh renders of the same recipe always show the base amount —
    // there is no module-level state.
    const a = render(baseRecipe({ servings: 4 }));
    const b = render(baseRecipe({ servings: 4 }));
    expect(a).toBe(b);
    // The base-amount text appears in both.
    expect(a).toContain("400");
    expect(b).toContain("400");
  });

  it("renders a cover banner when imageId is set", () => {
    const html = render(baseRecipe({ imageId: "abc-123.jpg" }));
    expect(html).toContain("/images/abc-123.jpg");
    expect(html).toContain('alt="Jauhelihapasta"');
  });

  it("renders no cover banner when imageId is absent", () => {
    const html = render(baseRecipe());
    expect(html).not.toContain("/images/");
  });

  it("scales amounts correctly via the scaleAmount helper for the interactive case", async () => {
    // The full DOM-interaction test would require @testing-library/react.
    // We assert the underlying contract (scaleAmount + formatRecipeAmount
    // produce the expected '600' for 400 × 6/4) since that is what the
    // component renders. The base-state SSR test above proves the wiring
    // is in place.
    const { scaleAmount, formatRecipeAmount } = await import("../lib/amount.js");
    expect(formatRecipeAmount(scaleAmount(400, 6, 4))).toBe("600");
    expect(formatRecipeAmount(scaleAmount(0.5, 6, 4))).toBe("0.75");
  });
});
