import { describe, it, expect } from "vitest";
import {
  isCountableUnit,
  scaleAmount,
  formatRecipeAmount,
  formatShoppingAmount,
} from "./amount.js";

describe("isCountableUnit", () => {
  it("recognizes the closed Finnish countable set", () => {
    for (const u of ["kpl", "pkt", "prk", "tlk", "rasia", "pss", "nippu", "kynttä"]) {
      expect(isCountableUnit(u)).toBe(true);
    }
  });

  it("returns false for decimal units", () => {
    for (const u of ["g", "kg", "dl", "l", "ml", "tl", "rkl"]) {
      expect(isCountableUnit(u)).toBe(false);
    }
  });

  it("is case-insensitive and trims whitespace", () => {
    expect(isCountableUnit("KPL")).toBe(true);
    expect(isCountableUnit("  pkt  ")).toBe(true);
  });

  it("returns false for empty unit", () => {
    expect(isCountableUnit("")).toBe(false);
  });
});

describe("scaleAmount", () => {
  it("propagates null", () => {
    expect(scaleAmount(null, 6, 4)).toBeNull();
  });

  it("scales linearly", () => {
    expect(scaleAmount(400, 6, 4)).toBe(600);
    expect(scaleAmount(1, 6, 4)).toBe(1.5);
  });

  it("preserves 0 as a valid scaled amount", () => {
    expect(scaleAmount(0, 6, 4)).toBe(0);
  });

  it("falls back when base servings is 0 or negative", () => {
    expect(scaleAmount(100, 6, 0)).toBe(100);
    expect(scaleAmount(100, 6, -2)).toBe(100);
  });
});

describe("formatRecipeAmount", () => {
  it("formats integers without a decimal", () => {
    expect(formatRecipeAmount(1)).toBe("1");
    expect(formatRecipeAmount(1.0)).toBe("1");
    expect(formatRecipeAmount(400)).toBe("400");
  });

  it("keeps up to 2 decimals, trimming trailing zeros", () => {
    expect(formatRecipeAmount(0.5)).toBe("0.5");
    expect(formatRecipeAmount(1.25)).toBe("1.25");
    expect(formatRecipeAmount(1.2)).toBe("1.2");
  });

  it("renders 0 as '0'", () => {
    expect(formatRecipeAmount(0)).toBe("0");
  });

  it("returns empty string for null", () => {
    expect(formatRecipeAmount(null)).toBe("");
  });
});

describe("formatShoppingAmount", () => {
  it("rounds up for countable units", () => {
    expect(formatShoppingAmount(1.5, "pkt")).toBe("2");
    expect(formatShoppingAmount(2.1, "kpl")).toBe("3");
    expect(formatShoppingAmount(2, "kpl")).toBe("2");
  });

  it("uses decimal formatting for non-countable units", () => {
    expect(formatShoppingAmount(1.5, "g")).toBe("1.5");
    expect(formatShoppingAmount(400, "g")).toBe("400");
    expect(formatShoppingAmount(0.5, "dl")).toBe("0.5");
  });

  it("propagates null as empty string", () => {
    expect(formatShoppingAmount(null, "g")).toBe("");
    expect(formatShoppingAmount(null, "kpl")).toBe("");
  });
});
