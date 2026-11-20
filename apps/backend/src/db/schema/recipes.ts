import { INGREDIENT_UNITS } from "@hovimestari/types";
import { sql } from "drizzle-orm";
import {
  check,
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
import { users } from "./users.js";

const listOf = (values: readonly string[]) => sql.raw(values.map((v) => `'${v}'`).join(", "));

/**
 * A user's recipe: a dish with lines that point at foods. Its figures are
 * never stored here: they are computed from its counted lines when it is read.
 */
export const recipes = pgTable(
  "recipes",
  {
    // Chosen by the client, so a repeated create applies once.
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    servings: integer("servings").notNull(),
    // Null when not given.
    timeMinutes: integer("time_minutes"),
    // The method, one step per element, in order.
    steps: text("steps")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    notes: text("notes"),
    favouriteAt: timestamp("favourite_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    // Deleted by the user while entries or cooks use it. Invisible everywhere but on those.
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("recipes_name_len", sql`char_length(${t.name}) BETWEEN 1 AND 120`),
    check("recipes_servings", sql`${t.servings} BETWEEN 1 AND 100`),
    check("recipes_time", sql`${t.timeMinutes} IS NULL OR ${t.timeMinutes} BETWEEN 1 AND 1440`),
    check("recipes_steps", sql`cardinality(${t.steps}) <= 40`),
    // The target of the composite keys from the lines and the tags, which tie them to the recipe's owner.
    unique("recipes_id_user_uq").on(t.id, t.userId),
    index("recipes_user_idx").on(t.userId),
  ],
);

/**
 * One line of a recipe. Counted: a food and its grams. Not counted, such as
 * salt: a name, and neither.
 */
export const recipeIngredients = pgTable(
  "recipe_ingredients",
  {
    // Chosen by the client and kept across edits, so a line stays the same line.
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    recipeId: uuid("recipe_id").notNull(),
    // The order on screen, from 0.
    position: integer("position").notNull(),
    // The food is read without the visibility rule, scoped by the recipe's
    // owner, so a line keeps its food when the food is hidden or retired.
    foodId: uuid("food_id").references(() => foods.id, { onDelete: "cascade" }),
    grams: numeric("grams", { precision: 5, scale: 1, mode: "number" }),
    // How the amount was entered, as on an entry: a count of a portion, its
    // label copied. portion_id is a hint with no key, read through the
    // portion rule of entries.portion_id.
    portionId: uuid("portion_id"),
    portionCount: numeric("portion_count", { precision: 5, scale: 2, mode: "number" }),
    portionUnit: text("portion_unit"),
    portionName: text("portion_name"),
    // A line not counted.
    name: text("name"),
    // The amount as the recipe writes it, for display: "2 cloves". Both or neither.
    writtenAmount: numeric("written_amount", { precision: 7, scale: 2, mode: "number" }),
    writtenUnit: text("written_unit"),
    note: text("note"),
  },
  (t) => [
    foreignKey({
      name: "recipe_ingredients_recipe_fk",
      columns: [t.recipeId, t.userId],
      foreignColumns: [recipes.id, recipes.userId],
    }).onDelete("cascade"),
    check(
      "recipe_ingredients_kind",
      sql`(${t.foodId} IS NULL) = (${t.grams} IS NULL) AND (${t.foodId} IS NULL) = (${t.name} IS NOT NULL)`,
    ),
    check(
      "recipe_ingredients_portion",
      sql`(${t.portionCount} IS NULL) = (${t.portionUnit} IS NULL AND ${t.portionName} IS NULL) AND (${t.portionUnit} IS NULL OR ${t.portionName} IS NULL) AND (${t.portionId} IS NULL OR ${t.portionCount} IS NOT NULL)`,
    ),
    check("recipe_ingredients_portion_counted", sql`${t.portionCount} IS NULL OR ${t.foodId} IS NOT NULL`),
    check("recipe_ingredients_grams", sql`${t.grams} IS NULL OR (${t.grams} > 0 AND ${t.grams} <= 5000)`),
    check("recipe_ingredients_count", sql`${t.portionCount} IS NULL OR ${t.portionCount} > 0`),
    check("recipe_ingredients_name_len", sql`${t.name} IS NULL OR char_length(${t.name}) BETWEEN 1 AND 80`),
    check("recipe_ingredients_note_len", sql`${t.note} IS NULL OR char_length(${t.note}) BETWEEN 1 AND 80`),
    check(
      "recipe_ingredients_written",
      sql`(${t.writtenAmount} IS NULL) = (${t.writtenUnit} IS NULL) AND (${t.writtenAmount} IS NULL OR ${t.writtenAmount} > 0)`,
    ),
    check("recipe_ingredients_written_unit", sql`${t.writtenUnit} IN (${listOf(INGREDIENT_UNITS)})`),
    uniqueIndex("recipe_ingredients_position_uq").on(t.recipeId, t.position),
    // A food's own rewrite and its use check find the recipes on it through this.
    index("recipe_ingredients_food_idx").on(t.foodId),
    index("recipe_ingredients_user_idx").on(t.userId),
  ],
);

/** A recipe's tags: the person's own words, each once per recipe without case. */
export const recipeTags = pgTable(
  "recipe_tags",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    recipeId: uuid("recipe_id").notNull(),
    // Trimmed, as typed.
    tag: text("tag").notNull(),
  },
  (t) => [
    foreignKey({
      name: "recipe_tags_recipe_fk",
      columns: [t.recipeId, t.userId],
      foreignColumns: [recipes.id, recipes.userId],
    }).onDelete("cascade"),
    check("recipe_tags_len", sql`char_length(${t.tag}) BETWEEN 1 AND 30`),
    // A tag once per recipe, without case. Postgres takes no expression in a
    // primary key, so this unique index is the table's key.
    uniqueIndex("recipe_tags_uq").on(t.recipeId, sql`lower(${t.tag})`),
    index("recipe_tags_user_idx").on(t.userId),
  ],
);
