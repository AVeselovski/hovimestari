import { describe, expect, it } from "@jest/globals";
import { IsoDateSchema, SetTargetsBodySchema, TargetsQuerySchema, TimeZoneSchema } from "../index.js";

/** The first issue's message, which the backend turns into the response's code. */
function firstMessage(result: { success: boolean; error?: { issues: { message: string }[] } }): string | undefined {
  return result.success ? undefined : result.error?.issues[0]?.message;
}

const body = (energyKcal: unknown, proteinG: unknown = { lower: 100, upper: 150 }) => ({
  ranges: { energyKcal, proteinG },
});

describe("SetTargetsBodySchema", () => {
  it("accepts two ranges, and equal bounds", () => {
    expect(SetTargetsBodySchema.safeParse(body({ lower: 1800, upper: 2200 })).success).toBe(true);
    expect(SetTargetsBodySchema.safeParse(body({ lower: 2000, upper: 2000 })).success).toBe(true);
    expect(SetTargetsBodySchema.safeParse(body({ lower: 1800.5, upper: 99_999.9 })).success).toBe(true);
  });

  it("refuses a lower bound above the upper one, on the upper field", () => {
    const result = SetTargetsBodySchema.safeParse(body({ lower: 2200, upper: 1800 }));
    expect(firstMessage(result)).toBe("target_lower_above_upper");
    expect(result.error?.issues[0]?.path).toEqual(["ranges", "energyKcal", "upper"]);
  });

  it.each([0, -1])("refuses %p as not positive", (lower) => {
    expect(firstMessage(SetTargetsBodySchema.safeParse(body({ lower, upper: 2000 })))).toBe("target_not_positive");
  });

  it.each([1800.25, 100_000, "1800", null, 0.00000001, 1800.0000001])("refuses %p as an invalid value", (lower) => {
    expect(firstMessage(SetTargetsBodySchema.safeParse(body({ lower, upper: 100_000 })))).toBe("target_value_invalid");
  });

  it("refuses a protein bound above its own cap", () => {
    expect(
      firstMessage(SetTargetsBodySchema.safeParse(body({ lower: 1, upper: 2 }, { lower: 1, upper: 10_000 }))),
    ).toBe("target_value_invalid");
  });

  it("refuses a missing bound as required", () => {
    expect(firstMessage(SetTargetsBodySchema.safeParse(body({ upper: 2000 })))).toBe("target_required");
  });
});

describe("IsoDateSchema", () => {
  it.each(["2026-11-15", "2024-02-29"])("accepts %p", (d) => {
    expect(IsoDateSchema.safeParse(d).success).toBe(true);
  });

  it.each(["2026-02-30", "2026-1-01", "15.11.2026", "0000-01-01", ""])("refuses %p with invalid_date", (d) => {
    expect(firstMessage(IsoDateSchema.safeParse(d))).toBe("invalid_date");
  });

  it("makes the date optional in the targets query", () => {
    expect(TargetsQuerySchema.parse({})).toEqual({});
    expect(firstMessage(TargetsQuerySchema.safeParse({ date: "x" }))).toBe("invalid_date");
  });
});

describe("TimeZoneSchema", () => {
  it.each(["Europe/Helsinki", "America/New_York", "UTC"])("accepts %p", (zone) => {
    expect(TimeZoneSchema.safeParse(zone).success).toBe(true);
  });

  it("answers the canonical spelling of a zone", () => {
    expect(TimeZoneSchema.parse("europe/helsinki")).toBe("Europe/Helsinki");
  });

  it.each(["Mars/Olympus", "", "x".repeat(65), "+02:00", "-0500"])("refuses %p with invalid_time_zone", (zone) => {
    expect(firstMessage(TimeZoneSchema.safeParse(zone))).toBe("invalid_time_zone");
  });
});
