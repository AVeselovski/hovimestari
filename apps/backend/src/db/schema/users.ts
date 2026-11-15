import { sql } from "drizzle-orm";
import { check, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Always stored trimmed and lower-cased: the Zod schema normalises before any query.
    email: text("email").notNull().unique(),
    passwordHash: text("password_hash"), // null on a Google-only account
    googleId: text("google_id").unique(), // null on a password-only account
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // An account always keeps a way in.
    check("users_has_sign_in_method", sql`${t.passwordHash} IS NOT NULL OR ${t.googleId} IS NOT NULL`),
    // Stored lower-case. A mixed-case write fails loudly instead of creating a twin.
    check("users_email_lower", sql`${t.email} = lower(${t.email})`),
  ],
);
