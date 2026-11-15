import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { fileURLToPath } from "node:url";

const nextConfig: NextConfig = {
  // `next dev` and `next build` both write to `.next` by default, so a build
  // run beside a running dev server replaces the chunks its browser tab is
  // loading. A verification build writes elsewhere: `pnpm --filter
  // @hovimestari/web build:verify`.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // The workspace root is the monorepo root: `@hovimestari/types` is a
  // symlink into `packages/`, so the module graph must be allowed to leave
  // `apps/web`. Pinning it also stops Next inferring the root from the
  // nearest lockfile, which picks the wrong directory inside a git worktree.
  turbopack: {
    root: fileURLToPath(new URL("../..", import.meta.url)),
  },
  // next-intl and its ICU dependencies ship ESM only. `transpilePackages` is
  // also what makes next/jest generate a pnpm-aware `transformIgnorePatterns`
  // that reaches into pnpm's nested node_modules layout (jest.config.ts).
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
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
      {
        // The browser checks for a new service worker on every navigation.
        // An HTTP-cached copy would hold an old worker in place.
        source: "/sw.js",
        headers: [{ key: "Cache-Control", value: "no-cache" }],
      },
    ];
  },
};

// No i18n routing and no proxy: the locale is pinned to "en" in
// src/i18n/request.ts. `createMessagesDeclaration` types ICU message
// arguments by generating `messages/en.d.json.ts` (gitignored, regenerated on
// build and dev). The key-path typing in src/global.d.ts does not depend on it.
const withNextIntl = createNextIntlPlugin({
  experimental: { createMessagesDeclaration: "./messages/en.json" },
});

export default withNextIntl(nextConfig);
