import { Per100gFigures } from "@/components/foods/Per100gFigures";
import { render, screen, within } from "@testing-library/react";
import { MacroFigures } from "../MacroFigures";

const rowsOf = () => [...document.querySelectorAll<HTMLElement>("[data-macro]")];

describe("MacroFigures", () => {
  it("shows the four figures, kcal whole and grams with one decimal always, each marked by its macro's hue", () => {
    render(<MacroFigures figures={{ energyKcal: 1698.3, proteinG: 12.449, carbsG: 3.6, fatG: 0 }} />);
    const rows = rowsOf();
    expect(
      rows.map((r) => [r.dataset.macro, r.querySelector("dt")!.textContent, r.querySelector("dd")!.textContent]),
    ).toEqual([
      ["energy", "Energy", "1698\u00a0kcal"],
      ["protein", "Protein", "12.4\u00a0g"],
      ["carbs", "Carbohydrates", "3.6\u00a0g"],
      ["fat", "Fat", "0.0\u00a0g"],
    ]);
    const dots = rows.map((r) => r.querySelector("[data-macro-dot]")!.className.split(" "));
    expect(dots.map((d) => d.find((c) => c.startsWith("bg-")))).toEqual([
      "bg-energy",
      "bg-protein",
      "bg-carbs",
      "bg-fat",
    ]);
    // The figure itself stays in ink: a hue marks, never colours the number.
    for (const row of rows) expect(row.querySelector("dd")!.className.split(" ")).toContain("text-ink");
  });

  it("keeps all four rows with empty figure slots while there are no figures", () => {
    render(<MacroFigures figures={null} />);
    const rows = rowsOf();
    expect(rows).toHaveLength(4);
    for (const row of rows) {
      expect(row.querySelector("dd")!.textContent).toBe("");
      expect(row.className.split(" ")).toContain("min-h-12");
    }
  });

  it("marks an estimate's figures with ≈, read as estimated", () => {
    render(<MacroFigures figures={{ energyKcal: 900, proteinG: 40, carbsG: 80, fatG: 35 }} estimate />);
    const energy = rowsOf()[0].querySelector("dd")!;
    expect(energy.textContent).toBe("≈estimated900\u00a0kcal");
    expect(within(energy).getByText("≈")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getAllByText("estimated")).toHaveLength(4);
  });

  it("is what a food's per 100 g figures render through", () => {
    render(<Per100gFigures figures={{ energyKcal: 59.31, proteinG: 12.44, carbsG: 3.6, fatG: 0.2 }} />);
    expect(rowsOf().map((r) => r.querySelector("dd")!.textContent)).toEqual([
      "59\u00a0kcal",
      "12.4\u00a0g",
      "3.6\u00a0g",
      "0.2\u00a0g",
    ]);
  });
});
