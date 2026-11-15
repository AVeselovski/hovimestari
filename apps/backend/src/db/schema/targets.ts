import { sql } from "drizzle-orm";
import { check, date, numeric, pgTable, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { users } from "./users.js";

/**
 * One row is one dated change: the complete set of targets in force from
 * `effective_from` until the next change. Before the first change, the first
 * change applies. The unique index also serves the in-force lookup.
 */
export const targetChanges = pgTable(
  "target_changes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // The first day these targets apply, as a calendar date in the user's time zone.
    effectiveFrom: date("effective_from", { mode: "string" }).notNull(),
    energyKcalLower: numeric("energy_kcal_lower", { precision: 6, scale: 1, mode: "number" }).notNull(),
    energyKcalUpper: numeric("energy_kcal_upper", { precision: 6, scale: 1, mode: "number" }).notNull(),
    proteinGLower: numeric("protein_g_lower", { precision: 5, scale: 1, mode: "number" }).notNull(),
    proteinGUpper: numeric("protein_g_upper", { precision: 5, scale: 1, mode: "number" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("target_changes_user_date_uq").on(t.userId, t.effectiveFrom),
    check(
      "target_changes_energy_range",
      sql`0 < ${t.energyKcalLower} AND ${t.energyKcalLower} <= ${t.energyKcalUpper}`,
    ),
    check("target_changes_protein_range", sql`0 < ${t.proteinGLower} AND ${t.proteinGLower} <= ${t.proteinGUpper}`),
  ],
);
