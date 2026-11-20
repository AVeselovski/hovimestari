import { ENTRY_KINDS, ENTRY_STATUSES, type EntryKind, type EntryStatus } from "@hovimestari/types";
import { sql } from "drizzle-orm";
import {
  bigserial,
  check,
  date,
  foreignKey,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { foods } from "./foods.js";
import { recipes } from "./recipes.js";
import { savedMeals } from "./savedMeals.js";
import { users } from "./users.js";

// Kind and status are text with CHECKs, not pgEnum: a new kind is an ALTER of
// the CHECK, and ALTER TYPE ... ADD VALUE cannot run in the migrator's own
// transaction.
const listOf = (values: readonly string[]) => sql.raw(values.map((v) => `'${v}'`).join(", "));

/**
 * One entry on one day: a food by weight, a saved meal by count, a recipe
 * by servings, or an estimate with typed figures, planned or eaten. An entry
 * stores its basis and its amount, and its figures are computed from those
 * two alone, so a past day never changes when a food, meal or recipe is edited.
 *
 * A migration that adds, renames or drops a column here must also rewrite or
 * clear `removed_entries.row`: a restore puts that row back by column name,
 * so a NOT NULL or CHECK column it lacks refuses the restore, and a renamed
 * column loses its value.
 */
export const entries = pgTable(
  "entries",
  {
    // The web sends a new UUID with every add and copy, so a repeated request applies once.
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: date("date", { mode: "string" }).notNull(),
    // The order within a day: the order entries were added. From the sequence
    // on insert, never changed, so a move keeps it and a restore brings it back.
    position: bigserial("position", { mode: "number" }).notNull(),
    status: text("status").$type<EntryStatus>().notNull(),
    // When it was logged or marked eaten. Null while planned.
    eatenAt: timestamp("eaten_at", { withTimezone: true }),
    kind: text("kind").$type<EntryKind>().notNull(),

    // kind = food
    foodId: uuid("food_id").references(() => foods.id, { onDelete: "cascade" }),
    grams: numeric("grams", { precision: 5, scale: 1, mode: "number" }),
    // How the amount was entered: a count of a portion, its label copied for
    // display. portion_id is a hint for prefilling the next amount, not a
    // reference: no foreign key (the cascade walk refuses SET NULL into a
    // table reached from users, and CASCADE would delete the entry), and
    // nothing computes figures through it. It is read only when
    // food_portions.id = portion_id AND food_portions.food_id = entries.food_id
    // AND portionVisibleTo(user). Any other id is read as null.
    portionId: uuid("portion_id"),
    portionCount: numeric("portion_count", { precision: 5, scale: 2, mode: "number" }),
    portionUnit: text("portion_unit"), // a Fineli unit code
    portionName: text("portion_name"), // a user's own label

    // kind = saved_meal
    savedMealId: uuid("saved_meal_id"),
    mealCount: numeric("meal_count", { precision: 5, scale: 2, mode: "number" }),

    // kind = recipe. Servings with two decimals, above 0 and at most 100.
    recipeId: uuid("recipe_id"),
    servings: numeric("servings", { precision: 5, scale: 2, mode: "number" }),

    // kind = estimate
    name: text("name"),
    note: text("note"),

    // The values the entry is figured from: per 100 g (food), per meal (saved
    // meal), per serving (recipe), or the whole entry (estimate). Written
    // once, when the entry is added. Only an edit of the source (for a
    // recipe, also of an own food on its lines) rewrites it, and only on
    // planned entries dated today or later.
    basisEnergyKcal: numeric("basis_energy_kcal", { precision: 7, scale: 2, mode: "number" }).notNull(),
    basisProteinG: numeric("basis_protein_g", { precision: 7, scale: 3, mode: "number" }).notNull(),
    basisCarbsG: numeric("basis_carbs_g", { precision: 7, scale: 3, mode: "number" }).notNull(),
    basisFatG: numeric("basis_fat_g", { precision: 7, scale: 3, mode: "number" }).notNull(),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // An entry's meal belongs to the entry's user, whatever the service checked.
    foreignKey({
      name: "entries_saved_meal_user_fk",
      columns: [t.savedMealId, t.userId],
      foreignColumns: [savedMeals.id, savedMeals.userId],
    }).onDelete("cascade"),
    // An entry's recipe belongs to the entry's user, whatever the service checked.
    foreignKey({
      name: "entries_recipe_user_fk",
      columns: [t.recipeId, t.userId],
      foreignColumns: [recipes.id, recipes.userId],
    }).onDelete("cascade"),
    check("entries_status", sql`${t.status} IN (${listOf(ENTRY_STATUSES)})`),
    check("entries_kind", sql`${t.kind} IN (${listOf(ENTRY_KINDS)})`),
    check("entries_eaten_at", sql`(${t.status} = 'eaten') = (${t.eatenAt} IS NOT NULL)`),
    check("entries_food", sql`(${t.kind} = 'food') = (${t.foodId} IS NOT NULL AND ${t.grams} IS NOT NULL)`),
    check(
      "entries_food_fields",
      sql`${t.kind} = 'food' OR (${t.foodId} IS NULL AND ${t.grams} IS NULL AND ${t.portionCount} IS NULL)`,
    ),
    check(
      "entries_meal",
      sql`(${t.kind} = 'saved_meal') = (${t.savedMealId} IS NOT NULL AND ${t.mealCount} IS NOT NULL)`,
    ),
    check(
      "entries_meal_fields",
      sql`${t.kind} = 'saved_meal' OR (${t.savedMealId} IS NULL AND ${t.mealCount} IS NULL)`,
    ),
    check("entries_recipe", sql`(${t.kind} = 'recipe') = (${t.recipeId} IS NOT NULL AND ${t.servings} IS NOT NULL)`),
    check("entries_recipe_fields", sql`${t.kind} = 'recipe' OR (${t.recipeId} IS NULL AND ${t.servings} IS NULL)`),
    check("entries_estimate", sql`(${t.kind} = 'estimate') = (${t.name} IS NOT NULL)`),
    check("entries_note", sql`${t.note} IS NULL OR ${t.kind} = 'estimate'`),
    check(
      "entries_portion",
      sql`(${t.portionCount} IS NULL) = (${t.portionUnit} IS NULL AND ${t.portionName} IS NULL) AND (${t.portionUnit} IS NULL OR ${t.portionName} IS NULL) AND (${t.portionId} IS NULL OR ${t.portionCount} IS NOT NULL)`,
    ),
    check(
      "entries_amounts",
      sql`(${t.grams} IS NULL OR ${t.grams} > 0) AND (${t.mealCount} IS NULL OR ${t.mealCount} > 0) AND (${t.portionCount} IS NULL OR ${t.portionCount} > 0) AND (${t.servings} IS NULL OR (${t.servings} > 0 AND ${t.servings} <= 100))`,
    ),
    check(
      "entries_basis",
      sql`${t.basisEnergyKcal} >= 0 AND ${t.basisProteinG} >= 0 AND ${t.basisCarbsG} >= 0 AND ${t.basisFatG} >= 0`,
    ),
    index("entries_user_date_idx").on(t.userId, t.date, t.position),
    // Newest eaten first, ties by position: the order recent items walk.
    index("entries_user_eaten_idx")
      .on(t.userId, t.eatenAt.desc(), t.position.desc())
      .where(sql`${t.eatenAt} IS NOT NULL`),
    index("entries_food_id_idx").on(t.foodId),
    index("entries_saved_meal_id_idx").on(t.savedMealId),
    // A recipe's entries by date: lastPutOn, the rewrite and the use check.
    index("entries_recipe_idx").on(t.recipeId, t.date),
  ],
);
