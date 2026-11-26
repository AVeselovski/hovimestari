// The Finnish word pairs the food search knows, for meats and a few staples.
// A short list of grammar facts, not Finnish grammar: each pair is here
// because names in the Fineli catalogue use both forms. Spelling is the
// normalised one the search columns hold (lower case, accents folded).
// docs/design/food-search-ranking.md, section h, has the query that measures
// a candidate pair before it is added.

/** Base form and genitive. Typing either also searches the other, at the start of a word. */
export const SEARCH_FORMS: ReadonlyArray<readonly [base: string, genitive: string]> = [
  ["nauta", "naudan"],
  ["sika", "sian"],
  ["porsas", "porsaan"],
  ["lammas", "lampaan"],
  ["vuohi", "vuohen"],
  ["hirvi", "hirven"],
  ["vasikka", "vasikan"],
  ["ruis", "rukiin"],
  ["rapu", "ravun"],
  ["auringonkukka", "auringonkukan"],
  ["lohi", "lohen"],
  ["maito", "maidon"],
  ["leipa", "leivan"],
  ["kana", "kanan"],
  ["broileri", "broilerin"],
  ["kalkkuna", "kalkkunan"],
  ["poro", "poron"],
  ["peruna", "perunan"],
];

/** One more spelling a typed word is searched by. `compound` says how a name that holds it is ranked. */
export interface SearchForm {
  form: string;
  /** True for a genitive reached from its typed base: at the start of a longer word it is a compound's first part. */
  compound: boolean;
}

/**
 * The forms a typed word also searches. A typed genitive answers its base, for every pair. A typed base answers its
 * genitive only for a changed-stem pair, with `compound` true. The base of a regular pair answers nothing: "kana"
 * is already part of "kanan". A form applies only when the typed word equals a member, so "naut" has none.
 */
export function formsOf(word: string): SearchForm[] {
  const forms: SearchForm[] = [];
  for (const [base, genitive] of SEARCH_FORMS) {
    if (word === genitive) forms.push({ form: base, compound: false });
    else if (word === base && !genitive.startsWith(base)) forms.push({ form: genitive, compound: true });
  }
  return forms;
}
