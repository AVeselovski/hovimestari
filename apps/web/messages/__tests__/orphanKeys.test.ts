import fs from "node:fs";
import path from "node:path";
import messages from "../en.json";

// ---------------------------------------------------------------------------
// Orphan-key linter (docs/design/i18n-message-catalog.md, D18 — deferred
// from slice 1 to slice 6, "once the catalog is complete and the signal is
// meaningful"). A homegrown static sweep, not the `@eloqnt/cli` tool D18
// named as a candidate: that tool lints translation FILES for orphan/missing
// keys across locales, which doesn't fit a single-locale, TypeScript-typed
// catalog whose real risk is a key nobody's `t(...)` call can reach — a
// plain source sweep answers that more directly than a translation-file
// linter would, with zero new dependencies.
//
// The sweep is static-analysis-lite (regex over source text, not a real
// TypeScript AST) — deliberately, to stay a fast, dependency-free test
// rather than pull in the `typescript` compiler API for one check. It
// resolves every static `t("key")` / `t.rich("key")` call, every two-branch
// ternary (`t(cond ? "a" : "b")`), and every template-literal key
// (`` t(`label.${row.kind}`) ``, which it turns into a path pattern with a
// wildcard for the interpolated segment — the "discriminated-key/template-
// literal" case this file's header comment on D18 called out as needing
// handling). The one gap it cannot resolve statically is a key selected via
// a bare variable/property with no literal anywhere in the call
// (`tTab(tab)`, `tContract(value)`) — those are enumerated in
// `DYNAMIC_KEY_NAMESPACES` below, a small, documented, and audited allowlist
// (verified against the actual call sites at the time this test was
// written — see the comment on each entry), exactly the shape D18's header
// comment sanctioned.
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
  // transactions/page.tsx: typeBadge(txn.transactionType, tType(txn.transactionType))
  // — the key is `Transaction["transactionType"]`'s own wire value.
  "transactions.page.typeLabel",
  // transactions/_components/TransactionForm.tsx: {tTab(tab)} — `tab` is the
  // modal's own tab-id union, iterated from a local TABS array.
  "transactions.transactionForm.tab",
  // recurring/_components/RecurringTemplateForm.tsx: {tTab(tab)} — same shape
  // as above, this form's own tabs.
  "recurring.templateForm.tab",
  // components/ui/GrossNetToggle.tsx: {t(m)} — `m` is the AmountMode union,
  // iterated from a local ["gross", "net"] array. `aria` in the same
  // namespace is a literal and resolves without this entry.
  "common.amountMode",
  // _components/accounts/AccountForm.tsx: tContract(value) — `value` is
  // `DebtContractCopyErrorCode` (debtAccountFormValidation.ts), narrowed to
  // exclude "invalidAmount" (resolved separately via common.invalidAmount)
  // before reaching this call.
  "accounts.debtContractFields",
  // components/ui/ThemeToggle.tsx: {t(m)} (each segment's label) — `m` is the
  // ThemeMode union ("light" | "dark" | "system"), iterated from a local
  // MODES array. `ariaLabel` in the same namespace is a literal and resolves
  // without this entry. Namespace moved from shell.themeToggle to
  // settings.appearance.themeToggle when the control moved out of the
  // sidebar into Settings → General (round 2 pass B).
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
