/* eslint-disable @typescript-eslint/naming-convention */
exports.shorthands = undefined;

// Pre-flight: a numeric amount in this codebase is "an integer or decimal,
// optionally negative". Unicode vulgar fractions (½, ¼, ¾, …) and mixed
// numbers (1½) are also accepted and converted to decimals. Anything else
// (composite strings like "1 nippu", "n. 400", "~2") is rejected loudly —
// silently dropping suffixes via parseFloat would be data loss. The user can
// re-edit the row by hand and re-run the migration.
const NUMERIC_RE = /^-?\d+(\.\d+)?$/;

const VULGAR_FRACTIONS = {
  "½": 0.5,
  "⅓": 1 / 3,
  "⅔": 2 / 3,
  "¼": 0.25,
  "¾": 0.75,
  "⅕": 0.2,
  "⅖": 0.4,
  "⅗": 0.6,
  "⅘": 0.8,
  "⅙": 1 / 6,
  "⅚": 5 / 6,
  "⅛": 0.125,
  "⅜": 0.375,
  "⅝": 0.625,
  "⅞": 0.875,
};

// Matches an optional integer part followed by a Unicode vulgar fraction, e.g. "1½" or "½"
const MIXED_FRACTION_RE = /^(\d+)?([\u00BC-\u00BE\u2150-\u215E])$/;

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

  // Plain integer or decimal
  if (NUMERIC_RE.test(trimmed)) {
    const parsed = Number(trimmed);
    if (Number.isNaN(parsed)) {
      throw new Error(`amount parses to NaN at ${context}: ${JSON.stringify(raw)}`);
    }
    return parsed;
  }

  // Unicode vulgar fraction, optionally preceded by an integer (e.g. "½", "1½")
  const mixedMatch = trimmed.match(MIXED_FRACTION_RE);
  if (mixedMatch) {
    const fractionChar = mixedMatch[2];
    if (fractionChar in VULGAR_FRACTIONS) {
      const whole = mixedMatch[1] ? parseInt(mixedMatch[1], 10) : 0;
      return whole + VULGAR_FRACTIONS[fractionChar];
    }
  }

  throw new Error(
    `cannot migrate non-numeric amount at ${context}: ${JSON.stringify(raw)}. ` +
      `Edit the row in place (or via the API) to use a plain number, then re-run migrations.`,
  );
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
