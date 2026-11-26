// Fineli writes a food's name in sentence case in some releases and entirely
// in capitals in others. The catalogue stores every Fineli name in sentence
// case, because every reader of a name (search results, the log, the day, an
// assistant's tools) reads the stored one. Case rules come from a named
// locale, never the process default, so a machine set to Turkish lowers "I"
// to "i" like any other.

/** The locale whose case rules each name file follows. */
export type NameLocale = "fi" | "en";

/**
 * Lower-case letters that an all-capitals name still holds, because they have
 * no capital of their own in one code point: ß (its capital is "SS") and the
 * micro sign µ of a unit.
 */
const NO_CAPITAL_OF_THEIR_OWN = /[ßµ]/gu;

/** The name has at least one letter and no lower-case letter. */
export function isAllCapitals(name: string): boolean {
  const rest = name.replace(NO_CAPITAL_OF_THEIR_OWN, "");
  return /\p{L}/u.test(rest) && !/\p{Ll}/u.test(rest);
}

/**
 * A name written entirely in capitals in sentence case: its first character
 * as written, the rest lower case. "KANANMUNA, KEITETTY" becomes
 * "Kananmuna, keitetty", and "(ARC) MAITO" becomes "(arc) maito", as release
 * 18 writes names that start with a bracket or a digit. Any other name is
 * kept exactly as written.
 */
export function sentenceCase(name: string, locale: NameLocale): string {
  if (!isAllCapitals(name)) return name;
  const first = String.fromCodePoint(name.codePointAt(0) as number);
  return first + name.slice(first.length).toLocaleLowerCase(locale);
}

/** The first FOODNAME per FOODID of a name file's rows, in sentence case when Fineli wrote it in capitals. */
export function firstNames(rows: ReadonlyArray<Record<string, string>>, locale: NameLocale): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of rows)
    if (row.FOODNAME && !map.has(row.FOODID)) map.set(row.FOODID, sentenceCase(row.FOODNAME, locale));
  return map;
}

/** The two names differ, but only in case. */
export function differsInCaseOnly(a: string, b: string, locale: NameLocale): boolean {
  return a !== b && a.toLocaleLowerCase(locale) === b.toLocaleLowerCase(locale);
}
