import nextPlugin from "@next/eslint-plugin-next";
import reactPlugin from "eslint-plugin-react";
import rootConfig from "../../eslint.config.js";

// ---------------------------------------------------------------------------
// Two rules that keep the web app on its catalog and its tokens.
//
// Copy: every string a component renders is a message catalog entry
// (messages/en.json, read through useTranslations). A literal in JSX, an
// accessible name, a placeholder or an error fallback is a lint error.
//
// Palette: components style through the semantic tokens in
// src/app/globals.css (docs/app/colors.md). A raw Tailwind palette class, a
// raw black or white, or a shadcn token name is a lint error. The palette is
// also switched off in globals.css, so such a class would not even exist.
// ---------------------------------------------------------------------------

const COPY_FILES = ["src/**/*.tsx"];
const TOKENISED_FILES = ["src/**/*.tsx", "src/**/*.ts"];

// Flat config takes the last matching object's value for a rule key whole, so
// a file under both blocks needs every selector in one array.
const COPY_RESTRICTED_SYNTAX = [
  {
    selector: "JSXAttribute[name.name=/^(aria-label|placeholder|title|alt)$/] > Literal",
    message: "Accessible names and placeholders are copy. Use useTranslations.",
  },
  {
    selector: "JSXExpressionContainer > Literal[value=/[A-Za-z]{2}/]",
    message: 'Catches {"text"} literals jsx-no-literals does not see. Use useTranslations.',
  },
];

const RAW_PALETTE_PATTERN =
  "\\b(?:bg|text|border|ring-offset|ring|divide|placeholder|outline|fill|stroke|from|via|to)-(?:gray|slate|zinc|neutral|stone|green|red|yellow|amber|orange|blue|purple|violet|indigo|sky|teal|emerald|cyan|pink|rose|lime|fuchsia)-\\d{2,3}\\b";
const RAW_BLACK_WHITE_PATTERN = "\\b(?:bg|text|border|outline|fill|stroke)-(?:white|black)\\b";
const SHADCN_TOKEN_PATTERN =
  "\\b(?:bg|text|border|ring-offset|ring|divide|placeholder|outline|fill|stroke|from|via|to)-(?:background|foreground|card|card-foreground|popover|popover-foreground|primary|primary-foreground|secondary|secondary-foreground|muted|muted-foreground|accent-foreground|destructive|destructive-foreground|input)\\b";

const paletteSelectors = (pattern, message) => [
  { selector: `Literal[value=/${pattern}/]`, message },
  { selector: `TemplateElement[value.raw=/${pattern}/]`, message },
];

const PALETTE_RESTRICTED_SYNTAX = [
  ...paletteSelectors(RAW_PALETTE_PATTERN, "Raw palette class. Use a semantic token (docs/app/colors.md)."),
  ...paletteSelectors(RAW_BLACK_WHITE_PATTERN, "Raw palette class. Use a semantic token (docs/app/colors.md)."),
  ...paletteSelectors(
    SHADCN_TOKEN_PATTERN,
    "shadcn token class. This app has no shadcn theme. Use a semantic token (docs/app/colors.md).",
  ),
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
    files: COPY_FILES,
    // Test files assert on fixture strings and real class names.
    ignores: ["**/__tests__/**"],
    plugins: {
      react: reactPlugin,
    },
    rules: {
      // Symbols that are not sentence copy.
      "react/jsx-no-literals": ["error", { allowedStrings: ["·", "/", "×", "→"] }],
    },
  },
  {
    files: TOKENISED_FILES,
    ignores: ["**/__tests__/**"],
    rules: {
      "no-restricted-syntax": ["error", ...COPY_RESTRICTED_SYNTAX, ...PALETTE_RESTRICTED_SYNTAX],
    },
  },
  {
    // The throwaway camera check page lives only on the branch
    // spike/scan-check, which never merges. Its log lines are diagnostics for
    // the developer, not product copy, so it skips the catalog. The palette
    // rule still applies.
    files: ["src/app/scan-check/**"],
    rules: {
      "react/jsx-no-literals": "off",
      "no-restricted-syntax": ["error", ...PALETTE_RESTRICTED_SYNTAX],
    },
  },
];
