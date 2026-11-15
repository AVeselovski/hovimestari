/// <reference types="node" />
import "dotenv/config";
import { defineConfig } from "drizzle-kit";

// drizzle-kit runs via its own CJS bundler and cannot resolve the .js→.ts
// source alias used by the app's NodeNext module system. Use process.env directly.
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set. Copy apps/backend/.env.example to .env and fill it in.");
}

export default defineConfig({
  schema: "./src/db/schema/*.ts",
  out: "./drizzle/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
