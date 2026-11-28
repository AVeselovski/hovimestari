import { checkDigitOf, expandUpcE, hasValidCheckDigit, type BarcodeFormat } from "@hovimestari/types";

// Which numbers are sent to Open Food Facts. Every rule here is read from the
// GS1 General Specifications, Release 26.0 (ratified January 2026), fetched
// from https://ref.gs1.org/standards/genspecs/ on 2026-11-18:
//
// - Check digit: section 7.9, the mod 10 with weights 3, 1, 3, ... from the right.
// - UPC-E: section 5.2.2.4. The leading digit is always 0 (5.2.2.4.1, "D1 SHALL
//   always be zero"). Decoding is Table 5-7 in 5.2.2.4.2, and the check digit is
//   computed over the expanded GTIN-12 (section 7.10, test 2).
// - Restricted Circulation Numbers, the shop's own numbers: 1.2.2.2.1, Table 1-4
//   (GS1 Prefix ranges), Table 1-5 (GS1-8 Prefixes), Table 1-6 (U.P.C. Prefixes),
//   2.1.11.1 (RCN-8 Prefix 0 or 2), 2.1.11.3 (U.P.C. Company Prefixes 000000 and
//   001000 to 007999 for company internal numbering), 2.1.11.4 and 2.1.12 (GS1
//   Prefixes 02 and 20 to 29).
// - GTIN-14 indicator digits: 2.1.7.2, Table 2-17 (indicators 1 to 8 identify
//   groupings of a trade item, cases and packs) and 2.1.10 (indicator 9 is
//   reserved for variable measure trade items).
//
// The in-store rule is read on the 14-digit form. A UPC-A, or an expanded
// UPC-E, that starts `00000` pads to `0000000`, and one that starts `00002`
// pads to `0000002`. Table 1-6 gives U.P.C. Prefix 000000 to restricted
// numbers and marks 0000001 to 0000099 "unused to avoid collision with
// GTIN-8". So a 14-digit form that starts `0000000` or `0000002` is never a
// product's GTIN-12.
//
// An EAN-8 with RCN-8 Prefix 2 (2.1.11.1) is a company's own number for a
// fixed item: eight digits leave no room for a weight or a price, which GS1
// carries in 13-digit numbers. Lidl prints these on its own products, and
// Open Food Facts holds most of them, so they are looked up like a GTIN-8.
// Their 14-digit form starts `0000002`, and a code typed as 12, 13 or 14
// digits with that form is the same code. The UPC-E readings that expand
// into `0000002` stay the shop's own (`upcEReading`): that range is unused
// for UPC-A, and sending it would let an unrelated number open a Lidl product.
//
// RCN-8 Prefix 0 stays the shop's own. Its 14-digit form, `0000000`, is the
// same as a UPC-A's from U.P.C. Prefix 000000, a company's internal number,
// and the rule reads only the 14-digit form, so the two cannot be told apart.

// The check digit and UPC-E helpers live in @hovimestari/types, so the phone
// and the server read digits one way. They are re-exported here for the
// lookup's own imports.
export { checkDigitOf, expandUpcE, hasValidCheckDigit };

/**
 * The 14-digit form of RCN-8 Prefix 2, and of a UPC-A from U.P.C. Prefix
 * 00002. One rule in two halves: `isInStore` looks it up, as a Lidl EAN-8,
 * and `upcEReading` keeps a UPC-E that expands into it the shop's own.
 */
const RCN8_PREFIX_2_FORM = "0000002";

/**
 * The UPC-E that zero-suppresses the GTIN-12 inside `gtin14`, by the four
 * rules of 5.2.2.4.1, or null when it has none. Used to find an own food
 * saved under the 8-digit form of a product looked up by its 12 digits.
 *
 * It answers the canonical UPC-E only. `expandUpcE` also expands encodings
 * GS1 never issues, and this does not give those back: X6 = 3 with X3 at
 * most 2, X6 = 4 with X4 = 0, and X6 of 5 to 9 with X5 = 0. An own food
 * saved under one of them is found by those 8 digits, not by its 12.
 */
export function upcEOf(gtin14: string): string | null {
  if (!/^000[0-9]{11}$/.test(gtin14)) return null;
  const d = ` ${gtin14.slice(2)}`; // 1-based, d[1] to d[12]
  const zeros = (from: number, to: number) => d.slice(from, to + 1) === "0".repeat(to - from + 1);
  let x: string | null = null;
  if (d[11] >= "5" && zeros(7, 10) && d[6] !== "0") x = `${d[2]}${d[3]}${d[4]}${d[5]}${d[6]}${d[11]}`;
  else if (zeros(6, 10) && d[5] !== "0") x = `${d[2]}${d[3]}${d[4]}${d[5]}${d[11]}4`;
  else if (d[4] <= "2" && zeros(5, 8)) x = `${d[2]}${d[3]}${d[9]}${d[10]}${d[11]}${d[4]}`;
  else if (d[4] >= "3" && zeros(5, 9)) x = `${d[2]}${d[3]}${d[4]}${d[10]}${d[11]}3`;
  return x === null ? null : `0${x}${d[12]}`;
}

/**
 * Whether a 14-digit form is a Restricted Circulation Number, a shop's or a
 * company's own number, or an unused range. Never a product's GTIN.
 */
export function isInStore(gtin14: string): boolean {
  // Indicator digit 9: a variable measure trade item (2.1.10), a weighed item.
  if (gtin14.startsWith("9")) return true;
  // RCN-8 Prefix 0 (Table 1-5, 2.1.11.1), U.P.C. Prefix 000000 (Table 1-6).
  // RCN-8 Prefix 2, `RCN8_PREFIX_2_FORM`, is looked up, as the header says,
  // except through a UPC-E: see `upcEReading`.
  if (gtin14.startsWith("0000000")) return true;
  // U.P.C. Company Prefixes 001000 to 007999, company internal numbering (2.1.11.3).
  const upcCompany = gtin14.slice(2, 8);
  if (gtin14.startsWith("00") && upcCompany >= "001000" && upcCompany <= "007999") return true;
  // U.P.C. Prefixes 2 and 4, GS1 Prefixes 02 and 04 (Tables 1-4 and 1-6).
  if (gtin14.startsWith("002") || gtin14.startsWith("004")) return true;
  // GS1 Prefixes 20 to 29 (Table 1-4, 2.1.11.4): weighed and priced items.
  return gtin14.startsWith("02");
}

/** One way to read a code: its 14-digit form, and whether that is a shop's own number. */
export interface Reading {
  gtin: string;
  inStore: boolean;
}

const readingOf = (digits: string): Reading => {
  const gtin = digits.padStart(14, "0");
  return { gtin, inStore: isInStore(gtin) };
};

/**
 * The UPC-E reading of an 8-digit code, or null. `leading` lists the leading
 * digits allowed. An expansion into `0000002`, U.P.C. Prefix 00002, is the
 * shop's own: Table 1-6 leaves it unused, and its 14-digit form is an RCN-8's.
 */
function upcEReading(code: string, leading: string): Reading | null {
  if (!leading.includes(code[0])) return null;
  const gtin12 = expandUpcE(code);
  if (gtin12 === null) return null;
  const reading = readingOf(gtin12);
  // The other half of `isInStore`'s rule for `RCN8_PREFIX_2_FORM`, which it looks up.
  return reading.gtin.startsWith(RCN8_PREFIX_2_FORM) ? { ...reading, inStore: true } : reading;
}

const ean8Reading = (code: string): Reading | null => (hasValidCheckDigit(code) ? readingOf(code) : null);

/**
 * The ways `code` (8 to 14 digits) can be read, in the order a lookup tries
 * them. None: a wrong check digit, a length no barcode has (9 to 11 digits),
 * a GTIN-14 with indicator 1 to 8, which is a case or a pack and never a
 * consumer unit (2.1.7.2, Table 2-17), or an 8-digit code its format
 * disagrees with.
 *
 * An 8-digit code can be a valid EAN-8 and a valid UPC-E at once. A scan's
 * `format` decides. `format` settles only that case: at 12 to 14 digits a
 * code has one reading, and `format` is ignored. A typed code is read as a UPC-E first, when it starts
 * with 0 as GS1 requires, then as an EAN-8. A decoder may report a UPC-E
 * with the leading digit 1, which older specifications allowed, so a scan's
 * `upc_e` takes 0 or 1.
 */
export function readingsOf(code: string, format?: BarcodeFormat): Reading[] {
  if (!/^[0-9]{8,14}$/.test(code)) return [];
  if (code.length === 8) {
    const readings =
      format === "upc_e"
        ? [upcEReading(code, "01")]
        : format === "ean_8"
          ? [ean8Reading(code)]
          : [upcEReading(code, "0"), ean8Reading(code)];
    return readings.filter((r): r is Reading => r !== null);
  }
  if (code.length < 12 || !hasValidCheckDigit(code)) return [];
  const reading = readingOf(code);
  return /^[1-8]/.test(reading.gtin) ? [] : [reading];
}

/**
 * The form a kept product's barcode is stored in: a GTIN-8 as its 8 digits,
 * any other as its 13-digit form. A 14-digit form starting with six zeros
 * that is not a shop's own number is a GTIN-8, because Table 1-6 leaves GS1
 * Prefixes 0000001 to 0000099 unused to avoid collision with GTIN-8. The
 * unique index pads every form to 14 digits, so each is found by any form.
 */
export const storedFormOf = (gtin14: string): string =>
  gtin14.startsWith("000000") ? gtin14.slice(6) : sentFormOf(gtin14);

/** The form a 14-digit GTIN is sent in: less its leading zero when it has one, as Open Food Facts answers. */
export const sentFormOf = (gtin14: string): string => (gtin14.startsWith("0") ? gtin14.slice(1) : gtin14);
