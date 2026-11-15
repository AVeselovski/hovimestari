import type { Config } from "jest";
import nextJest from "next/jest.js";

const createJestConfig = nextJest({ dir: "./" });

const config: Config = {
  testEnvironment: "jest-environment-jsdom",
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
    "^@finanssiappis/types$": "<rootDir>/../../packages/types/dist/index.js",
    "^@finanssiappis/types/fixtures$": "<rootDir>/../../packages/types/dist/fixtures/index.js",
  },
  setupFilesAfterEnv: ["<rootDir>/src/__tests__/setup.ts"],
  testMatch: ["**/__tests__/**/*.test.tsx", "**/__tests__/**/*.test.ts"],
  // next/jest puts its own "/node_modules/" and "/.next/" first and appends these.
  // `.ui-validation/` holds the app copies UI validators run, tests included.
  // `.next-build/` is a verification build's output (`build:verify`, `NEXT_DIST_DIR` in next.config.ts).
  testPathIgnorePatterns: ["/.ui-validation/", "/.next-build/"],
  watchPathIgnorePatterns: ["/.next-build/"],
  clearMocks: true,
};

// next-intl ships ESM (docs/design/i18n-message-catalog.md, D13). `next/jest`
// APPENDS a user-supplied `transformIgnorePatterns` to its own defaults
// rather than replacing them, so adding a pattern here directly can't
// override the blanket `/node_modules/` ignore next/jest sets when no
// `transpilePackages` are configured — see next/dist/build/jest/jest.js.
// `transpilePackages` (next.config.ts) is next/jest's actual, pnpm-aware
// extension point for this: it builds `/node_modules/(?!.pnpm)(?!(pkg)/)` and
// `/node_modules/\.pnpm/(?!(pkg)@)` patterns that correctly reach into
// pnpm's nested `node_modules/.pnpm/<pkg>@<version>.../node_modules/<pkg>/`
// layout, which a hand-written pattern here would otherwise have to
// reimplement.

export default createJestConfig(config);
