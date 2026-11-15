import nextPlugin from "@next/eslint-plugin-next";
import reactPlugin from "eslint-plugin-react";
import rootConfig from "../../eslint.config.js";

// ---------------------------------------------------------------------------
// Message-catalog enforcement (docs/design/i18n-message-catalog.md, D17).
//
// Two zero-runtime rules, app-wide as of slice 6 (§i of the design doc) —
// hardcoding a string anywhere in `src/**/*.tsx` is now a lint error. Slices
// 1-5 scoped this to a growing `MIGRATED_FILES` glob array that WAS the
// migration's progress bar; slice 6 finished the remaining surfaces
// (quick-view, auth, invitations, the shared `components/ui/` primitives,
// and every file the array's complement turned up — see
// apps/web/README.md's "UI copy" section) and collapsed the array to this
// one glob, retiring the progress-bar mechanism as a concept.
// ---------------------------------------------------------------------------
const MIGRATED_FILES = ["src/**/*.tsx"];

// ---------------------------------------------------------------------------
// Raw-palette ban (docs/design/ui-overhaul.md §f "The ratchet"). Same
// mechanism as MIGRATED_FILES above: a growing glob array was the
// migration's own progress bar while it was incomplete. Slices 1-7
// retokenised the app directory by directory; slice 8 finished the last
// stragglers (verified by an app-wide run of this rule turning up zero
// matches) and collapsed the array to this one glob, retiring the
// progress-bar mechanism the same way MIGRATED_FILES was.
//
// `*.ts` joined `*.tsx` here after the ratchet caught a raw-palette leftover
// in `components/ui/styles.ts` (`inputClearButtonClass`) that had survived
// the migration precisely because the glob only ever covered `.tsx` — the
// shared class-string recipes this file holds are plain `.ts`, not JSX, so
// they were invisible to the rule the whole time it was scoped to components.
// ---------------------------------------------------------------------------
const TOKENISED_FILES = ["src/**/*.tsx", "src/**/*.ts"];

// The message-catalog `no-restricted-syntax` selectors, factored out so the
// TOKENISED_FILES block below can layer the raw-palette selectors on top of
// them in one array rather than duplicating them — flat config's per-file
// effective config takes the LAST matching object's value for a given rule
// key whole, not merged, so a file matched by both the MIGRATED_FILES and
// TOKENISED_FILES blocks needs its "no-restricted-syntax" array to carry
// every selector that should apply to it in a single place.
const COPY_RESTRICTED_SYNTAX = [
  {
    selector: "JSXAttribute[name.name=/^(aria-label|placeholder|title|alt)$/] > Literal",
    message: "Accessible names and placeholders are copy. Use useTranslations (docs/design/i18n-message-catalog.md).",
  },
  {
    // Direct-child combinator (not descendant): a plain space here
    // would also match the translation KEY literal inside an
    // already-migrated `getErrorMessage(err, t("loadError"))` call —
    // the key is a Literal nested two levels down, inside the `t(...)`
    // call's own arguments, not a fallback string typed at this call
    // site. Only a Literal passed DIRECTLY as getErrorMessage's own
    // argument is a hardcoded fallback.
    selector: "CallExpression[callee.name='getErrorMessage'] > Literal[value=/[a-z]{3}/]",
    message: "The error fallback is our copy. Use useTranslations (docs/design/i18n-message-catalog.md).",
  },
  {
    selector: "JSXExpressionContainer > Literal[value=/[A-Za-z]{2}/]",
    message:
      'Catches {"text"} literals jsx-no-literals does not see. Use useTranslations (docs/design/i18n-message-catalog.md).',
  },
];

// ---------------------------------------------------------------------------
// Raw-palette ban selectors (docs/design/ui-overhaul.md §f "The ratchet").
// Matches a raw Tailwind palette class inside a string Literal or a
// TemplateElement (a `` `...${x}...` `` template literal segment), in either
// direction (`bg-`, `text-`, `border-`, …) against any of Tailwind's named
// palette colours. `text-white` / `bg-black` are caught by the second
// pattern — the design's tokens have no literal "white"/"black" name, so
// these are always a raw class, never a token utility.
// ---------------------------------------------------------------------------
const RAW_PALETTE_PATTERN =
  "\\b(?:bg|text|border|ring-offset|ring|divide|placeholder|outline|fill|stroke|from|via|to)-(?:gray|slate|zinc|neutral|stone|green|red|yellow|amber|orange|blue|purple|violet|indigo|sky|teal|emerald|cyan|pink|rose)-\\d{2,3}\\b";
const RAW_BLACK_WHITE_PATTERN = "\\b(?:bg|text|border)-(?:white|black)\\b";

// ---------------------------------------------------------------------------
// shadcn/ui token-name ban (docs/design/component-library-adoption.md §6/§11
// Stage 1). shadcn's default theme names its CSS variables `--background`,
// `--popover`, `--primary`, etc., generating Tailwind classes like
// `bg-popover` or `text-muted-foreground`. This repo has its own semantic
// tokens (`docs/app/colors.md`) and never adopted shadcn's theme — Stage 1
// adopted `@base-ui/react` directly instead, specifically so no second token
// system would ever need reconciling with the first. A shadcn class name
// slipping into a file (e.g. copied from a `shadcn add` scaffold before it's
// re-skinned onto `styles.ts`/semantic tokens) reads as if it resolves to
// something, but nothing in this app defines `--color-popover` or
// `--color-muted-foreground` — same failure mode as a raw palette class, so
// it rides the same ratchet.
// ---------------------------------------------------------------------------
const SHADCN_TOKEN_PATTERN =
  "\\b(?:bg|text|border|ring-offset|ring|divide|placeholder|outline|fill|stroke|from|via|to)-(?:background|foreground|card|card-foreground|popover|popover-foreground|primary|primary-foreground|secondary|secondary-foreground|muted|muted-foreground|accent-foreground|destructive|destructive-foreground|input|ring|ring-offset)\\b";

const PALETTE_RESTRICTED_SYNTAX = [
  {
    selector: `Literal[value=/${RAW_PALETTE_PATTERN}/]`,
    message: "Raw palette class. Use a semantic token (docs/app/colors.md).",
  },
  {
    selector: `TemplateElement[value.raw=/${RAW_PALETTE_PATTERN}/]`,
    message: "Raw palette class. Use a semantic token (docs/app/colors.md).",
  },
  {
    selector: `Literal[value=/${RAW_BLACK_WHITE_PATTERN}/]`,
    message: "Raw palette class. Use a semantic token (docs/app/colors.md).",
  },
  {
    selector: `TemplateElement[value.raw=/${RAW_BLACK_WHITE_PATTERN}/]`,
    message: "Raw palette class. Use a semantic token (docs/app/colors.md).",
  },
  {
    selector: `Literal[value=/${SHADCN_TOKEN_PATTERN}/]`,
    message: "shadcn token class — this app has no shadcn theme. Use a semantic token (docs/app/colors.md).",
  },
  {
    selector: `TemplateElement[value.raw=/${SHADCN_TOKEN_PATTERN}/]`,
    message: "shadcn token class — this app has no shadcn theme. Use a semantic token (docs/app/colors.md).",
  },
];

export default [
  ...rootConfig,
  {
    plugins: {
      "@next/next": nextPlugin,
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
    },
  },
  {
    files: MIGRATED_FILES,
    // Test files legitimately hardcode fixture strings/props (D15 — they're
    // the regression suite the whole migration leans on, and must never be
    // edited by a lint fix) — excluded here, not just left unmigrated.
    ignores: ["**/__tests__/**"],
    plugins: {
      react: reactPlugin,
    },
    rules: {
      // Default `ignoreProps: true` — `false` would also flag `className`
      // etc. `allowedStrings` carries typographic separators and units that
      // are not sentence copy (docs/design/i18n-message-catalog.md, D17).
      // "---", "×" and "✕" joined the list in slice 2 — same rationale as
      // the em dash: symbols, not sentence copy. "×" (chip remove) and "✕"
      // (dismiss suggestion) are icon-like glyphs on controls that already
      // carry an accessible name via a sibling aria-label; "---" is the
      // transaction table's empty-cell placeholder (plain span, or a
      // quick-fill button that has its own aria-label), not an icon.
      // "→" joined in slice 4 — the date-range/tooltip separator glyph
      // (PeriodSelector's from/to inputs, MoneyFlowSankey's source→target
      // tooltip line), same "symbol, not sentence copy" rationale.
      "react/jsx-no-literals": ["error", { allowedStrings: ["·", "%", "€", "/", "—", "*", "---", "×", "✕", "→"] }],
      "no-restricted-syntax": ["error", ...COPY_RESTRICTED_SYNTAX],
    },
  },
  {
    files: TOKENISED_FILES,
    // Same rationale as MIGRATED_FILES's own __tests__ exclusion above: test
    // files legitimately assert against real class names.
    ignores: ["**/__tests__/**"],
    rules: {
      // Combined with COPY_RESTRICTED_SYNTAX (not just the palette
      // selectors alone) — see the comment on COPY_RESTRICTED_SYNTAX above
      // for why: flat config takes the LAST matching config object's value
      // for a rule key whole, so a file under both MIGRATED_FILES and
      // TOKENISED_FILES needs every selector that applies to it in this one
      // array, or it would silently lose the copy-migration checks.
      "no-restricted-syntax": ["error", ...COPY_RESTRICTED_SYNTAX, ...PALETTE_RESTRICTED_SYNTAX],
    },
  },
];
