import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { differsInCaseOnly, isAllCapitals, sentenceCase } from "../nameCase.js";

// The case rule for Fineli names. Release 18 writes names in sentence case,
// and its own spelling is the target: "Maito, rasvaton, d-vitamiinia 1 ug",
// "(arc) margariini 40%, lätta", "4-grain flakes". Every expected value here
// is written out, so none depends on the machine's locale.

describe("isAllCapitals", () => {
  it.each([
    ["KANANMUNA, KEITETTY", true],
    ["(ARC) MARGARIINI 40%, LÄTTA", true],
    ["1 % MAITO", true],
    ["Kananmuna, keitetty", false],
    ["Sokeri, VL", false],
    ["(ARC) Maito, kutunmaito", false],
    ["100 %", false],
    ["", false],
    ["WEIßWURST", true],
    ["D-VITAMIINIA 1 µG", true],
  ])("%p is %p", (name, expected) => {
    expect(isAllCapitals(name)).toBe(expected);
  });
});

describe("sentenceCase", () => {
  it.each([
    ["KANANMUNA, KEITETTY", "Kananmuna, keitetty"],
    ["MAITO, RASVATON, D-VITAMIINIA 1 UG", "Maito, rasvaton, d-vitamiinia 1 ug"],
    ["RAHKA, MAITORAHKA, MAUSTAMATON, RASVAA <0,5 %", "Rahka, maitorahka, maustamaton, rasvaa <0,5 %"],
    ["(ARC) MARGARIINI 40%, LÄTTA", "(arc) margariini 40%, lätta"],
    ["(ARC)TÄYSMEHU, C-VITAMIINIA, KESKIARVO", "(arc)täysmehu, c-vitamiinia, keskiarvo"],
    ["1 % MAITO", "1 % maito"],
    ["ÄIDINMAITO, RINTAMAITO", "Äidinmaito, rintamaito"],
    ["JÄÄTELÖ, KERMAJÄÄTELÖ, ÅLAND", "Jäätelö, kermajäätelö, åland"],
    ["ÖLJY, RYPSIÖLJY", "Öljy, rypsiöljy"],
    // Turkish casing would give "kıısselı": a dotless ı for every I.
    ["KIISSELI, MUSTIKKA", "Kiisseli, mustikka"],
  ])("writes the Finnish %p as %p", (name, expected) => {
    expect(sentenceCase(name, "fi")).toBe(expected);
  });

  it.each([
    ["EGG, BOILED", "Egg, boiled"],
    ["4-GRAIN FLAKES", "4-grain flakes"],
    ["MILK, 0% FAT, 1 UG ADDED VITAMIN D", "Milk, 0% fat, 1 ug added vitamin d"],
    ["TURKEY, WEIßWURST STYLE", "Turkey, weißwurst style"],
    ["MILK, 1 µG VITAMIN D", "Milk, 1 µg vitamin d"],
    // Outside Turkish casing, a dotted capital İ lowers to i and a combining dot.
    ["CHEESE, İSKENDER", "Cheese, i̇skender"],
    ["İSKENDER KEBAB", "İskender kebab"],
    ["ICE CREAM", "Ice cream"],
  ])("writes the English %p as %p", (name, expected) => {
    expect(sentenceCase(name, "en")).toBe(expected);
  });

  it.each(["Kananmuna, keitetty", "Sokeri, VL", "(ARC) Maito, kutunmaito", "100 %", "", "pH-SÄÄDETTY"])(
    "keeps %p exactly as written, because it is not all capitals",
    (name) => {
      expect(sentenceCase(name, "fi")).toBe(name);
    },
  );

  describe("never uses the machine's locale", () => {
    afterEach(() => {
      jest.restoreAllMocks();
    });

    it("names a locale on every case mapping", () => {
      const lower = jest.spyOn(String.prototype, "toLocaleLowerCase");
      const upper = jest.spyOn(String.prototype, "toLocaleUpperCase");
      sentenceCase("KIISSELI, MUSTIKKA", "fi");
      sentenceCase("ICE CREAM", "en");
      differsInCaseOnly("ICE CREAM", "Ice cream", "en");
      const calls = [...lower.mock.calls, ...upper.mock.calls];
      expect(calls.length).toBeGreaterThan(0);
      for (const args of calls) expect(["fi", "en"]).toContain(args[0]);
    });
  });
});

describe("differsInCaseOnly", () => {
  it.each([
    ["KANANMUNA, KEITETTY", "Kananmuna, keitetty", true],
    ["JÄÄTELÖ", "Jäätelö", true],
    ["Kananmuna", "Kananmuna", false],
    ["KAURAHIUTALE", "Kaurahiutale, täysjyvä", false],
    ["Jaatelo", "Jäätelö", false],
  ])("%p and %p: %p", (a, b, expected) => {
    expect(differsInCaseOnly(a, b, "fi")).toBe(expected);
  });
});
