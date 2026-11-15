import type { Config } from "jest";

const config: Config = {
  testEnvironment: "node",
  extensionsToTreatAsEsm: [".ts"],
  moduleNameMapper: {
    // Remap .js extensions to real .ts sources (NodeNext import convention)
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { useESM: true, tsconfig: "./tsconfig.test.json" }],
  },
  setupFiles: ["<rootDir>/src/__tests__/env-setup.ts"],
  testMatch: ["**/__tests__/**/*.test.ts"],
  clearMocks: true,
  // The real-database suites create a database and run every migration in a
  // beforeAll. That takes half a second on an idle machine and more than the
  // five-second default while other runs load the same Postgres, which fails
  // every test in the suite at once. A slow test still shows in the report.
  // The cases that send a hundred requests or more in a row (rateLimit,
  // refusedKeyBrake and brakeAfterBody under src/mcp, and the 60-upload case
  // in transactionFiles) await each answer and take up to about six seconds
  // with every core busy, so they need it too. A test past its timeout keeps
  // running, and its requests count against the limiter in the next test.
  testTimeout: 30_000,
  // Under --experimental-vm-modules Jest 29 never frees a finished test file's
  // context, about 11 MB each. One process running every file climbs to
  // about 1.8 GB, where garbage collection pauses for a second at a time and
  // the run can die out of memory. A worker past this limit after a file is
  // replaced by a fresh one. It also makes Jest use a worker on a one-core or
  // two-core machine, where it would otherwise run everything in one process.
  // An explicit --runInBand skips it: use --maxWorkers=1 for a serial run.
  workerIdleMemoryLimit: "512MB",
};

export default config;
