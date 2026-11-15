import fs from "node:fs";
import path from "node:path";
import messages from "../en.json";

// ---------------------------------------------------------------------------
// Orphan keys: every catalog leaf must be reachable from some t() or
// t.rich() call in src. A regex sweep, not a TypeScript AST, so it stays a
// fast test with no dependency. It resolves literal keys, two-branch ternary
// keys and template-literal keys. A key chosen through a bare variable cannot
// be resolved statically, so its namespace is listed in
// DYNAMIC_KEY_NAMESPACES with the call site that reaches it.
// ---------------------------------------------------------------------------

const SRC_ROOT = path.resolve(__dirname, "../../src");

/**
 * Namespaces reached only through a bare-identifier key argument the static
 * sweep cannot resolve (the argument is a variable or property access, not a
 * string literal or template literal) — every leaf under these namespaces is
 * treated as reachable without further checking. Each entry names its call
 * site so a future audit can re-verify it still applies.
 */
const DYNAMIC_KEY_NAMESPACES = [
  // hooks/useErrorCopy.ts: t(errorCopyKey(...)), where the key is an error
  // code or "fallback". lib/__tests__/errorCopy.test.ts checks this
  // namespace against the codes instead.
  "errors",
  // components/shell/NavLinks.tsx and AppHeader.tsx: t(tab.key) and
  // t(active), where the key is a TabKey from components/shell/tabs.ts.
  "shell.tabs",
  // components/ui/ThemeToggle.tsx: {t(m)}, where `m` is a ThemeMode from a
  // local MODES array. `ariaLabel` is a literal and resolves without this.
  "settings.appearance.themeToggle",
];

type MessageTree = { readonly [key: string]: string | MessageTree };

function collectLeafPaths(tree: MessageTree, prefix: readonly string[] = []): string[] {
  const paths: string[] = [];
  for (const [key, value] of Object.entries(tree)) {
    const next = [...prefix, key];
    if (typeof value === "string") {
      paths.push(next.join("."));
    } else {
      paths.push(...collectLeafPaths(value, next));
    }
  }
  return paths;
}

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "__tests__") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listSourceFiles(full));
    } else if (entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))) {
      out.push(full);
    }
  }
  return out;
}

const VAR_BINDING_RE =
  /\b(?:const|let)\s+(\w+)\s*=\s*(?:await\s+)?(?:useTranslations|getTranslations)(?:<[^>]*>)?\(\s*["'`]([\w.]+)["'`]\s*\)/g;
const ALIAS_RE = /type\s+(\w+)\s*=\s*ReturnType<typeof\s+useTranslations<["'`]([\w.]+)["'`]>>/g;

/** Escapes a literal fragment of a template string for use inside a RegExp. */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Reachability computed by sweeping every source file for translator
 * bindings (`useTranslations`/`getTranslations` calls, and the
 * `type X = ReturnType<typeof useTranslations<"ns">>` alias pattern used to
 * thread a translator into a plain helper function) and every call made
 * through each bound variable, in that same file.
 */
function computeReachability(files: readonly string[]): {
  reachableKeys: Set<string>;
  reachablePatterns: RegExp[];
} {
  const reachableKeys = new Set<string>();
  const reachablePatterns: RegExp[] = [];

  for (const file of files) {
    const content = fs.readFileSync(file, "utf-8");

    // A variable name can be bound to more than one namespace in the same
    // file — the same short name ("t") is routinely reused per-component in
    // a file with several sibling components/helpers, each with its own
    // `const t = useTranslations(...)`. This is a file-wide (not
    // scope-aware) sweep, so every namespace a name is EVER bound to in this
    // file is tried against every call through that name — a deliberate
    // over-approximation (safe direction for an orphan check: it can miss a
    // truly-dead key if two same-named bindings coincidentally "cover" for
    // each other, but it will never flag a key that is genuinely used).
    const varNamespaces = new Map<string, Set<string>>();
    function bind(varName: string, namespace: string) {
      const set = varNamespaces.get(varName) ?? new Set<string>();
      set.add(namespace);
      varNamespaces.set(varName, set);
    }

    // 1. Direct bindings: const t = useTranslations("ns");
    for (const m of content.matchAll(VAR_BINDING_RE)) {
      bind(m[1], m[2]);
    }

    // 2. Alias-typed bindings: a translator threaded in as a parameter (or
    // an object/interface field, e.g. a `ctx` object passed to a helper),
    // typed via a `ReturnType<typeof useTranslations<"ns">>` alias declared
    // in the same file (the "translator-typing pattern", apps/web/README.md).
    for (const am of content.matchAll(ALIAS_RE)) {
      const [, alias, namespace] = am;
      const paramRe = new RegExp(`\\b(\\w+)\\s*:\\s*${alias}\\b`, "g");
      for (const pm of content.matchAll(paramRe)) {
        bind(pm[1], namespace);
      }
    }

    for (const [varName, namespaces] of varNamespaces) {
      const escapedVar = escapeRegExp(varName);

      // Plain literal key: VAR("key"), VAR.rich("key"), or ctx.VAR("key") —
      // excludes only a preceding word character (so `foo.t(` still
      // matches: a translator threaded in as an object field, e.g.
      // SearchableCombobox's `ctx.t("addOption", …)`), not a preceding dot.
      const literalRe = new RegExp(`(?<!\\w)${escapedVar}(?:\\.rich)?\\(\\s*["'\`]([\\w.]+)["'\`]`, "g");
      for (const lm of content.matchAll(literalRe)) {
        for (const namespace of namespaces) reachableKeys.add(`${namespace}.${lm[1]}`);
      }

      // Two-branch ternary key: VAR(cond ? "a" : "b") or VAR.rich(cond ? "a" : "b", …)
      const ternaryRe = new RegExp(
        `(?<!\\w)${escapedVar}(?:\\.rich)?\\(\\s*[^,()]*?\\?\\s*["'\`]([\\w.]+)["'\`]\\s*:\\s*["'\`]([\\w.]+)["'\`]`,
        "g",
      );
      for (const tm of content.matchAll(ternaryRe)) {
        for (const namespace of namespaces) {
          reachableKeys.add(`${namespace}.${tm[1]}`);
          reachableKeys.add(`${namespace}.${tm[2]}`);
        }
      }

      // Template-literal key with an interpolated segment:
      // VAR(`label.${row.kind}`) or VAR(`${branch}.bufferTitle`). Each
      // `${...}` becomes a one-segment wildcard in the reachability pattern
      // — the discriminated-key case this file's header comment names.
      const templateRe = new RegExp(`(?<!\\w)${escapedVar}(?:\\.rich)?\\(\\s*\`([^\`]*)\``, "g");
      for (const tpm of content.matchAll(templateRe)) {
        const body = tpm[1];
        if (!body.includes("${")) continue; // a plain backtick string with no interpolation — not this case
        const pattern = body
          .split(/\$\{[^}]*\}/)
          .map(escapeRegExp)
          .join("[^.]+");
        for (const namespace of namespaces) {
          reachablePatterns.push(new RegExp(`^${escapeRegExp(namespace)}\\.${pattern}$`));
        }
      }
    }
  }

  return { reachableKeys, reachablePatterns };
}

const allFiles = listSourceFiles(SRC_ROOT);
const { reachableKeys, reachablePatterns } = computeReachability(allFiles);
const leafPaths = collectLeafPaths(messages as MessageTree);

function isReachable(leafPath: string): boolean {
  if (reachableKeys.has(leafPath)) return true;
  if (reachablePatterns.some((re) => re.test(leafPath))) return true;
  if (DYNAMIC_KEY_NAMESPACES.some((ns) => leafPath === ns || leafPath.startsWith(`${ns}.`))) return true;
  return false;
}

describe("messages/en.json orphan keys", () => {
  it("every catalog leaf is referenced by some t()/t.rich() call in src", () => {
    const orphans = leafPaths.filter((p) => !isReachable(p));
    expect(orphans).toEqual([]);
  });

  // Regression proof the mechanism actually catches something (CLAUDE.md
  // failure mode 1 — a check that always passes proves nothing): a key that
  // is genuinely unreferenced anywhere in `src` must be reported.
  it("flags a deliberately unreferenced key", () => {
    const bogusPath = "common.__orphanLinterCanaryKeyThatNoComponentEverReferences__";
    expect(isReachable(bogusPath)).toBe(false);
    const orphans = [...leafPaths, bogusPath].filter((p) => !isReachable(p));
    expect(orphans).toEqual([bogusPath]);
  });
});
