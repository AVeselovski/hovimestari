import { GRAMS, parseAmount, parseCount } from "../amount";

// A count (meals, servings, a food's portions) is at most 100 with two
// decimals, so a number that may hold a thousands group is out of range
// whichever way it reads. It takes the range's line, never the group's.

describe("parseCount", () => {
  it.each(["1.255", "1,255", "0.125", "0,125", "2,000", "100.01", "0", "abc"])(
    "refuses %s with the range's code",
    (typed) => {
      expect(parseCount(typed)).toBe("entry_count_invalid");
    },
  );

  it.each([
    ["1,5", 1.5],
    ["1.25", 1.25],
    ["100", 100],
    ["0,01", 0.01],
  ])("reads %s as %s", (typed, value) => {
    expect(parseCount(typed)).toBe(value);
  });

  it("refuses too many decimals in a portion count with the range's code too", () => {
    expect(parseAmount("1,255", "portion-id")).toBe("entry_count_invalid");
  });

  it("keeps the group's own line for grams, where 1,255 may mean 1255 g", () => {
    expect(parseAmount("1,255", GRAMS)).toBe("digit_group");
  });
});
