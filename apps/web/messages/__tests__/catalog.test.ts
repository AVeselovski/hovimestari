import { createTranslator } from "next-intl";
import messages from "../en.json";

// ---------------------------------------------------------------------------
// Checks that the catalog works: no empty leaf, no code word on screen, and
// every ICU plural renders at 0, 1 and 2 without throwing, because a
// malformed one prints its raw key path. Wording is a matter for review.
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

/** Renders `leaf` from `tree` at counts 0, 1 and 2, throwing on any formatting error. */
function renderAllCounts(tree: MessageTree, leaf: Leaf): void {
  const t = createTranslator({
    locale: "en",
    messages: tree as never,
    // The leaf paths are strings, not the catalog's typed key paths.
    namespace: (leaf.namespace || undefined) as never,
    // next-intl's default onError logs and renders the key path instead of
    // throwing, so a malformed message would pass without this.
    onError(error) {
      throw error;
    },
  });
  for (const count of [0, 1, 2]) {
    const values: Record<string, string | number> = {};
    for (const name of allArgNames(leaf.value)) values[name] = "x";
    for (const name of pluralArgNames(leaf.value)) values[name] = count;
    t(leaf.key as never, values as never);
  }
}

describe("messages/en.json", () => {
  it("is a tree of nested namespaces whose leaves are all non-empty strings", () => {
    for (const leaf of leaves) {
      expect(typeof leaf.value).toBe("string");
      expect(leaf.value.trim().length).toBeGreaterThan(0);
    }
  });

  // Every plural in the catalog renders at 0, 1 and 2. The sweep is proven on
  // two synthetic messages first, so it is known to work before the catalog
  // holds its first plural, and to catch a malformed one when it does.
  it("the plural sweep renders a good plural and catches a malformed one", () => {
    const tree = {
      probe: { good: "{count, plural, one {# item} other {# items}}", bad: "{count, plural, one {# item}" },
    };
    expect(() =>
      renderAllCounts(tree, { path: "probe.good", namespace: "probe", key: "good", value: tree.probe.good }),
    ).not.toThrow();
    expect(() =>
      renderAllCounts(tree, { path: "probe.bad", namespace: "probe", key: "bad", value: tree.probe.bad }),
    ).toThrow();
  });

  it.each(
    pluralLeaves.length ? pluralLeaves.map((leaf): [string, Leaf] => [leaf.path, leaf]) : [["(no plural yet)", null]],
  )("%s renders at count 0, 1 and 2 without throwing", (_path, leaf) => {
    if (leaf) renderAllCounts(messages as MessageTree, leaf);
  });

  // Code words a user should never read on screen. Whole words, any case.
  const BANNED_WORDS = ["stub", "echo", "bff", "jwt", "token"];

  it.each(BANNED_WORDS)("no leaf shows the code word %s", (word) => {
    const pattern = new RegExp(`\\b${word}\\b`, "i");
    expect(leaves.filter((leaf) => pattern.test(leaf.value)).map((leaf) => leaf.path)).toEqual([]);
  });
});
