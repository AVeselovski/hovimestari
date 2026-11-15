import { z } from "zod";
import { DEFAULT_DEMO_USER_EMAIL } from "./demoUser.js";

const booleanFlag = (fallback: "true" | "false") =>
  z
    .enum(["true", "false"])
    .default(fallback)
    .transform((v) => v === "true");

/** An optional value, where an empty one (`KEY=` in a .env file) counts as unset. */
const optional = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (v === "" ? undefined : v), schema.optional());

/** 32 random bytes, base64. */
const tokenKey = (name: string) =>
  optional(z.string().refine((v) => Buffer.from(v, "base64").length === 32, `${name} must decode to 32 bytes.`));

/** The Drive values Drive cannot run without. Required only while DRIVE_ENABLED is true. */
const DRIVE_REQUIRED = [
  "DRIVE_TOKEN_KEY",
  "GOOGLE_DRIVE_CALLBACK_URL",
  "GOOGLE_PICKER_API_KEY",
  "GOOGLE_PROJECT_NUMBER",
] as const;

export const EnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().default(3001),
    DATABASE_URL: z.string().url(),
    // Pool size. 5 suits a 256MB to 512MB shared-CPU Postgres; raise to 8 on 1GB.
    DB_POOL_MAX: z.coerce.number().int().min(1).max(50).default(5),
    // How long a vault member's role is cached in process. 0 turns it off.
    MEMBERSHIP_CACHE_TTL_MS: z.coerce.number().int().min(0).default(60_000),
    JWT_ACCESS_SECRET: z.string().min(32),
    JWT_REFRESH_SECRET: z.string().min(32),
    CORS_ORIGIN: z.string().min(1),
    JWT_ACCESS_EXPIRES_IN: z.string().default("15m"),
    JWT_REFRESH_EXPIRES_IN: z.string().default("7d"),
    GOOGLE_CLIENT_ID: z.string().min(1),
    GOOGLE_CLIENT_SECRET: z.string().min(1),
    GOOGLE_CALLBACK_URL: z.string().url(),
    RESEND_API_KEY: z.string().min(1),
    EMAIL_FROM: z.string().min(1).default("noreply@finanssi.app"),
    FRONTEND_URL: z.string().url(),
    GOOGLE_LINK_CALLBACK_URL: z.string().url(),
    /** The demo account, whose login is meant to be shared. It cannot send vault invitations. */
    DEMO_USER_EMAIL: z.string().email().default(DEFAULT_DEMO_USER_EMAIL),
    /** Serves the MCP endpoint at /mcp. Off answers 404 there; nothing else changes. */
    MCP_ENABLED: booleanFlag("true"),
    /** Lets a read-and-write key make changes through /mcp. Off keeps reading working and offers no write key. */
    MCP_WRITES_ENABLED: booleanFlag("true"),
    /** Serves the Google Drive routes. Off answers 404 on them and `available: false` on the status. */
    DRIVE_ENABLED: booleanFlag("false"),
    /** 32 random bytes, base64. Encrypts the Drive refresh tokens at rest. */
    DRIVE_TOKEN_KEY: tokenKey("DRIVE_TOKEN_KEY"),
    /**
     * The key DRIVE_TOKEN_KEY replaced, set only during a rotation. A stored
     * token written under it still opens, and is stored again under the
     * current key on its next refresh.
     */
    DRIVE_TOKEN_KEY_PREVIOUS: tokenKey("DRIVE_TOKEN_KEY_PREVIOUS"),
    GOOGLE_DRIVE_CALLBACK_URL: optional(z.string().url()),
    /** A browser key restricted to the Picker API. Public by nature: it is handed to the owner's browser. */
    GOOGLE_PICKER_API_KEY: optional(z.string()),
    /** The Cloud project number, the Picker's app id. */
    GOOGLE_PROJECT_NUMBER: optional(z.string()),
  })
  .superRefine((env, ctx) => {
    if (!env.DRIVE_ENABLED) return;
    for (const key of DRIVE_REQUIRED) {
      if (!env[key])
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `${key} is required while DRIVE_ENABLED is true.`,
        });
    }
  });

export const env = EnvSchema.parse(process.env);

export type Env = z.infer<typeof EnvSchema>;

/**
 * The Picker's browser key and the Cloud project number, typed present. For
 * code behind DRIVE_ENABLED, where the schema has required them: it throws
 * while Drive is off.
 */
export function driveConfig(values: Env = env): { pickerApiKey: string; projectNumber: string } {
  const { DRIVE_ENABLED, GOOGLE_PICKER_API_KEY, GOOGLE_PROJECT_NUMBER } = values;
  if (!DRIVE_ENABLED || !GOOGLE_PICKER_API_KEY || !GOOGLE_PROJECT_NUMBER) {
    throw new Error("Google Drive is switched off.");
  }
  return { pickerApiKey: GOOGLE_PICKER_API_KEY, projectNumber: GOOGLE_PROJECT_NUMBER };
}
