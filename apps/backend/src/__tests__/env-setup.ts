import { randomBytes } from "node:crypto";
import { DEFAULT_TEST_DATABASE_URL } from "./support/testDatabase.js";

// The environment every backend suite starts with. Fixed values are not
// secret. Every secret is generated here at start-up, so no test file, fixture
// or committed env file holds one. Google is off and mail goes to the console:
// a suite that needs Google sets the four GOOGLE_* values itself before it
// imports the app.

const secret = () => randomBytes(32).toString("hex");

Object.assign(process.env, {
  NODE_ENV: "test",
  PORT: "3001",
  // Never a developer's own database. A suite that queries makes its own throwaway one.
  DATABASE_URL: process.env.TEST_DATABASE_URL || DEFAULT_TEST_DATABASE_URL,
  CORS_ORIGIN: "http://localhost:3000",
  FRONTEND_URL: "http://localhost:3000",
  JWT_ACCESS_EXPIRES_IN: "15m",
  JWT_REFRESH_EXPIRES_IN: "7d",
  JWT_ACCESS_SECRET: secret(),
  JWT_REFRESH_SECRET: secret(),
  BFF_SECRET: secret(),
});

for (const key of [
  "BFF_SECRET_PREVIOUS",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_CALLBACK_URL",
  "GOOGLE_LINK_CALLBACK_URL",
  "RESEND_API_KEY",
  "EMAIL_FROM",
]) {
  delete process.env[key];
}
