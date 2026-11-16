import { parseDecimalInput } from "../decimalInput";
import { formatTarget } from "../targetFormat";

describe("formatTarget", () => {
  it("writes the decimal separator of the device's language, with no grouping", () => {
    expect(formatTarget(1800, "en")).toBe("1800");
    expect(formatTarget(142.5, "en")).toBe("142.5");
    expect(formatTarget(142.5, "fi")).toBe("142,5");
    expect(formatTarget(12000, "fi")).toBe("12000");
  });

  it("writes Latin digits in a language with digits of its own", () => {
    expect(formatTarget(1800.5, "ar-EG")).toBe("1800.5");
    expect(formatTarget(142.5, "fa")).toBe("142.5");
    expect(formatTarget(160, "hi-IN-u-nu-deva")).toBe("160");
  });

  it.each(["en", "fi", "de", "fr", "ar-EG", "fa", "hi-IN-u-nu-deva", "bn"])(
    "shows in %s what the number fields read back as the same number",
    (locale) => {
      for (const value of [1800, 142.5, 0.5, 99999]) {
        expect(parseDecimalInput(formatTarget(value, locale), { maxDecimals: 1 })).toEqual({ kind: "number", value });
      }
    },
  );
});
