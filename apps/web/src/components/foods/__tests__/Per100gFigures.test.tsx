import { render, screen } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";
import { Per100gFigures } from "../Per100gFigures";

describe("Per100gFigures", () => {
  it("shows the API's four figures, kcal whole and grams with one decimal always, each marked by its macro's hue", () => {
    render(<Per100gFigures figures={{ energyKcal: 1698.3, proteinG: 12.449, carbsG: 4, fatG: 0 }} />);
    const rows = [...document.querySelectorAll<HTMLElement>("[data-macro]")];
    expect(
      rows.map((r) => [r.dataset.macro, r.querySelector("dt")!.textContent, r.querySelector("dd")!.textContent]),
    ).toEqual([
      // A figure never parts from its unit: a no-break space joins them.
      ["energy", "Energy", "1698\u00a0kcal"],
      ["protein", "Protein", "12.4\u00a0g"],
      ["carbs", "Carbohydrates", "4.0\u00a0g"],
      ["fat", "Fat", "0.0\u00a0g"],
    ]);
    const dots = rows.map((r) => r.querySelector("[aria-hidden]")!.className.split(" "));
    expect(dots.map((d) => d.find((c) => c.startsWith("bg-")))).toEqual([
      "bg-energy",
      "bg-protein",
      "bg-carbs",
      "bg-fat",
    ]);
    // The figure itself stays in ink: a hue marks, never colours the number.
    for (const row of rows) expect(row.querySelector("dd")!.className.split(" ")).toContain("text-ink");
    expect(screen.getByText("1698 kcal")).toBeInTheDocument();
  });
});

describe("the macro hues", () => {
  // Reserved for the four figures' marks (docs/app/colors.md). This PR draws
  // them in Per100gFigures only, so any other file naming them borrows a hue.
  const SRC = path.resolve(__dirname, "../../..");
  const MACROS = ["energy", "protein", "carbs", "fat"] as const;
  /**
   * A utility of any prefix that ends in a macro's name: `bg-energy`,
   * `border-l-fat`, `hover:text-protein`, `decoration-carbs/50`.
   */
  const UTILITY = /(?<![\w-])[a-z][\w:/[\]-]*-(?:energy|protein|carbs|fat)(?![\w-])/;
  /** A colour utility whose colour is built at run time, which no search for a name can see. */
  const BUILT =
    /(?<![\w-])(?:[a-z]+:)*(?:bg|text|border(?:-[trblxyse])?|fill|stroke|outline|ring|decoration|from|via|to|accent|caret|divide|shadow)-\$\{/;

  function sources(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return entry.name === "__tests__" ? [] : sources(full);
      return /\.(tsx?|css)$/.test(entry.name) ? [full] : [];
    });
  }
  const files = sources(SRC).map((file) => ({ file: path.relative(SRC, file), text: fs.readFileSync(file, "utf8") }));

  it("are drawn by Per100gFigures alone, as a utility of any prefix", () => {
    expect(files.filter((f) => UTILITY.test(f.text)).map((f) => f.file)).toEqual([
      "components/foods/Per100gFigures.tsx",
    ]);
  });

  it("are never built into a colour class from a template string", () => {
    expect(files.filter((f) => BUILT.test(f.text)).map((f) => f.file)).toEqual([]);
  });

  it("finds the utilities it is meant to find", () => {
    for (const cls of [
      "bg-energy",
      "border-l-fat",
      "hover:text-protein",
      "decoration-carbs/50",
      "md:border-x-energy",
    ]) {
      expect([cls, UTILITY.test(`className="p-2 ${cls}"`)]).toEqual([cls, true]);
    }
    for (const text of ["carbsG", "energyKcal", 't("fat")', "data-macro"]) {
      expect([text, UTILITY.test(text)]).toEqual([text, false]);
    }
    expect(BUILT.test("className={`bg-${row.macro}`}")).toBe(true);
    expect(BUILT.test("className={`hover:border-l-${hue}`}")).toBe(true);
    expect(BUILT.test("name={`food-${field}`}")).toBe(false);
  });

  it("are declared in globals.css once per theme, and no other token reads them", () => {
    const css = fs.readFileSync(path.join(SRC, "app/globals.css"), "utf8");
    for (const macro of MACROS) {
      const declared = css.match(new RegExp(`--color-${macro}\\s*:`, "g")) ?? [];
      expect([macro, declared.length]).toEqual([macro, 2]);
      expect([macro, new RegExp(`var\\(\\s*--color-${macro}\\b`).test(css)]).toEqual([macro, false]);
    }
    // Only the declarations name them: no alias such as --color-mark: var(...) under another name.
    const mentions = css.match(/--color-(?:energy|protein|carbs|fat)\b/g) ?? [];
    expect(mentions).toHaveLength(MACROS.length * 2);
  });
});
