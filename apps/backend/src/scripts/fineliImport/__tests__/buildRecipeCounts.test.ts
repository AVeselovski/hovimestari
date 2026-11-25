import { describe, expect, it } from "@jest/globals";
import { readFileSync } from "node:fs";
import path from "node:path";
import { moduleText } from "../buildRecipeCounts.js";
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
  );

  it("writes one tuple per food, null for a food without a recipe", () => {
    expect(text).toContain('export const RECIPE_COUNTS_R18: RecipeCountsTable = {\n  release: "18.0",\n  rows: [');
    expect(text).toContain("    [1, 337, null], [29, 53, 1],\n");
  });

  it("names the release, the licence and where the input came from", () => {
    expect(text).toContain("Fineli release 18.0,");
    expect(text).toContain("Creative Commons Attribution 4.0");
    expect(text).toContain("THL does not produce or endorse Hovimestari.");
    expect(text).toContain("// Built from: a test\n");
  });

  it("refuses a source with a line break, which would end the comment it is written into", () => {
    expect(() => moduleText(new Map(), "18.0", "one line\nexport const x = 1;")).toThrow("The source must be one line");
  });

  it("refuses a release that is not a number", () => {
    expect(() => moduleText(new Map(), "eighteen", "a test")).toThrow('not "eighteen"');
  });

  it("writes the committed module again from its own rows, byte for byte", () => {
    const file = path.resolve("src/scripts/fineliImport/recipeCountsR18.ts");
    const committed = readFileSync(file, "utf8");
    const source = /^\/\/ Built from: (.*)$/m.exec(committed)?.[1] as string;
    expect(moduleText(countsOfTable(RECIPE_COUNTS_R18), RECIPE_COUNTS_R18.release, source)).toBe(committed);
  });
});
