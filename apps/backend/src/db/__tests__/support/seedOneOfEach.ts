import { randomBytes, randomUUID } from "node:crypto";
import type pg from "pg";

/**
 * The user-owned tables `seedOneOfEach` fills. A step that adds a user-owned
 * table adds it here and seeds a row of it below. userCascade.db.test.ts fails
 * while the cascade graph reaches a table this list does not name.
 */
export const SEEDED_TABLES = [
  "assistant_changes",
  "assistant_connections",
  "entries",
  "food_favourites",
  "food_lookups",
  "food_portions",
  "foods",
  "password_reset_tokens",
  "recipe_ingredients",
  "recipe_tags",
  "recipes",
  "refresh_tokens",
  "removed_entries",
  "saved_meals",
  "target_changes",
] as const;

const hash = () => randomBytes(32).toString("hex");
const inAWeek = () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

/** One row in every user-owned table for `userId`. */
export async function seedOneOfEach(client: pg.Client, userId: string): Promise<void> {
  await client.query("INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)", [
    userId,
    hash(),
    inAWeek(),
  ]);
  await client.query("INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)", [
    userId,
    hash(),
    inAWeek(),
  ]);
  const connection = await client.query(
    "INSERT INTO assistant_connections (user_id, name, key_hash, access, expires_at) VALUES ($1, 'Cascade key', $2, 'read_write', $3) RETURNING id",
    [userId, hash(), inAWeek()],
  );
  await client.query(
    `INSERT INTO assistant_changes (user_id, connection_id, connection_name, action, entity_ids, summary, request_key, request_hash)
     VALUES ($1, $2, 'Cascade key', 'entries.removed', ARRAY[gen_random_uuid()], '{"entity": "entries", "entries": [], "toDate": null}', $3, $4)`,
    [userId, connection.rows[0].id, `cascade_${randomUUID()}`, hash()],
  );
  await client.query(
    `INSERT INTO target_changes (user_id, effective_from, energy_kcal_lower, energy_kcal_upper, protein_g_lower, protein_g_upper)
     VALUES ($1, '2026-01-01', 1, 2, 1, 2)`,
    [userId],
  );
  const { rows } = await client.query(
    `INSERT INTO foods (source, user_id, name, energy_kcal, protein_g, carbs_g, fat_g)
     VALUES ('user', $1, 'Cascade food', 1, 1, 1, 1) RETURNING id`,
    [userId],
  );
  const foodId = rows[0].id as string;
  await client.query("INSERT INTO food_portions (food_id, user_id, name, grams) VALUES ($1, $2, 'one', 10)", [
    foodId,
    userId,
  ]);
  await client.query("INSERT INTO food_favourites (user_id, food_id) VALUES ($1, $2)", [userId, foodId]);
  // A stored Open Food Facts product has no owner. The user's lookup of it is theirs.
  const off = await client.query(
    `INSERT INTO foods (source, name, energy_kcal, protein_g, carbs_g, fat_g, barcode)
     VALUES ('open_food_facts', 'Cascade product', 1, 1, 1, 1, $1) RETURNING id`,
    [String(randomBytes(6).readUIntBE(0, 6)).padStart(13, "9").slice(0, 13)],
  );
  await client.query("INSERT INTO food_lookups (user_id, food_id) VALUES ($1, $2)", [userId, off.rows[0].id]);
  // One saved meal and one entry of it: the deletion test expects one row per table per user.
  const meal = await client.query(
    `INSERT INTO saved_meals (user_id, name, energy_kcal, protein_g, carbs_g, fat_g)
     VALUES ($1, 'Cascade meal', 600, 40, 60, 20) RETURNING id`,
    [userId],
  );
  await insertMealEntry(client, userId, meal.rows[0].id as string);
  // One recipe, with one line on the user's own food and one tag.
  const recipe = await client.query(
    "INSERT INTO recipes (user_id, name, servings) VALUES ($1, 'Cascade recipe', 2) RETURNING id",
    [userId],
  );
  await client.query(
    "INSERT INTO recipe_ingredients (id, user_id, recipe_id, position, food_id, grams) VALUES (gen_random_uuid(), $1, $2, 0, $3, 100)",
    [userId, recipe.rows[0].id, foodId],
  );
  await client.query("INSERT INTO recipe_tags (user_id, recipe_id, tag) VALUES ($1, $2, 'Cascade')", [
    userId,
    recipe.rows[0].id,
  ]);
  await client.query(
    `INSERT INTO removed_entries (id, user_id, row) VALUES (gen_random_uuid(), $1, '{"kind": "estimate"}')`,
    [userId],
  );
}

/** A planned entry of saved meal `mealId` on 2026-01-01, one meal. Answers its id. */
export async function insertMealEntry(client: pg.Client, userId: string, mealId: string): Promise<string> {
  const { rows } = await client.query(
    `INSERT INTO entries (user_id, date, status, kind, saved_meal_id, meal_count,
       basis_energy_kcal, basis_protein_g, basis_carbs_g, basis_fat_g)
     VALUES ($1, '2026-01-01', 'planned', 'saved_meal', $2, 1, 600, 40, 60, 20) RETURNING id`,
    [userId, mealId],
  );
  return rows[0].id as string;
}

/** An eaten entry of food `foodId` on 2026-01-01, at `grams`. Answers its id. */
export async function insertFoodEntry(client: pg.Client, userId: string, foodId: string, grams = 100): Promise<string> {
  const { rows } = await client.query(
    `INSERT INTO entries (user_id, date, status, eaten_at, kind, food_id, grams,
       basis_energy_kcal, basis_protein_g, basis_carbs_g, basis_fat_g)
     VALUES ($1, '2026-01-01', 'eaten', now(), 'food', $2, $3, 59.31, 10.5, 3.6, 0.2) RETURNING id`,
    [userId, foodId, grams],
  );
  return rows[0].id as string;
}

/** A Fineli food with one Fineli portion, owned by nobody. Answers its id. */
export async function insertFineliFood(client: pg.Client, fineliId: number): Promise<string> {
  const { rows } = await client.query(
    `INSERT INTO foods (source, fineli_id, name, name_en, energy_kcal, protein_g, carbs_g, fat_g, fineli_type, fineli_process)
     VALUES ('fineli', $1, $2, $3, 59.31, 10.5, 3.6, 0.2, 'FOOD', 'IND') RETURNING id`,
    [fineliId, `Rahka ${fineliId}`, `Quark ${fineliId}`],
  );
  const foodId = rows[0].id as string;
  await client.query("INSERT INTO food_portions (food_id, fineli_unit, grams) VALUES ($1, 'PORTM', 200)", [foodId]);
  return foodId;
}

/** A user with a sign-in method, made directly in the database. */
export async function insertUser(client: pg.Client): Promise<string> {
  const { rows } = await client.query("INSERT INTO users (email, google_id) VALUES ($1, $2) RETURNING id", [
    `cascade-${randomUUID()}@example.com`,
    `google-${randomUUID()}`,
  ]);
  return rows[0].id as string;
}
