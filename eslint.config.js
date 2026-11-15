import prettier from "eslint-config-prettier";
import path from "path";
import tseslint from "typescript-eslint";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default tseslint.config(
  tseslint.configs.recommended,
  prettier,
  {
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: __dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  {
    // Test fixtures shared by both apps' suites. Product code never reads them.
    ignores: ["**/__tests__/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [{ name: "@finanssiappis/types/fixtures", message: "Test fixtures are for __tests__/ only." }],
        },
      ],
    },
  },
  {
    ignores: ["**/dist/**", "**/.next/**", "**/.next-build/**", "**/node_modules/**", "**/.claude/worktrees/**"],
  },
);
