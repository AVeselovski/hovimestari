import { EMPTY_TARGET_FIELDS, firstInvalidField, parseTargetFields } from "../targetForm";

const filled = { energyLower: "1800", energyUpper: "2200", proteinLower: "120,5", proteinUpper: "160" };

describe("parseTargetFields", () => {
  it("answers the body the API takes, reading a decimal comma", () => {
    expect(parseTargetFields(filled)).toEqual({
      ok: true,
      body: { ranges: { energyKcal: { lower: 1800, upper: 2200 }, proteinG: { lower: 120.5, upper: 160 } } },
    });
  });

  it("reads a trailing zero as no decimal, and the shared schema agrees", () => {
    expect(parseTargetFields({ ...filled, proteinLower: "120.50", energyUpper: "2200,0" })).toEqual({
      ok: true,
      body: { ranges: { energyKcal: { lower: 1800, upper: 2200 }, proteinG: { lower: 120.5, upper: 160 } } },
    });
    expect(parseTargetFields({ ...filled, energyLower: "2,000" })).toEqual({
      ok: false,
      errors: { energyLower: "digit_group" },
    });
  });

  it("accepts equal bounds", () => {
    expect(parseTargetFields({ ...filled, energyUpper: "1800" }).ok).toBe(true);
  });

  it("names every empty field target_required", () => {
    expect(parseTargetFields(EMPTY_TARGET_FIELDS)).toEqual({
      ok: false,
      errors: {
        energyLower: "target_required",
        energyUpper: "target_required",
        proteinLower: "target_required",
        proteinUpper: "target_required",
      },
    });
  });

  it("puts lower above upper on the upper field, zero on its own field, and a bad number as invalid", () => {
    expect(parseTargetFields({ ...filled, energyLower: "2500" })).toEqual({
      ok: false,
      errors: { energyUpper: "target_lower_above_upper" },
    });
    expect(parseTargetFields({ ...filled, proteinLower: "0" })).toEqual({
      ok: false,
      errors: { proteinLower: "target_not_positive" },
    });
    expect(parseTargetFields({ ...filled, energyLower: "1800,25" })).toEqual({
      ok: false,
      errors: { energyLower: "target_value_invalid" },
    });
    expect(parseTargetFields({ ...filled, energyUpper: "100000" })).toEqual({
      ok: false,
      errors: { energyUpper: "target_value_invalid" },
    });
    expect(parseTargetFields({ ...filled, proteinUpper: "-1" })).toEqual({
      ok: false,
      errors: { proteinUpper: "target_value_invalid" },
    });
  });

  it("finds the first field with an error in screen order", () => {
    expect(firstInvalidField({ proteinUpper: "target_required", energyUpper: "target_required" })).toBe("energyUpper");
    expect(firstInvalidField({})).toBeUndefined();
  });
});
