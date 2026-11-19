import { BarcodeSchema } from "@hovimestari/types";
import { barcodeOf, openFoodFactsUrl, sameBarcode } from "../barcode";

describe("barcodeOf", () => {
  it.each([
    ["1234567", null],
    ["12345670", "12345670"],
    ["64084300002580", "64084300002580"],
    ["640843000025801", null],
    ["6408430000258", "6408430000258"],
    ["6408 4300 00258", "6408430000258"],
    [" 6408430000258 ", "6408430000258"],
    ["640843000025a", null],
    ["Valio 6408430000258", null],
    ["", null],
  ])("reads %j as %j", (text, code) => {
    expect(barcodeOf(text)).toBe(code);
  });

  it.each(["6408430000258", "6408\t4300\n00258", "12345670", "1234567", "640843000025801", "６４０８４３０００"])(
    "agrees with the server's schema on %j",
    (text) => {
      const parsed = BarcodeSchema.safeParse(text);
      expect(barcodeOf(text)).toBe(parsed.success ? parsed.data : null);
    },
  );
});

describe("sameBarcode", () => {
  it("reads the 12 and 13-digit forms of one product as one", () => {
    expect(sameBarcode("012000161155", "0012000161155")).toBe(true);
    expect(sameBarcode("6408430000258", "06408430000258")).toBe(true);
  });

  it("tells two products apart", () => {
    expect(sameBarcode("6408430000258", "6408430000265")).toBe(false);
  });
});

describe("openFoodFactsUrl", () => {
  it("is the product's page at Open Food Facts", () => {
    expect(openFoodFactsUrl("6408430000258")).toBe("https://world.openfoodfacts.org/product/6408430000258");
  });
});
