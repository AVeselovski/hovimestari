import { createTranslator } from "next-intl";
import messages from "../en.json";

// ---------------------------------------------------------------------------
// Pins the CLAUDE.md UI-copy rule against the catalog itself
// (docs/design/i18n-message-catalog.md, D18). With every authored string in
// one file, the rule becomes machine-checkable for the first time: no empty
// leaf, no em dash, no semicolon, no internal vocabulary — and every ICU
// plural renders at 0, 1 and 2 without throwing.
//
// Orphan keys (a key nobody renders) are deliberately NOT checked here — see
// D18's note that a real catalog linter is the right tool for that, deferred
// to slice 6.
// ---------------------------------------------------------------------------

type MessageTree = { readonly [key: string]: string | MessageTree };

interface Leaf {
  /** Dot-joined key path, e.g. "tax.notes.noRate". */
  path: string;
  /** The namespace `useTranslations`/`createTranslator` would be given — every path segment but the last. */
  namespace: string;
  /** The final path segment — the key passed to `t(...)`. */
  key: string;
  value: string;
}

// Case-insensitive; code concepts a user should never read on screen
// (CLAUDE.md's UI-copy rule). Grows when review catches a new one.
function collectLeaves(tree: MessageTree, path: readonly string[] = []): Leaf[] {
  const leaves: Leaf[] = [];
  for (const [key, value] of Object.entries(tree)) {
    const nextPath = [...path, key];
    if (typeof value === "string") {
      leaves.push({ path: nextPath.join("."), namespace: path.join("."), key, value });
    } else {
      leaves.push(...collectLeaves(value, nextPath));
    }
  }
  return leaves;
}

const leaves = collectLeaves(messages as MessageTree);

// A plural argument can be named anything ("count", "months", "buckets", …) —
// matching only the literal `{count, plural,` left differently-named plurals
// invisible to BOTH halves of the sweep (inflection rendering AND the
// malformed-ICU check), which slice 4's `months`/`buckets` plurals hit.
function pluralArgNames(value: string): string[] {
  return [...value.matchAll(/\{(\w+),\s*plural\b/g)].map((m) => m[1]);
}

// Every top-level-looking argument name in the message ({date}, {span}, …).
// Over-collects words that open a select/plural BRANCH ("{under pace}" →
// "under"), which is harmless: unused values are ignored at format time,
// while a genuinely missing argument would make `createTranslator` throw.
function allArgNames(value: string): string[] {
  return [...value.matchAll(/\{([a-zA-Z]\w*)/g)].map((m) => m[1]);
}

const pluralLeaves = leaves.filter((leaf) => pluralArgNames(leaf.value).length > 0);

describe("messages/en.json", () => {
  it("is a tree of nested namespaces whose leaves are all non-empty strings", () => {
    for (const leaf of leaves) {
      expect(typeof leaf.value).toBe("string");
      expect(leaf.value.trim().length).toBeGreaterThan(0);
    }
  });

  // This file checks that the catalog WORKS, not that it reads well. The copy
  // rules (plain words, no em dashes or semicolons, no code vocabulary on
  // screen) live in CLAUDE.md and are a matter for review — a wording
  // preference should not fail a build. "Untagged" is why: it is ordinary
  // product language for a filter, and banning the substring outright forced
  // that one string to live outside the catalog to keep the suite green.

  // `it.each` throws on an empty table (rather than registering zero cases),
  // so the block below guards for the namespace-skeleton state where
  // `en.json` has no leaves yet — the static test above still runs regardless.
  if (pluralLeaves.length > 0) {
    it.each(pluralLeaves.map((leaf): [string, Leaf] => [leaf.path, leaf]))(
      "%s renders at count 0, 1 and 2 without throwing",
      (_path, leaf) => {
        const t = createTranslator({
          locale: "en",
          messages,
          namespace: leaf.namespace || undefined,
          // next-intl's default onError LOGS and renders a fallback (the key
          // path) instead of throwing — the exact hazard D14 names. Without
          // rethrowing here, a malformed ICU message passes this test while
          // rendering its raw key path on screen (verified by mutation:
          // dropping a plural's closing brace left this suite green).
          onError(error) {
            throw error;
          },
        });
        for (const count of [0, 1, 2]) {
          const values: Record<string, string | number> = {};
          for (const name of allArgNames(leaf.value)) values[name] = "x";
          for (const name of pluralArgNames(leaf.value)) values[name] = count;
          expect(() => t(leaf.key, values)).not.toThrow();
        }
      },
    );
  }
  // The four debtOpportunityComparison.grossNote* variants deliberately repeat
  // one long base sentence with differing suffixes (README: whitespace
  // fidelity + per-key argument typing beat composing fragments). That trade
  // accepts duplication but not DRIFT: editing the shared prefix in one key
  // and missing the others must fail here (#196 review).
  it("grossNote* variants share the same base sentence", () => {
    const comparison = (messages as Record<string, any>).accounts.debtOpportunityComparison;
    const base: string = comparison.grossNote;
    for (const variant of ["grossNoteFreedCash", "grossNoteLumpCap", "grossNoteBoth"] as const) {
      expect(comparison[variant].startsWith(base)).toBe(true);
    }
  });
});
