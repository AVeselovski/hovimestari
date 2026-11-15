import { describe, expect, it } from "@jest/globals";
import { randomBytes } from "node:crypto";
import { EnvSchema, GOOGLE_KEYS } from "../env.js";
import { googleConfig, googleEnabled } from "../google.js";

// Google and Resend are optional per deployment. Google needs all four of its
// values or none, and production needs Resend, so a half-configured server
// fails at boot rather than on the first sign-in or the first reset mail.

const secret = () => randomBytes(32).toString("hex");

const BASE = {
  DATABASE_URL: "postgresql://postgres@localhost:5432/x",
  JWT_ACCESS_SECRET: secret(),
  JWT_REFRESH_SECRET: secret(),
  BFF_SECRET: secret(),
  CORS_ORIGIN: "http://localhost:3000",
  FRONTEND_URL: "http://localhost:3000",
};

const GOOGLE = {
  GOOGLE_CLIENT_ID: "client-id",
  GOOGLE_CLIENT_SECRET: secret(),
  GOOGLE_CALLBACK_URL: "http://localhost:3001/api/v1/auth/google/callback",
  GOOGLE_LINK_CALLBACK_URL: "http://localhost:3001/api/v1/auth/link/google/callback",
};

describe("EnvSchema", () => {
  it("parses the required values alone, with Google off and no mail service", () => {
    const env = EnvSchema.parse(BASE);
    expect(env.NODE_ENV).toBe("development");
    expect(googleEnabled(env)).toBe(false);
    expect(env.RESEND_API_KEY).toBeUndefined();
  });

  it.each(["JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET", "BFF_SECRET"])("refuses a %s under 32 characters", (key) => {
    const result = EnvSchema.safeParse({ ...BASE, [key]: "x".repeat(31) });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toEqual([key]);
  });

  it("takes a previous relay secret for a rotation, and reads an empty one as unset", () => {
    const previous = secret();
    expect(EnvSchema.parse({ ...BASE, BFF_SECRET_PREVIOUS: previous }).BFF_SECRET_PREVIOUS).toBe(previous);
    expect(EnvSchema.parse({ ...BASE, BFF_SECRET_PREVIOUS: "" }).BFF_SECRET_PREVIOUS).toBeUndefined();
  });
});

describe("EnvSchema, the Google values", () => {
  it("parses all four and turns Google on", () => {
    const env = EnvSchema.parse({ ...BASE, ...GOOGLE });
    expect(googleConfig(env)).toEqual({
      clientID: "client-id",
      clientSecret: GOOGLE.GOOGLE_CLIENT_SECRET,
      callbackURL: GOOGLE.GOOGLE_CALLBACK_URL,
      linkCallbackURL: GOOGLE.GOOGLE_LINK_CALLBACK_URL,
    });
  });

  it("reads the four left empty, as .env.example has them, as Google off", () => {
    const env = EnvSchema.parse({ ...BASE, ...Object.fromEntries(GOOGLE_KEYS.map((k) => [k, ""])) });
    expect(googleEnabled(env)).toBe(false);
  });

  it.each(GOOGLE_KEYS)("refuses the others without %s", (missing) => {
    const values: Record<string, string> = { ...BASE, ...GOOGLE };
    delete values[missing];
    const result = EnvSchema.safeParse(values);
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.path.join("."))).toEqual([missing]);
  });
});

describe("EnvSchema, mail", () => {
  it("requires RESEND_API_KEY in production", () => {
    const result = EnvSchema.safeParse({ ...BASE, NODE_ENV: "production" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toEqual(["RESEND_API_KEY"]);
  });

  it("requires EMAIL_FROM with the key", () => {
    const result = EnvSchema.safeParse({ ...BASE, RESEND_API_KEY: secret() });
    expect(result.error?.issues[0].path).toEqual(["EMAIL_FROM"]);
  });

  it("parses production with the key and the sender", () => {
    const env = EnvSchema.parse({
      ...BASE,
      NODE_ENV: "production",
      RESEND_API_KEY: secret(),
      EMAIL_FROM: "Hovimestari <mail@example.com>",
    });
    expect(env.EMAIL_FROM).toBe("Hovimestari <mail@example.com>");
  });
});
