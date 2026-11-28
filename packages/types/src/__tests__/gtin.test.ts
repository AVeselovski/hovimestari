import { describe, expect, it } from "@jest/globals";
import { checkDigitOf, expandUpcE, hasValidCheckDigit, isWellFormedBarcode, sameBarcode } from "../index.js";

// Section numbers are those of the GS1 General Specifications, Release 26.0.

describe("check digits (section 7.9)", () => {
  it.each([
    ["6408430000258", true],
    ["6408430000259", false],
    ["012000161155", true],
    ["012000161156", false],
    ["0012000161155", true],
    ["00012000161155", true],
    ["96385074", true],
    ["96385075", false],
  ])("%s has a right check digit: %p", (code, valid) => {
    expect(hasValidCheckDigit(code)).toBe(valid);
  });

  it("computes the digit from the digits before it", () => {
    expect(checkDigitOf("640843000025")).toBe("8");
    expect(checkDigitOf("9638507")).toBe("4");
  });
});

describe("UPC-E expansion (Table 5-7)", () => {
  // The four zero-suppression examples of 5.2.2.4.1, Figures 5-15 to 5-18,
  // one per branch of Table 5-7 (the last encoded digit 0 to 2, 3, 4, 5 to 9),
  // and the other ends of the two branches that take more than one digit.
  it.each([
    ["03456703", "034000005673", "last digit 0 to 2, Figure 5-17"],
    ["01234514", "012100003454", "last digit 0 to 2, here 1"],
    ["01234523", "012200003453", "last digit 0 to 2, here 2"],
    ["09847531", "098400000751", "last digit 3, Figure 5-18"],
    ["04567840", "045670000080", "last digit 4, Figure 5-16"],
    ["01234558", "012345000058", "last digit 5 to 9, Figure 5-15"],
    ["01234596", "012345000096", "last digit 5 to 9, here 9"],
  ])("expands %s to %s (%s)", (upcE, gtin12) => {
    expect(expandUpcE(upcE)).toBe(gtin12);
  });

  it("refuses a UPC-E whose check digit is wrong for its expansion", () => {
    expect(expandUpcE("01234559")).toBeNull();
  });
});

describe("isWellFormedBarcode", () => {
  it.each([
    ["20064020", "Lidl's milk, an RCN-8 with prefix 2"],
    ["20423827", "Lidl's rahka"],
    ["20003463", "Lidl's spaghetti"],
    ["20004132", "Lidl's chopped tomatoes"],
    ["20043155", "Lidl's eggs"],
    ["2372941600006", "a mince weighed in the shop, prefix 23"],
    ["2007403600002", "a mince packed in the shop, prefix 20"],
    ["6416710030208", "an olive oil"],
    ["04567006", "a leading-0 code valid only as a UPC-E"],
    ["14567003", "a leading-1 code valid only as a UPC-E"],
    ["16408430000255", "a 14-digit case code"],
  ])("takes %s, %s", (code) => {
    expect(isWellFormedBarcode(code)).toBe(true);
  });

  it("takes the UPC-E-only codes only through their expansion, not as EAN-8s", () => {
    expect(hasValidCheckDigit("04567006")).toBe(false);
    expect(hasValidCheckDigit("14567003")).toBe(false);
  });

  it.each([
    ["20064021", "Lidl's milk with the last digit wrong"],
    ["6416710030209", "the olive oil with the last digit wrong"],
    ["123456789", "9 digits"],
    ["1234567890", "10 digits"],
    ["12345678905", "11 digits"],
    ["24567006", "a leading-2 code, never a UPC-E, with a wrong EAN-8 digit"],
    ["1234567", "7 digits"],
    ["123456789012345", "15 digits"],
    ["6416 710030208", "a space"],
  ])("refuses %s, %s", (code) => {
    expect(isWellFormedBarcode(code)).toBe(false);
  });
});

describe("sameBarcode", () => {
  it.each<[string, string | null, string | null, boolean]>([
    ["the same code", "6416710030208", "6416710030208", true],
    ["its 14-digit form", "6416710030208", "06416710030208", true],
    ["a 12-digit code and its 13-digit form", "012000161155", "0012000161155", true],
    ["an 8-digit code and its 14-digit form", "20064020", "00000020064020", true],
    ["another code", "6416710030208", "6416710030209", false],
    ["no barcode and no barcode", null, null, true],
    ["no barcode and a code", null, "20064020", false],
    ["a code and no barcode", "20064020", null, false],
  ])("%s: %p", (_what, a, b, same) => {
    expect(sameBarcode(a, b)).toBe(same);
  });
});
