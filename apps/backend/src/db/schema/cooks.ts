import { INGREDIENT_UNITS } from "@hovimestari/types";
import { sql } from "drizzle-orm";
import {
  check,
  date,
  foreignKey,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { foods } from "./foods.js";
import { recipes } from "./recipes.js";
import { users } from "./users.js";

const listOf = (values: readonly string[]) => sql.raw(values.map((v) => `'${v}'`).join(", "));

/**
 * One batch made from a recipe on one occasion, logged as made: its own lines
 * and the servings it gave. The recipe stays as written. Its basis, one
 * serving at the precision an entry stores, is computed from its lines and
 * their foods when the cook is made, and every entry from it carries the same
 * basis. Nothing rewrites it but a correction of the cook itself. It lives while an entry, or an
 * entry removed in the last ten minutes, names it. The purge after a removal
 * deletes it once neither does.
 */
export const cooks = pgTable(
  "cooks",
  {
    // Chosen by the client, so a repeated request applies once.
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    recipeId: uuid("recipe_id").notNull(),
    // The day it was made.
    date: date("date", { mode: "string" }).notNull(),
    // What this batch gave, a whole number from 1 to 100.
    servings: integer("servings").notNull(),
    // One serving, as every entry from it stores it. Kept here so an entry
    // added from the cook later takes the same basis, whatever its foods
    // became since.
    basisEnergyKcal: numeric("basis_energy_kcal", { precision: 7, scale: 2, mode: "number" }).notNull(),
    basisProteinG: numeric("basis_protein_g", { precision: 7, scale: 3, mode: "number" }).notNull(),
    basisCarbsG: numeric("basis_carbs_g", { precision: 7, scale: 3, mode: "number" }).notNull(),
    basisFatG: numeric("basis_fat_g", { precision: 7, scale: 3, mode: "number" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "cooks_recipe_fk",
      columns: [t.recipeId, t.userId],
      foreignColumns: [recipes.id, recipes.userId],
    }).onDelete("cascade"),
    check("cooks_servings", sql`${t.servings} BETWEEN 1 AND 100`),
    check(
      "cooks_basis",
      sql`${t.basisEnergyKcal} >= 0 AND ${t.basisProteinG} >= 0 AND ${t.basisCarbsG} >= 0 AND ${t.basisFatG} >= 0`,
    ),
    // The target of the lines' key, which ties a line to the cook's owner.
    unique("cooks_id_user_uq").on(t.id, t.userId),
    // The target of the entry's three-column key: an entry's cook is of the entry's recipe and user.
    unique("cooks_id_recipe_user_uq").on(t.id, t.recipeId, t.userId),
    index("cooks_recipe_idx").on(t.recipeId),
    index("cooks_user_idx").on(t.userId),
  ],
);

/**
 * One line of a cook, as the batch had it: every column of a recipe line,
 * with the cook in place of the recipe, and the recipe line it started as.
 */
export const cookIngredients = pgTable(
  "cook_ingredients",
  {
    // Chosen by the client.
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    cookId: uuid("cook_id").notNull(),
    // The order on screen, from 0.
    position: integer("position").notNull(),
    // A hint with no key: the recipe line this line started as, null on a line
    // the batch added. Read only to say what the batch changed, never for figures.
    fromLineId: uuid("from_line_id"),
    // As on a recipe line: read without the visibility rule, so a line keeps a
    // food hidden or retired since. An own food on a cook's line is hidden,
    // never deleted, so this cascade never runs for one.
    foodId: uuid("food_id").references(() => foods.id, { onDelete: "cascade" }),
    grams: numeric("grams", { precision: 5, scale: 1, mode: "number" }),
    portionId: uuid("portion_id"),
    portionCount: numeric("portion_count", { precision: 5, scale: 2, mode: "number" }),
    portionUnit: text("portion_unit"),
    portionName: text("portion_name"),
    name: text("name"),
    writtenAmount: numeric("written_amount", { precision: 7, scale: 2, mode: "number" }),
    writtenUnit: text("written_unit"),
    note: text("note"),
  },
  (t) => [
    foreignKey({
      name: "cook_ingredients_cook_fk",
      columns: [t.cookId, t.userId],
      foreignColumns: [cooks.id, cooks.userId],
    }).onDelete("cascade"),
    check(
      "cook_ingredients_kind",
      sql`(${t.foodId} IS NULL) = (${t.grams} IS NULL) AND (${t.foodId} IS NULL) = (${t.name} IS NOT NULL)`,
    ),
    check(
      "cook_ingredients_portion",
      sql`(${t.portionCount} IS NULL) = (${t.portionUnit} IS NULL AND ${t.portionName} IS NULL) AND (${t.portionUnit} IS NULL OR ${t.portionName} IS NULL) AND (${t.portionId} IS NULL OR ${t.portionCount} IS NOT NULL)`,
    ),
    check("cook_ingredients_portion_counted", sql`${t.portionCount} IS NULL OR ${t.foodId} IS NOT NULL`),
    check("cook_ingredients_grams", sql`${t.grams} IS NULL OR (${t.grams} > 0 AND ${t.grams} <= 5000)`),
    check("cook_ingredients_count", sql`${t.portionCount} IS NULL OR ${t.portionCount} > 0`),
    check("cook_ingredients_name_len", sql`${t.name} IS NULL OR char_length(${t.name}) BETWEEN 1 AND 80`),
    check("cook_ingredients_note_len", sql`${t.note} IS NULL OR char_length(${t.note}) BETWEEN 1 AND 80`),
    check(
      "cook_ingredients_written",
      sql`(${t.writtenAmount} IS NULL) = (${t.writtenUnit} IS NULL) AND (${t.writtenAmount} IS NULL OR ${t.writtenAmount} > 0)`,
    ),
    check("cook_ingredients_written_unit", sql`${t.writtenUnit} IN (${listOf(INGREDIENT_UNITS)})`),
    uniqueIndex("cook_ingredients_position_uq").on(t.cookId, t.position),
    // A food's use check finds the cooks on it through this.
    index("cook_ingredients_food_idx").on(t.foodId),
    index("cook_ingredients_user_idx").on(t.userId),
  ],
);
