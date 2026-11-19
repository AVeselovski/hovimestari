import { describe, expect, it } from "@jest/globals";
import { BarcodeLookupBodySchema, BarcodeLookupSchema, macroSumWithinLimit } from "../index.js";

function firstMessage(result: { success: boolean; error?: { issues: { message: string }[] } }): string | undefined {
  return result.success ? undefined : result.error?.issues[0]?.message;
}

describe("BarcodeLookupBodySchema", () => {
  it("takes a barcode with its spaces removed, and no format", () => {
    expect(BarcodeLookupBodySchema.parse({ barcode: " 6408430 000258 " })).toEqual({ barcode: "6408430000258" });
  });

  it.each(["ean_8", "upc_e"])("takes the format %p a scan sends", (format) => {
    expect(BarcodeLookupBodySchema.parse({ barcode: "12345670", format })).toEqual({ barcode: "12345670", format });
  });

  it.each([
    [{}, "barcode_invalid"],
    [{ barcode: 6408430000258 }, "barcode_invalid"],
    [{ barcode: "1234567" }, "barcode_invalid"],
    [{ barcode: "123456789012345" }, "barcode_invalid"],
    [{ barcode: "64084300002x8" }, "barcode_invalid"],
    [{ barcode: "12345670", format: "ean_13" }, "barcode_invalid"],
  ])("refuses %j with %p", (input, code) => {
    expect(firstMessage(BarcodeLookupBodySchema.safeParse(input))).toBe(code);
  });
});

describe("BarcodeLookupSchema", () => {
  it("reads each kind of answer", () => {
    for (const answer of [
      { result: "not_found", barcode: "6400000000017" },
      { result: "in_store", barcode: "2000000000008" },
      {
        result: "incomplete",
        barcode: "6408430000258",
        reason: "missing_values",
        product: { name: null, per100g: { energyKcal: 39, proteinG: null, carbsG: 3.1, fatG: 1.5 } },
      },
    ]) {
      expect(BarcodeLookupSchema.parse(answer)).toEqual(answer);
    }
  });
});

describe("macroSumWithinLimit", () => {
  it("passes 101.5 g and refuses one thousandth more", () => {
    expect(macroSumWithinLimit({ proteinG: 33.5, carbsG: 33.5, fatG: 34.5 })).toBe(true);
    expect(macroSumWithinLimit({ proteinG: 30.1, carbsG: 34.2, fatG: 37.2 })).toBe(true);
    expect(macroSumWithinLimit({ proteinG: 33.5, carbsG: 33.5, fatG: 34.501 })).toBe(false);
  });
});
