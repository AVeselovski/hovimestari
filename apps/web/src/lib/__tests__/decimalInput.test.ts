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
    expect(parseDecimalInput("0,125", { maxDecimals: 3 })).toEqual({ kind: "number", value: 0.125 });
    expect(parseDecimalInput("7", { maxDecimals: 0 })).toEqual({ kind: "number", value: 7 });
    expect(parseDecimalInput("7,5", { maxDecimals: 0 })).toEqual({ kind: "invalid" });
  });

  it("counts no decimal for a trailing zero in a fraction of one or two digits", () => {
    expect(parseDecimalInput("120.50", one)).toEqual({ kind: "number", value: 120.5 });
    expect(parseDecimalInput("120,50", one)).toEqual({ kind: "number", value: 120.5 });
    expect(parseDecimalInput("7,0", { maxDecimals: 0 })).toEqual({ kind: "number", value: 7 });
    expect(parseDecimalInput("120.51", one)).toEqual({ kind: "invalid" });
  });

  // One rule for every field: a fraction that may be a thousands group is
  // refused as `group`, at one decimal and at three alike, and trailing
  // zeros past two digits count, so "120,5000" is no way around "120,500".
  const three = { maxDecimals: 3 };
  it.each([
    ["7,0", { kind: "number", value: 7 }, { kind: "number", value: 7 }],
    ["7,00", { kind: "number", value: 7 }, { kind: "number", value: 7 }],
    ["7,000", { kind: "group" }, { kind: "group" }],
    ["0,500", { kind: "invalid" }, { kind: "number", value: 0.5 }],
    ["1.2300", { kind: "invalid" }, { kind: "invalid" }],
    ["120,500", { kind: "group" }, { kind: "group" }],
    ["120,5000", { kind: "invalid" }, { kind: "invalid" }],
    ["2,000", { kind: "group" }, { kind: "group" }],
    ["1.500", { kind: "group" }, { kind: "group" }],
    ["1234,500", { kind: "invalid" }, { kind: "number", value: 1234.5 }],
    ["0,125", { kind: "invalid" }, { kind: "number", value: 0.125 }],
    [",125", { kind: "invalid" }, { kind: "number", value: 0.125 }],
    ["12,0000", { kind: "invalid" }, { kind: "invalid" }],
    // Leading zeros are no way around the group rule. A lone zero stays one.
    ["012,345", { kind: "group" }, { kind: "group" }],
    ["0012.345", { kind: "group" }, { kind: "group" }],
    ["0001,500", { kind: "group" }, { kind: "group" }],
    ["00,500", { kind: "invalid" }, { kind: "number", value: 0.5 }],
    ["000,125", { kind: "invalid" }, { kind: "number", value: 0.125 }],
  ])("reads %p as %p at one decimal and %p at three", (raw, atOne, atThree) => {
    expect(parseDecimalInput(raw, one)).toEqual(atOne);
    expect(parseDecimalInput(raw, three)).toEqual(atThree);
  });

  // A value of 1 or more cannot carry a third decimal when typed, whatever
  // the field allows. Below 1 it can.
  const two = { maxDecimals: 2 };
  it.each([
    // [typed, at one decimal, at two, at three]
    ["12,3", 12.3, 12.3, 12.3],
    ["012,3", 12.3, 12.3, 12.3],
    ["12,34", "invalid", 12.34, 12.34],
    ["012,34", "invalid", 12.34, 12.34],
    ["12,345", "group", "group", "group"],
    ["012,345", "group", "group", "group"],
    ["0,345", "invalid", "invalid", 0.345],
    ["0,3", 0.3, 0.3, 0.3],
  ] as const)("reads %p at one, two and three decimals", (raw, atOne, atTwo, atThree) => {
    const as = (v: number | string) => (typeof v === "number" ? { kind: "number", value: v } : { kind: v });
    expect(parseDecimalInput(raw, one)).toEqual(as(atOne));
    expect(parseDecimalInput(raw, two)).toEqual(as(atTwo));
    expect(parseDecimalInput(raw, three)).toEqual(as(atThree));
  });

  it("tells an empty field from a wrong one", () => {
    expect(parseDecimalInput("", one)).toEqual({ kind: "empty" });
    expect(parseDecimalInput("   ", one)).toEqual({ kind: "empty" });
  });
});
