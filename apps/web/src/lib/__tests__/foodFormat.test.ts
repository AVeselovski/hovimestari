import { parseDecimalInput } from "../decimalInput";
import { formatDecimalForField, formatGrams, formatKcal, formatMacroGrams } from "../foodFormat";

describe("foodFormat", () => {
  it("rounds kcal to a whole number and grams to one decimal, with no grouping", () => {
    expect(formatKcal(1698.3, "en")).toBe("1698");
    expect(formatKcal(59.5, "en")).toBe("60");
    expect(formatGrams(12.449, "en")).toBe("12.4");
    expect(formatGrams(12.45, "fi")).toBe("12,5");
    expect(formatGrams(4, "en")).toBe("4");
    expect(formatGrams(1250, "en")).toBe("1250");
  });

  it("shows Latin digits whatever the language", () => {
    expect(formatKcal(123, "ar-EG")).toBe("123");
    expect(formatGrams(1.5, "ar-EG")).toMatch(/^1.5$/);
  });

  it("writes a saved value back as it would be typed, and the field reads it as the same number", () => {
    for (const [value, locale] of [
      [8.25, "en"],
      [8.25, "fi"],
      [350, "en"],
      [0.125, "fi"],
    ] as const) {
      const typed = formatDecimalForField(value, locale);
      expect(parseDecimalInput(typed, { maxDecimals: 3 })).toEqual({ kind: "number", value });
    }
  });

  it("shows a macro's grams with one decimal always, so a column lines up, and each types back as its figure", () => {
    expect(formatMacroGrams(4, "en")).toBe("4.0");
    expect(formatMacroGrams(7.24, "en")).toBe("7.2");
    expect(formatMacroGrams(0, "fi")).toBe("0,0");
    expect(formatMacroGrams(99.96, "en")).toBe("100.0");
    for (const [value, locale] of [
      [4, "en"],
      [4, "fi"],
      [12.5, "fi"],
      [100, "en"],
    ] as const) {
      expect(parseDecimalInput(formatMacroGrams(value, locale), { maxDecimals: 3 })).toEqual({ kind: "number", value });
    }
  });
});
