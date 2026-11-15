import createBundleAnalyzer from "@next/bundle-analyzer";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { fileURLToPath } from "node:url";
import { legacyRedirects } from "./legacyRedirects";

const withBundleAnalyzer = createBundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

const nextConfig: NextConfig = {
  // `next dev` and `next build` both write to `.next` by default, so a build
  // run beside a running dev server replaces the chunks its browser tab is
  // loading. A verification build writes elsewhere instead:
  // `pnpm --filter web build:verify` (package.json). Read in both
  // Turbopack dev and the webpack build, since it is plain config.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Point to root ESLint flat config
  eslint: {
    dirs: ["src"],
  },
  // `next dev` runs on Turbopack (package.json `dev` script). The workspace
  // root is the monorepo root: `@finanssiappis/types` is a symlink into
  // `packages/`, so the module graph must be allowed to leave `apps/web`.
  // Pinning it also stops Next inferring the root from the nearest lockfile,
  // which picks the wrong directory when this checkout sits inside another
  // (git worktrees under `.claude/worktrees/`).
  turbopack: {
    root: fileURLToPath(new URL("../..", import.meta.url)),
  },
  // next-intl/use-intl ship ESM-only builds, and so do their own ICU
  // dependencies (docs/design/i18n-message-catalog.md, D13).
  // `transpilePackages` is what makes next/jest generate a pnpm-aware
  // `transformIgnorePatterns` that reaches into pnpm's nested
  // node_modules/.pnpm/<pkg>@<version>.../node_modules/<pkg>/ layout — see
  // jest.config.ts for why a hand-written pattern there isn't enough.
  transpilePackages: [
    "next-intl",
    "use-intl",
    "intl-messageformat",
    "icu-minify",
    "@formatjs/fast-memoize",
    "@formatjs/icu-messageformat-parser",
    "@formatjs/icu-skeleton-parser",
    "@formatjs/intl-localematcher",
  ],
  // Retired paths, sent on to where their content lives now.
  async redirects() {
    return legacyRedirects;
  },
};

// docs/design/i18n-message-catalog.md, D2/D4 — no i18n routing, no
// middleware, locale pinned to "en" (src/i18n/request.ts). The experimental
// `createMessagesDeclaration` option additionally types ICU message
// arguments by generating `messages/en.d.json.ts` (gitignored, regenerated on
// build/dev) — see that doc's D4 risk note: if this option ever breaks on a
// next-intl upgrade, drop it here; the stable `AppConfig` key-path typing in
// src/global.d.ts is unaffected either way.
const withNextIntl = createNextIntlPlugin({
  experimental: { createMessagesDeclaration: "./messages/en.json" },
});

// `ANALYZE=true pnpm --filter web build` opens the client/server/edge bundle
// treemaps in a browser tab. Useful whenever a route's first-load JS moves
// unexpectedly — see docs/design/i18n-message-catalog.md §j for the
// investigation this was added for (next-intl chunk duplication).
export default withBundleAnalyzer(withNextIntl(nextConfig));
