/// <reference types="node" />
import "dotenv/config";
import { defineConfig } from "drizzle-kit";

// drizzle-kit runs via its own CJS bundler and cannot resolve the .js→.ts
// source alias used by the app's NodeNext module system. Use process.env directly.
//
// Only `migrate` and `studio` talk to a database. `generate` compares the
// schema with the committed snapshots, so it runs without DATABASE_URL, as
// CI's migration check does.
const needsDatabase = process.argv.some((arg) => arg === "migrate" || arg === "studio");
if (needsDatabase && !process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set. Run `pnpm env:init` at the repository root, or set it.");
}

export default defineConfig({
  schema: "./src/db/schema/*.ts",
  out: "./drizzle/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
});
