import { describe, expect, it } from "@jest/globals";
import { formsOf, SEARCH_FORMS } from "../foodSearchForms.js";

/** The first thirteen pairs: the genitive does not begin with its base. */
const CHANGED_STEM = SEARCH_FORMS.filter(([base, genitive]) => !genitive.startsWith(base));
const REGULAR = SEARCH_FORMS.filter(([base, genitive]) => genitive.startsWith(base));

describe("SEARCH_FORMS", () => {
  it("holds 18 pairs, 13 with a changed stem and 5 regular", () => {
    expect(SEARCH_FORMS).toHaveLength(18);
    expect(CHANGED_STEM).toHaveLength(13);
    expect(REGULAR.map(([base]) => base)).toEqual(["kana", "broileri", "kalkkuna", "poro", "peruna"]);
  });

  it("holds only normalised words of two characters or more, so each is safe inside a LIKE pattern", () => {
    for (const word of SEARCH_FORMS.flat()) expect(word).toMatch(/^[a-z0-9]{2,}$/);
  });

  it("names each word once", () => {
    const words = SEARCH_FORMS.flat();
    expect(new Set(words).size).toBe(words.length);
  });
});

describe("formsOf", () => {
  it("answers the base for every typed genitive, as a plain word", () => {
    for (const [base, genitive] of SEARCH_FORMS) {
      expect(formsOf(genitive)).toEqual([{ form: base, compound: false }]);
    }
  });

  it("answers the genitive for the typed base of a changed-stem pair, as a compound's first part", () => {
    for (const [base, genitive] of CHANGED_STEM) {
      expect(formsOf(base)).toEqual([{ form: genitive, compound: true }]);
    }
    expect(formsOf("nauta")).toEqual([{ form: "naudan", compound: true }]);
  });

  it("answers nothing for the typed base of a regular pair", () => {
    for (const [base] of REGULAR) expect(formsOf(base)).toEqual([]);
    expect(formsOf("kana")).toEqual([]);
    expect(formsOf("poro")).toEqual([]);
  });

  it.each(["naut", "nautaa", "harka", "haran", "rahka", ""])("answers nothing for %p", (word) => {
    expect(formsOf(word)).toEqual([]);
  });
});
