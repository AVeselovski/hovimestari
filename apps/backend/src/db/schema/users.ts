import { DEFAULT_TIME_ZONE } from "@hovimestari/types";
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
    // The language food names are shown in: "fi" or "en".
    foodNameLanguage: text("food_name_language").notNull().default("fi"),
    // An IANA zone name, the one "today" is read in. Checked with Intl before every write, so no CHECK.
    timeZone: text("time_zone").notNull().default(DEFAULT_TIME_ZONE),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // An account always keeps a way in.
    check("users_has_sign_in_method", sql`${t.passwordHash} IS NOT NULL OR ${t.googleId} IS NOT NULL`),
    // Stored lower-case. A mixed-case write fails loudly instead of creating a twin.
    check("users_email_lower", sql`${t.email} = lower(${t.email})`),
    check("users_food_name_language", sql`${t.foodNameLanguage} IN ('fi', 'en')`),
  ],
);
