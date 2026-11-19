import type { BarcodeFormat } from "@hovimestari/types";

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
// The in-store rule is read on the 14-digit form. That is safe for the
// overlap the 8-digit rule could have with a padded UPC-A: a UPC-A, or an
// expanded UPC-E, that starts with five zeros pads to `0000000`, and Table 1-6
// gives U.P.C. Prefix 000000 to restricted numbers and marks 0000001 to
// 0000099 "unused to avoid collision with GTIN-8". So every 14-digit form that
// starts `0000000` or `0000002` is a restricted number or an unused one, never
// a GTIN of a product.

/** A digit string with a right GS1 check digit as its last digit (section 7.9). */
export function hasValidCheckDigit(digits: string): boolean {
  return /^[0-9]{2,}$/.test(digits) && checkDigitOf(digits.slice(0, -1)) === digits.at(-1);
}

/** The GS1 check digit for `data`, the digits before it. */
export function checkDigitOf(data: string): string {
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    const weight = (data.length - i) % 2 === 1 ? 3 : 1;
    sum += Number(data[i]) * weight;
  }
  return String((10 - (sum % 10)) % 10);
}

/**
 * The GTIN-12 a UPC-E's eight digits stand for, by Table 5-7: the leading
 * digit, the six encoded digits X1 to X6, and the check digit. Null when the
 * check digit is wrong for the expansion.
 */
export function expandUpcE(code: string): string | null {
  if (!/^[0-9]{8}$/.test(code)) return null;
  const [n, x1, x2, x3, x4, x5, x6, c] = code;
  let data: string;
  if (x6 <= "2") data = `${n}${x1}${x2}${x6}0000${x3}${x4}${x5}`;
  else if (x6 === "3") data = `${n}${x1}${x2}${x3}00000${x4}${x5}`;
  else if (x6 === "4") data = `${n}${x1}${x2}${x3}${x4}00000${x5}`;
  else data = `${n}${x1}${x2}${x3}${x4}${x5}0000${x6}`;
  return checkDigitOf(data) === c ? `${data}${c}` : null;
}

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
  // RCN-8 Prefix 0 or 2 (Table 1-5, 2.1.11.1), U.P.C. Prefix 000000 (Table 1-6).
  if (gtin14.startsWith("0000000") || gtin14.startsWith("0000002")) return true;
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

/** The UPC-E reading of an 8-digit code, or null. `leading` lists the leading digits allowed. */
function upcEReading(code: string, leading: string): Reading | null {
  if (!leading.includes(code[0])) return null;
  const gtin12 = expandUpcE(code);
  return gtin12 === null ? null : readingOf(gtin12);
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
