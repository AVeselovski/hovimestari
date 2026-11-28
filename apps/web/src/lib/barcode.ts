import { BarcodeSchema } from "@hovimestari/types";

// ---------------------------------------------------------------------------
// A barcode as the log sheet's search field reads it. Text of 8 to 14 digits,
// once its spaces are taken out, names no food, so the field treats it as a
// barcode. The field reads it with the server's own `BarcodeSchema`, so it
// never offers a lookup the server refuses. The server reads every form of
// one code (8, 12, 13 or 14 digits) as one product by padding it to 14
// digits, and the screen compares codes the same way.
// ---------------------------------------------------------------------------

/** The digits when `text`, its spaces removed, is 8 to 14 digits. Otherwise null. */
export function barcodeOf(text: string): string | null {
  const parsed = BarcodeSchema.safeParse(text);
  return parsed.success ? parsed.data : null;
}

/** True when two codes are one product: equal once both are padded to 14 digits. The server's own rule. */
export { sameBarcode } from "@hovimestari/types";

/** The product's own page at Open Food Facts. */
export function openFoodFactsUrl(code: string): `https://${string}` {
  return `https://world.openfoodfacts.org/product/${encodeURIComponent(code)}`;
}
