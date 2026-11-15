/** @type {import("jest").Config} */
const config = {
  testEnvironment: "node",
  extensionsToTreatAsEsm: [".ts"],
  moduleNameMapper: {
    // Remap .js extensions to real .ts sources (NodeNext import convention)
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { useESM: true, tsconfig: "./tsconfig.json" }],
  },
  testMatch: ["**/__tests__/**/*.test.ts"],
};

export default config;
