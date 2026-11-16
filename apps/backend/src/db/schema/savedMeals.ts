import { sql } from "drizzle-orm";
import { check, index, numeric, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { users } from "./users.js";

/**
 * A user's saved meal: a name, where it comes from, and its total figures for
 * one meal as read from a label or a menu. Logged by count.
 */
export const savedMeals = pgTable(
  "saved_meals",
  {
    // The web sends a new UUID with a create, so a repeated request finds its first answer.
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    // Where the meal comes from, such as a delivery service. One free-text tag, trimmed.
    source: text("source"),
    // Total figures for one meal. All four required.
    energyKcal: numeric("energy_kcal", { precision: 6, scale: 1, mode: "number" }).notNull(),
    proteinG: numeric("protein_g", { precision: 5, scale: 1, mode: "number" }).notNull(),
    carbsG: numeric("carbs_g", { precision: 5, scale: 1, mode: "number" }).notNull(),
    fatG: numeric("fat_g", { precision: 5, scale: 1, mode: "number" }).notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    // Deleted by the user while entries use it. Invisible everywhere but on those entries.
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      "saved_meals_values_in_range",
      sql`${t.energyKcal} BETWEEN 0 AND 10000 AND ${t.proteinG} BETWEEN 0 AND 1000 AND ${t.carbsG} BETWEEN 0 AND 1000 AND ${t.fatG} BETWEEN 0 AND 1000`,
    ),
    // The target of the composite key from entries, which ties an entry's meal to its owner.
    // A constraint, not a unique index, so the migration creates it with the table, before that key.
    unique("saved_meals_id_user_uq").on(t.id, t.userId),
    index("saved_meals_user_id_idx").on(t.userId),
  ],
);
