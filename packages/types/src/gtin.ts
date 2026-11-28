// Check digits and UPC-E, read from the GS1 General Specifications, Release
// 26.0 (ratified January 2026), fetched from https://ref.gs1.org/standards/genspecs/
// on 2026-11-18:
//
// - Check digit: section 7.9, the mod 10 with weights 3, 1, 3, ... from the right.
// - UPC-E: section 5.2.2.4. The leading digit is always 0 (5.2.2.4.1, "D1 SHALL
//   always be zero"). Decoding is Table 5-7 in 5.2.2.4.2, and the check digit is
//   computed over the expanded GTIN-12 (section 7.10, test 2). A decoder may
//   report a UPC-E with the leading digit 1, which older specifications allowed.
//
// The phone and the server read a barcode's digits through these, so the two
// never disagree on whether a number can be a barcode.

/** The GS1 check digit for `data`, the digits before it. */
export function checkDigitOf(data: string): string {
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    const weight = (data.length - i) % 2 === 1 ? 3 : 1;
    sum += Number(data[i]) * weight;
  }
  return String((10 - (sum % 10)) % 10);
}

/** A digit string with a right GS1 check digit as its last digit (section 7.9). */
export function hasValidCheckDigit(digits: string): boolean {
  return /^[0-9]{2,}$/.test(digits) && checkDigitOf(digits.slice(0, -1)) === digits.at(-1);
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
 * Whether `code` has digits a barcode can have: 8 digits that are a right
 * EAN-8 or a UPC-E with the leading digit 0 or 1 whose expansion checks out,
 * or 12, 13 or 14 digits with a right check digit. It says nothing about
 * whether the number is a shop's own or a case's, which the lookup decides.
 */
export function isWellFormedBarcode(code: string): boolean {
  if (!/^[0-9]{8}$|^[0-9]{12,14}$/.test(code)) return false;
  if (hasValidCheckDigit(code)) return true;
  return code.length === 8 && (code[0] === "0" || code[0] === "1") && expandUpcE(code) !== null;
}

/**
 * Whether two barcodes are one code: equal once both are padded to 14 digits,
 * so the 12, 13 and 14-digit forms of one code are one. Null is no barcode:
 * it equals null and differs from every code. The server and the phone both
 * decide by this whether an own food's barcode changed.
 */
export function sameBarcode(a: string | null, b: string | null): boolean {
  if (a === null || b === null) return a === b;
  return a.padStart(14, "0") === b.padStart(14, "0");
}
