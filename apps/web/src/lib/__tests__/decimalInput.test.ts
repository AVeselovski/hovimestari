import { parseDecimalInput } from "../decimalInput";

const one = { maxDecimals: 1 };

describe("parseDecimalInput", () => {
  it("reads a comma or a point as the decimal separator", () => {
    expect(parseDecimalInput("9,8", one)).toEqual({ kind: "number", value: 9.8 });
    expect(parseDecimalInput("9.8", one)).toEqual({ kind: "number", value: 9.8 });
    expect(parseDecimalInput(" 1800 ", one)).toEqual({ kind: "number", value: 1800 });
    expect(parseDecimalInput("0,5", one)).toEqual({ kind: "number", value: 0.5 });
    expect(parseDecimalInput(",5", one)).toEqual({ kind: "number", value: 0.5 });
    expect(parseDecimalInput("12,", one)).toEqual({ kind: "number", value: 12 });
  });

  it("refuses grouping, a sign, letters and a bare separator", () => {
    for (const raw of ["1.234,5", "1,234.5", "1 800", "-1", "+1", "abc", "1e3", ",", ".", "1,2,3", "0x10"]) {
      expect([raw, parseDecimalInput(raw, one)]).toEqual([raw, { kind: "invalid" }]);
    }
  });

  it("refuses more decimals than allowed instead of rounding them", () => {
    expect(parseDecimalInput("1800,25", one)).toEqual({ kind: "invalid" });
    expect(parseDecimalInput("1,125", { maxDecimals: 3 })).toEqual({ kind: "number", value: 1.125 });
    expect(parseDecimalInput("7", { maxDecimals: 0 })).toEqual({ kind: "number", value: 7 });
    expect(parseDecimalInput("7,5", { maxDecimals: 0 })).toEqual({ kind: "invalid" });
  });

  it("counts no decimal for a trailing zero, so a number typed with one is read as it equals", () => {
    expect(parseDecimalInput("120.50", one)).toEqual({ kind: "number", value: 120.5 });
    expect(parseDecimalInput("120,50", one)).toEqual({ kind: "number", value: 120.5 });
    expect(parseDecimalInput("7,0", { maxDecimals: 0 })).toEqual({ kind: "number", value: 7 });
    expect(parseDecimalInput("12,0000", one)).toEqual({ kind: "number", value: 12 });
    expect(parseDecimalInput("120.51", one)).toEqual({ kind: "invalid" });
  });

  it("counts three digits after the separator as written, since they may be a thousands group", () => {
    // "2,000" on an English keypad means two thousand: refused, never read as 2.
    for (const raw of ["2,000", "1.500", "120,500"]) {
      expect([raw, parseDecimalInput(raw, one)]).toEqual([raw, { kind: "invalid" }]);
    }
    expect(parseDecimalInput("1.500", { maxDecimals: 3 })).toEqual({ kind: "number", value: 1.5 });
  });

  it("tells an empty field from a wrong one", () => {
    expect(parseDecimalInput("", one)).toEqual({ kind: "empty" });
    expect(parseDecimalInput("   ", one)).toEqual({ kind: "empty" });
  });
});
