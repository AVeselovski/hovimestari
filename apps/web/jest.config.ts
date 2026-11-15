import type { Config } from "jest";
import nextJest from "next/jest.js";

const createJestConfig = nextJest({ dir: "./" });

const config: Config = {
  testEnvironment: "<rootDir>/src/__tests__/environments/jsdom.ts",
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
    "^@hovimestari/types$": "<rootDir>/../../packages/types/dist/index.js",
  },
  setupFilesAfterEnv: ["<rootDir>/src/__tests__/setup.ts"],
  testMatch: ["**/__tests__/**/*.test.tsx", "**/__tests__/**/*.test.ts"],
  // next/jest puts its own "/node_modules/" and "/.next/" first and appends these.
  // `.next-build/` is a verification build's output (`build:verify`).
  testPathIgnorePatterns: ["/.next-build/"],
  watchPathIgnorePatterns: ["/.next-build/"],
  clearMocks: true,
};

// next-intl ships ESM. `next/jest` appends a user-supplied
// `transformIgnorePatterns` to its own defaults rather than replacing them,
// so a pattern here cannot override its blanket `/node_modules/` ignore.
// `transpilePackages` in next.config.ts is next/jest's pnpm-aware extension
// point for this.
export default createJestConfig(config);
