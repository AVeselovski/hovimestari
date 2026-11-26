import { describe, expect, it } from "@jest/globals";
import { readFileSync } from "node:fs";
import path from "node:path";
import { moduleText, namedMostUsed } from "../buildRecipeCounts.js";
import { countsOfTable } from "../recipeCounts.js";
import { RECIPE_COUNTS_R18 } from "../recipeCountsR18.js";

describe("moduleText", () => {
  const text = moduleText(
    new Map([
      [1, { uses: 337, foods: null }],
      [29, { uses: 53, foods: 1 }],
    ]),
    "18.0",
    "a test",
    [
      [1, "Sokeri"],
      [29, 'Liemi, "oma"'],
    ],
  );

  it("writes one tuple per food, null for a food without a recipe", () => {
    expect(text).toContain('export const RECIPE_COUNTS_R18: RecipeCountsTable = {\n  release: "18.0",\n  mostUsed: [');
    expect(text).toContain("    [1, 337, null], [29, 53, 1],\n");
  });

  it("writes the most used foods with their names, quoted as TypeScript strings", () => {
    expect(text).toContain('  mostUsed: [\n    [1, "Sokeri"],\n    [29, "Liemi, \\"oma\\""],\n  ],\n  rows: [');
  });

  it("names the most used foods most used first, and stops on one without a name", () => {
    const counts = new Map([
      [1, { uses: 2, foods: null }],
      [5, { uses: 9, foods: null }],
      [7, { uses: 0, foods: 3 }],
    ]);
    const names = new Map([
      [1, "Sokeri"],
      [5, "Suola"],
    ]);
    expect(namedMostUsed(counts, names)).toEqual([
      [5, "Suola"],
      [1, "Sokeri"],
    ]);
    expect(() => namedMostUsed(counts, new Map([[1, "Sokeri"]]))).toThrow("Food 5 is among the most used");
  });

  it("names the release, the licence and where the input came from", () => {
    expect(text).toContain("Fineli release 18.0,");
    expect(text).toContain("Creative Commons Attribution 4.0");
    expect(text).toContain("THL does not produce or endorse Hovimestari.");
    expect(text).toContain("// Built from: a test\n");
  });

  it("refuses a source with a line break, which would end the comment it is written into", () => {
    expect(() => moduleText(new Map(), "18.0", "one line\nexport const x = 1;", [])).toThrow(
      "The source must be one line",
    );
  });

  it("refuses a release that is not a number", () => {
    expect(() => moduleText(new Map(), "eighteen", "a test", [])).toThrow('not "eighteen"');
  });

  it("writes the committed module again from its own rows, byte for byte", () => {
    const file = path.resolve("src/scripts/fineliImport/recipeCountsR18.ts");
    const committed = readFileSync(file, "utf8");
    const source = /^\/\/ Built from: (.*)$/m.exec(committed)?.[1] as string;
    expect(
      moduleText(countsOfTable(RECIPE_COUNTS_R18), RECIPE_COUNTS_R18.release, source, RECIPE_COUNTS_R18.mostUsed),
    ).toBe(committed);
  });
});
