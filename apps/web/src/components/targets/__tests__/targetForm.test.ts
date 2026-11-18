import { formatTarget } from "@/lib/targetFormat";
import { EMPTY_TARGET_FIELDS, fieldsOf, firstInvalidField, parseTargetFields } from "../targetForm";

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

describe("fieldsOf", () => {
  const withDecimals = {
    effectiveFrom: "2026-11-01",
    ranges: { energyKcal: { lower: 1800, upper: 2200.5 }, proteinG: { lower: 142.5, upper: 160 } },
    updatedAt: "2026-11-01T08:00:00.000Z",
  };

  it("is every field empty with no change", () => {
    expect(fieldsOf(null)).toEqual(EMPTY_TARGET_FIELDS);
  });

  it("holds the change's numbers as Settings shows them, and they read back as the same numbers", () => {
    const fields = fieldsOf(withDecimals);
    // In this machine's language, as Settings formats them: never the machine's locale assumed.
    expect(fields).toEqual({
      energyLower: formatTarget(1800),
      energyUpper: formatTarget(2200.5),
      proteinLower: formatTarget(142.5),
      proteinUpper: formatTarget(160),
    });
    expect(parseTargetFields(fields)).toEqual({ ok: true, body: { ranges: withDecimals.ranges } });
  });

  it("reads back in a language with a decimal comma", () => {
    // What a Finnish phone puts in the fields, read back by the same parser.
    const fields = {
      energyLower: formatTarget(1800, "fi"),
      energyUpper: formatTarget(2200.5, "fi"),
      proteinLower: formatTarget(142.5, "fi"),
      proteinUpper: formatTarget(160, "fi"),
    };
    expect(fields.proteinLower).toBe("142,5");
    expect(parseTargetFields(fields)).toEqual({ ok: true, body: { ranges: withDecimals.ranges } });
  });
});
