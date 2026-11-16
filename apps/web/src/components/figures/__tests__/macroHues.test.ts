import fs from "node:fs";
import path from "node:path";

describe("the macro hues", () => {
  // Reserved for the four figures' marks (docs/app/colors.md). MacroDot draws
  // the dots beside figures and Gauge the day's gauge, and globals.css
  // declares them. Any other file naming one borrows a hue.
  const SRC = path.resolve(__dirname, "../../..");
  const MACROS = ["energy", "protein", "carbs", "fat"] as const;
  /**
   * A utility of any prefix that ends in a macro's name: `bg-energy`,
   * `border-l-fat`, `hover:text-protein`, `decoration-carbs/50`.
   */
  const UTILITY = /(?<![\w-])[a-z][\w:/[\]-]*-(?:energy|protein|carbs|fat)(?:-plan)?(?![\w-])/;
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

  it("are drawn by MacroDot and Gauge alone, as a utility of any prefix, plan tints included", () => {
    expect(
      files
        .filter((f) => UTILITY.test(f.text))
        .map((f) => f.file)
        .sort(),
    ).toEqual(["components/day/Gauge.tsx", "components/figures/MacroDot.tsx"]);
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
      "bg-energy-plan",
      "bg-protein-plan",
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

  it("are declared in globals.css once per theme, with the two plan tints, and no other token reads them", () => {
    const css = fs.readFileSync(path.join(SRC, "app/globals.css"), "utf8");
    const tokens = [...MACROS, "energy-plan", "protein-plan"];
    for (const token of tokens) {
      const declared = css.match(new RegExp(`--color-${token}\\s*:`, "g")) ?? [];
      expect([token, declared.length]).toEqual([token, 2]);
      expect([token, new RegExp(`var\\(\\s*--color-${token}(?![\\w-])`).test(css)]).toEqual([token, false]);
    }
    // Only the declarations name them: no alias such as --color-mark: var(...) under another name.
    const mentions = css.match(/--color-(?:energy|protein|carbs|fat)(?:-plan)?(?![\w-])/g) ?? [];
    expect(mentions).toHaveLength(tokens.length * 2);
  });
});
