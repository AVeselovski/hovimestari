/* eslint-disable @typescript-eslint/naming-convention */
exports.shorthands = undefined;

// Pre-flight: a numeric amount in this codebase is "an integer or decimal,
// optionally negative". Anything else (composite strings like "1 nippu", "n. 400",
// "~2") is rejected loudly — silently dropping suffixes via parseFloat would
// be data loss. The user can re-edit the row by hand and re-run the migration.
const NUMERIC_RE = /^-?\d+(\.\d+)?$/;

function parseAmount(raw, context) {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") {
    if (Number.isNaN(raw)) {
      throw new Error(`amount is NaN at ${context}`);
    }
    return raw;
  }
  if (typeof raw !== "string") {
    throw new Error(
      `amount is neither string nor number at ${context}: ${JSON.stringify(raw)}`,
    );
  }
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  if (!NUMERIC_RE.test(trimmed)) {
    throw new Error(
      `cannot migrate non-numeric amount at ${context}: ${JSON.stringify(raw)}. ` +
        `Edit the row in place (or via the API) to use a plain number, then re-run migrations.`,
    );
  }
  const parsed = Number(trimmed);
  if (Number.isNaN(parsed)) {
    throw new Error(`amount parses to NaN at ${context}: ${JSON.stringify(raw)}`);
  }
  return parsed;
}

function migrateState(state) {
  if (!state || typeof state !== "object") {
    throw new Error("household_state.state is not an object");
  }

  const recipes = Array.isArray(state.recipes) ? state.recipes : [];
  const newRecipes = recipes.map((r, ri) => {
    const ings = Array.isArray(r.ingredients) ? r.ingredients : [];
    const newIngs = ings.map((ing, ii) => ({
      ...ing,
      amount: parseAmount(ing.amount, `recipes[${ri}].ingredients[${ii}] (${r.id ?? "?"} / ${ing.name ?? "?"})`),
    }));
    return { ...r, ingredients: newIngs };
  });

  const staples = Array.isArray(state.staples) ? state.staples : [];
  const newStaples = staples.map((s, si) => ({
    ...s,
    amount: parseAmount(s.amount, `staples[${si}] (${s.id ?? "?"} / ${s.name ?? "?"})`),
  }));

  // Rewrite plan: selectedRecipeIds -> selectedRecipes (with servings looked up).
  const plan = state.plan && typeof state.plan === "object" ? state.plan : {};
  let newPlan;
  if (Array.isArray(plan.selectedRecipes)) {
    // Already migrated — pass through untouched.
    newPlan = { selectedRecipes: plan.selectedRecipes };
  } else {
    const ids = Array.isArray(plan.selectedRecipeIds) ? plan.selectedRecipeIds : [];
    const selectedRecipes = ids
      .map((id) => {
        const r = newRecipes.find((rr) => rr.id === id);
        if (!r) return null;
        const servings = Number.isInteger(r.servings) && r.servings > 0 ? r.servings : 4;
        return { recipeId: id, servings };
      })
      .filter((x) => x !== null);
    newPlan = { selectedRecipes };
  }

  return {
    ...state,
    recipes: newRecipes,
    staples: newStaples,
    plan: newPlan,
  };
}

exports.up = async (pgm) => {
  // Idempotent guard: if the plan already uses the new shape, no-op.
  const { rows } = await pgm.db.query(
    `SELECT state FROM household_state WHERE id = 1`,
  );
  if (rows.length === 0) return;
  const state = rows[0].state;
  if (
    state &&
    typeof state === "object" &&
    state.plan &&
    typeof state.plan === "object" &&
    Array.isArray(state.plan.selectedRecipes) &&
    !Array.isArray(state.plan.selectedRecipeIds)
  ) {
    return;
  }

  const migrated = migrateState(state);
  await pgm.db.query(
    `UPDATE household_state
       SET state = $1::jsonb,
           updated_at = now()
     WHERE id = 1`,
    [JSON.stringify(migrated)],
  );
};

// `down` is best-effort: stringifying numbers and dropping per-recipe servings
// gets the shape close but is not a true inverse — there is no lossless way to
// undo a JSONB transform (we cannot recover the user's original string formatting).
exports.down = async (pgm) => {
  const { rows } = await pgm.db.query(
    `SELECT state FROM household_state WHERE id = 1`,
  );
  if (rows.length === 0) return;
  const state = rows[0].state;
  if (!state || typeof state !== "object") return;

  const stringifyAmount = (a) => (a === null || a === undefined ? "" : String(a));

  const newRecipes = (Array.isArray(state.recipes) ? state.recipes : []).map((r) => ({
    ...r,
    ingredients: (Array.isArray(r.ingredients) ? r.ingredients : []).map((ing) => ({
      ...ing,
      amount: stringifyAmount(ing.amount),
    })),
  }));
  const newStaples = (Array.isArray(state.staples) ? state.staples : []).map((s) => ({
    ...s,
    amount: stringifyAmount(s.amount),
  }));
  const plan = state.plan && typeof state.plan === "object" ? state.plan : {};
  const ids = Array.isArray(plan.selectedRecipes)
    ? plan.selectedRecipes.map((p) => p.recipeId)
    : Array.isArray(plan.selectedRecipeIds)
      ? plan.selectedRecipeIds
      : [];
  const reverted = {
    ...state,
    recipes: newRecipes,
    staples: newStaples,
    plan: { selectedRecipeIds: ids },
  };
  await pgm.db.query(
    `UPDATE household_state
       SET state = $1::jsonb,
           updated_at = now()
     WHERE id = 1`,
    [JSON.stringify(reverted)],
  );
};
