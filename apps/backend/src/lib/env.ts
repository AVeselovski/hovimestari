import { z } from "zod";

/** An optional value, where an empty one (`KEY=` in a .env file) counts as unset. */
const optional = <T extends z.ZodType>(schema: T) => z.preprocess((v) => (v === "" ? undefined : v), schema.optional());

/** The Google values sign-in with Google needs. All four or none: Google is off when none is set. */
export const GOOGLE_KEYS = [
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_CALLBACK_URL",
  "GOOGLE_LINK_CALLBACK_URL",
] as const;

export const EnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().default(3001),
    DATABASE_URL: z.url(),
    // Pool size. 5 suits a 256MB to 512MB shared-CPU Postgres; raise to 8 on 1GB.
    DB_POOL_MAX: z.coerce.number().int().min(1).max(50).default(5),
    JWT_ACCESS_SECRET: z.string().min(32),
    JWT_REFRESH_SECRET: z.string().min(32),
    CORS_ORIGIN: z.string().min(1),
    JWT_ACCESS_EXPIRES_IN: z.string().default("15m"),
    JWT_REFRESH_EXPIRES_IN: z.string().default("7d"),
    FRONTEND_URL: z.url(),
    /** What the web server presents on every relayed call. Authenticates the client address it forwards. */
    BFF_SECRET: z.string().min(32),
    /** The value BFF_SECRET replaced, set only during a rotation, so the web app keeps working until it changes. */
    BFF_SECRET_PREVIOUS: optional(z.string().min(32)),
    GOOGLE_CLIENT_ID: optional(z.string()),
    GOOGLE_CLIENT_SECRET: optional(z.string()),
    GOOGLE_CALLBACK_URL: optional(z.url()),
    GOOGLE_LINK_CALLBACK_URL: optional(z.url()),
    /** Sends mail through Resend. Without it, development and test write mail to the console. */
    RESEND_API_KEY: optional(z.string()),
    EMAIL_FROM: optional(z.string()),
  })
  .superRefine((env, ctx) => {
    const setGoogle = GOOGLE_KEYS.filter((key) => env[key] !== undefined);
    if (setGoogle.length > 0 && setGoogle.length < GOOGLE_KEYS.length) {
      for (const key of GOOGLE_KEYS.filter((k) => env[k] === undefined)) {
        ctx.addIssue({ code: "custom", path: [key], message: `${key} is required when any Google value is set.` });
      }
    }
    if (env.NODE_ENV === "production" && !env.RESEND_API_KEY) {
      ctx.addIssue({ code: "custom", path: ["RESEND_API_KEY"], message: "RESEND_API_KEY is required in production." });
    }
    if (env.RESEND_API_KEY && !env.EMAIL_FROM) {
      ctx.addIssue({ code: "custom", path: ["EMAIL_FROM"], message: "EMAIL_FROM is required with RESEND_API_KEY." });
    }
  });

export const env = EnvSchema.parse(process.env);

export type Env = z.infer<typeof EnvSchema>;
