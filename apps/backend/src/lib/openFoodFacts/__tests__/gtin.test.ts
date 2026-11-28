import { checkDigitOf, isWellFormedBarcode } from "@hovimestari/types";
import { describe, expect, it } from "@jest/globals";
import { hasValidCheckDigit, isInStore, readingsOf, sentFormOf, storedFormOf, upcEOf } from "../gtin.js";

// Section numbers are those of the GS1 General Specifications, Release 26.0.
// The check digit and UPC-E expansion are tested where they live, in
// packages/types. This file tests the readings built on them and `upcEOf`.

const gtins = (code: string, format?: "ean_8" | "upc_e") => readingsOf(code, format).map((r) => r.gtin);

describe("check digits", () => {
  it("reads 8, 12, 13 and 14 digits with a right check digit, and nothing with a wrong one", () => {
    expect(gtins("96385074")).toEqual(["00000096385074"]);
    expect(gtins("012000161155")).toEqual(["00012000161155"]);
    expect(gtins("6408430000258")).toEqual(["06408430000258"]);
    expect(gtins("06408430000258")).toEqual(["06408430000258"]);
    for (const wrong of ["96385075", "012000161156", "6408430000259", "06408430000259"]) {
      expect(readingsOf(wrong)).toEqual([]);
    }
  });

  it.each(["123456789", "1234567890", "12345678905"])("reads %s, a length no barcode has, as nothing", (code) => {
    expect(readingsOf(code)).toEqual([]);
  });

  it("gives one product's 12-digit and 13-digit forms one 14-digit form", () => {
    expect(gtins("012000161155")).toEqual(gtins("0012000161155"));
    expect(gtins("00012000161155")).toEqual(gtins("012000161155"));
  });
});

describe("UPC-E readings and upcEOf", () => {
  // The four zero-suppression examples of 5.2.2.4.1, Figures 5-15 to 5-18,
  // one per branch of Table 5-7 (the last encoded digit 0 to 2, 3, 4, 5 to 9).
  it.each([
    ["03456703", "034000005673", "last digit 0 to 2, Figure 5-17"],
    ["09847531", "098400000751", "last digit 3, Figure 5-18"],
    ["04567840", "045670000080", "last digit 4, Figure 5-16"],
    ["01234558", "012345000058", "last digit 5 to 9, Figure 5-15"],
  ])("reads %s as %s (%s), and suppresses it back", (upcE, gtin12) => {
    expect(upcEOf(gtin12.padStart(14, "0"))).toBe(upcE);
    expect(gtins(upcE)[0]).toBe(gtin12.padStart(14, "0"));
  });

  it("has no UPC-E for a GTIN-12 without the zeros", () => {
    expect(upcEOf("00012000161155")).toBeNull();
    expect(upcEOf("06408430000258")).toBeNull();
  });
});

describe("an 8-digit code valid two ways", () => {
  // 02345055 is a valid UPC-E (expanding to 023450000055) and a valid EAN-8.
  // An EAN-8 starting with 0 is an RCN-8 (Table 1-5, 2.1.11.1).
  const both = "02345055";

  it("typed, reads as the UPC-E first, then as the EAN-8, which is the shop's own", () => {
    expect(readingsOf(both)).toEqual([
      { gtin: "00023450000055", inStore: false },
      { gtin: "00000002345055", inStore: true },
    ]);
  });

  it("scanned, reads only as the format the decoder reported", () => {
    expect(readingsOf(both, "upc_e")).toEqual([{ gtin: "00023450000055", inStore: false }]);
    expect(readingsOf(both, "ean_8")).toEqual([{ gtin: "00000002345055", inStore: true }]);
  });

  it("starting with 1, typed, reads only as an EAN-8, since a UPC-E starts with 0", () => {
    // 12345052 is a valid EAN-8, a GTIN-8 from GS1-8 Prefix 123 (Table 1-5),
    // and a valid UPC-E with the leading digit 1, which decoders still report.
    expect(gtins("12345052")).toEqual(["00000012345052"]);
    expect(gtins("12345052", "upc_e")).toEqual(["00123450000052"]);
  });

  it("answers nothing when the format disagrees with an 8-digit code", () => {
    expect(readingsOf("01234559", "upc_e")).toEqual([]);
    expect(readingsOf("96385075", "ean_8")).toEqual([]);
  });

  it("ignores the format for 12 to 14 digits, where only one reading exists", () => {
    // A decoder may report upc_e with the expanded 12 digits, or pass any format through.
    for (const format of ["ean_8", "upc_e"] as const) {
      expect(gtins("012345000058", format)).toEqual(["00012345000058"]);
      expect(gtins("6408430000258", format)).toEqual(["06408430000258"]);
      expect(gtins("06408430000258", format)).toEqual(["06408430000258"]);
      expect(readingsOf("6408430000259", format)).toEqual([]);
    }
  });
});

describe("a shop's own numbers", () => {
  const inStore = (code: string) => readingsOf(code).every((r) => r.inStore) && readingsOf(code).length > 0;

  it.each([
    ["00000000", "an RCN-8 with prefix 0"],
    ["200000000004", "a UPC-A starting 2, U.P.C. Prefix 2 (Table 1-6)"],
    ["400000000008", "a UPC-A starting 4, U.P.C. Prefix 4 (Table 1-6)"],
    ["0200000000004", "13 digits starting 02 (Table 1-4)"],
    ["0400000000008", "13 digits starting 04 (Table 1-4)"],
    ["2000000000008", "13 digits starting 20 (Table 1-4, 2.1.11.4)"],
    ["2912345000004", "13 digits starting 29, as a Finnish shop prints a weighed item"],
    ["001000000052", "a UPC-A in U.P.C. Company Prefix 001000, company internal (2.1.11.3)"],
    ["007999000097", "the top of that range, 007999"],
    ["000000000000", "U.P.C. Company Prefix 000000 (Table 1-6, 2.1.11.3)"],
  ])("%s, %s, is the shop's own", (code) => {
    expect(hasValidCheckDigit(code)).toBe(true);
    expect(inStore(code)).toBe(true);
  });

  it.each([
    ["02000000000008", "0 and a 13-digit 20..."],
    ["00200000000004", "00 and a 12-digit 2..."],
    ["00400000000008", "00 and a 12-digit 4..."],
  ])("%s, %s typed as 14 digits, is still the shop's own", (code) => {
    expect(hasValidCheckDigit(code)).toBe(true);
    expect(inStore(code)).toBe(true);
  });

  it("knows a UPC-A that pads to 0000000 for what Table 1-6 says it is", () => {
    // A UPC-A starting with five zeros pads to 0000000, the RCN-8 marker. Table
    // 1-6 gives U.P.C. Prefix 000000 to restricted numbers and leaves 00000x
    // unused to avoid collision with GTIN-8, so it is never a product.
    expect(isInStore("00000001234565")).toBe(true);
    expect(isInStore("00000000000000")).toBe(true);
  });

  it.each([
    ["6408430000258", "a Finnish product"],
    ["012000161155", "a UPC-A from U.P.C. Company Prefix 012000"],
    ["96385074", "a GTIN-8"],
    ["12345052", "a GTIN-8 from GS1-8 Prefix 123"],
    ["008000000006", "a UPC-A just past the company internal range"],
    // RCN-8 Prefix 2 (Table 1-5, 2.1.11.1) is a company's number for a fixed
    // item. Eight digits hold no weight or price, so it is looked up.
    ["20000004", "an RCN-8 with prefix 2 (GS1 2.1.11.1)"],
    ["29999996", "the top of RCN-8 prefix 2 (GS1 2.1.11.1)"],
    ["00000020000004", "an RCN-8 with prefix 2 typed as 14 digits (GS1 2.1.11.1)"],
  ])("%s, %s, is sent", (code) => {
    expect(hasValidCheckDigit(code)).toBe(true);
    expect(readingsOf(code).some((r) => !r.inStore)).toBe(true);
  });
});

describe("Lidl's own 8-digit codes, RCN-8 prefix 2", () => {
  it.each(["20064020", "20423827", "20003463", "20004132", "20043155"])(
    "%s reads as one EAN-8 that is looked up, scanned or typed",
    (code) => {
      const reading = [{ gtin: code.padStart(14, "0"), inStore: false }];
      expect(readingsOf(code, "ean_8")).toEqual(reading);
      expect(readingsOf(code)).toEqual(reading);
    },
  );

  it("reads the milk typed in full as 14 digits the same way", () => {
    expect(readingsOf("00000020064020")).toEqual([{ gtin: "00000020064020", inStore: false }]);
  });

  it.each([
    ["2372941600006", "a mince weighed in the shop, GS1 Prefix 23 (2.1.11.4)"],
    ["2007403600002", "a mince packed in the shop, GS1 Prefix 20 (2.1.11.4)"],
  ])("leaves %s, %s, the shop's own", (code) => {
    expect(readingsOf(code)).toEqual([{ gtin: `0${code}`, inStore: true }]);
  });

  it("leaves 00000000, RCN-8 prefix 0, the shop's own, read either way", () => {
    const readings = readingsOf("00000000");
    expect(readings.length).toBeGreaterThan(0);
    expect(readings.every((r) => r.gtin === "00000000000000" && r.inStore)).toBe(true);
  });

  it("leaves the EAN-8 reading of 02345055, RCN-8 prefix 0, the shop's own", () => {
    expect(readingsOf("02345055", "ean_8")).toEqual([{ gtin: "00000002345055", inStore: true }]);
  });

  it("leaves a UPC-E that expands into U.P.C. Prefix 00002 the shop's own, typed or scanned", () => {
    // 00002059 expands to 000020000059, whose 14-digit form is the RCN-8
    // 20000059's. Table 1-6 leaves that UPC-A range unused, so the UPC-E
    // reading must not open a Lidl product. Typed, its EAN-8 reading is RCN-8 prefix 0.
    expect(readingsOf("00002059", "upc_e")).toEqual([{ gtin: "00000020000059", inStore: true }]);
    expect(readingsOf("00002059")).toEqual([
      { gtin: "00000020000059", inStore: true },
      { gtin: "00000000002059", inStore: true },
    ]);
  });
});

describe("a 14-digit code with an indicator digit", () => {
  // 2.1.7.2, Table 2-17: indicators 1 to 8 make GTIN-14s for groupings of a
  // trade item, cases and packs. Indicator 9 is reserved for variable measure
  // trade items (2.1.10). Neither is a consumer unit Open Food Facts lists.
  it.each(["16408430000255", "26408430000252", "86408430000254"])("reads %s, a case or a pack, as nothing", (code) => {
    expect(hasValidCheckDigit(code)).toBe(true);
    expect(readingsOf(code)).toEqual([]);
  });

  it("reads indicator 9, a variable measure item, as the shop's own", () => {
    expect(hasValidCheckDigit("96408430000251")).toBe(true);
    expect(readingsOf("96408430000251")).toEqual([{ gtin: "96408430000251", inStore: true }]);
    expect(isInStore("96408430000251")).toBe(true);
  });

  it("still reads a wrong check digit as nothing", () => {
    expect(readingsOf("96408430000252")).toEqual([]);
  });
});

describe("every code with a reading", () => {
  // The lookup answers wrong_digits before it reads a code, so a code with a
  // reading must never fail isWellFormedBarcode. A fixed-seed generator makes
  // the same codes on every run.
  let seed = 20261126;
  const digits = (n: number) => {
    let out = "";
    for (let i = 0; i < n; i++) {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      out += String(Math.floor(seed / 65536) % 10);
    }
    return out;
  };
  const PER_LENGTH = 3000;

  it.each([12, 13, 14])("is well formed at %i digits, built with a right check digit", (length) => {
    let read = 0;
    for (let i = 0; i < PER_LENGTH; i++) {
      // A leading zero now and then reaches the shorter forms and the shop's own ranges.
      const data = (i % 4 === 0 ? "0" : "") + digits(length - 1);
      const code = data.slice(0, length - 1) + checkDigitOf(data.slice(0, length - 1));
      if (readingsOf(code).length === 0) continue;
      read++;
      expect([code, isWellFormedBarcode(code)]).toEqual([code, true]);
    }
    expect(read).toBeGreaterThan(PER_LENGTH / 5);
  });

  it("is well formed at 8 digits, under every format, with each last digit", () => {
    // Every last digit, so both the EAN-8 and the UPC-E check digits are among them.
    let read = 0;
    for (let i = 0; i < PER_LENGTH; i++) {
      const data = (i % 2 === 0 ? "0" : "") + digits(7);
      for (let last = 0; last < 10; last++) {
        const code = data.slice(0, 7) + last;
        for (const format of [undefined, "ean_8", "upc_e"] as const) {
          if (readingsOf(code, format).length === 0) continue;
          read++;
          expect([code, isWellFormedBarcode(code)]).toEqual([code, true]);
        }
      }
    }
    expect(read).toBeGreaterThan(PER_LENGTH);
  });
});

describe("storedFormOf", () => {
  it("keeps a GTIN-8 as its 8 digits and every other product as 13", () => {
    expect(storedFormOf("00000096385074")).toBe("96385074");
    expect(storedFormOf("00000012345052")).toBe("12345052");
    expect(storedFormOf("00012000161155")).toBe("0012000161155");
    expect(storedFormOf("00012345000058")).toBe("0012345000058");
    expect(storedFormOf("06408430000258")).toBe("6408430000258");
  });
});

describe("sentFormOf", () => {
  it("drops the one leading zero of a 14-digit form, as Open Food Facts answers a UPC-A", () => {
    expect(sentFormOf("00012000161155")).toBe("0012000161155");
    expect(sentFormOf("06408430000258")).toBe("6408430000258");
  });
});
