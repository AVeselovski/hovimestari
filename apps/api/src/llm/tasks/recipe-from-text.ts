import {
  AISLE_CATEGORIES,
  RecipeDraftSchema,
  type Ingredient,
  type RecipeDraft,
} from "@hovi/shared";
import type { ChatMessage } from "../types.js";
import type { LLMTask, LLMTaskParseResult } from "./types.js";

const CATEGORY_LIST = AISLE_CATEGORIES.join(", ");

export const RECIPE_DRAFT_PROMPT_CORE = `You parse recipes into structured JSON.

The recipe text may be Finnish. Your output JSON must keep Finnish text Finnish — recipe name, ingredient names, and units stay in their original language.

Return one JSON object only (no prose, no markdown fences) with this shape:
{
  "name": string,
  "time": number,        // total minutes; estimate if not stated
  "servings": number,    // integer; default 4 if not stated
  "category": "common" | "special",  // "common" for everyday meals, "special" for celebratory dishes
  "keepsOvernight": boolean | undefined,  // omit unless the recipe is clearly meal-prep-friendly
  "ingredients": [
    { "name": string, "amount": number | null, "unit": string, "category": AisleCategory }
  ]
}

AisleCategory is one of: ${CATEGORY_LIST}.

Guidance:
- "produce" = fruit, vegetables, fresh herbs.
- "bakery" = bread, pastries.
- "meat-fish" = meat, fish, deli proteins.
- "dairy" = milk, cheese, yogurt, eggs, butter.
- "frozen" = items typically sold frozen.
- "pantry" = dry goods, oils, spices, canned goods, pasta, rice.
- "drinks" = beverages including wine.
- "other" = anything that does not fit above.

amount is a JSON number (e.g. 400, 1, 2, 0.5) or null when the recipe gives no countable quantity (a pinch of salt, "to taste", garnish). unit is a separate string ("g", "tlk", "kynttä"). Never put units into amount, never use strings like "n. 400" or "1 nippu" — split them: amount: 1, unit: "nippu". Output the JSON object and nothing else.

Ingredient-name canonicalization (the name is what gets searched in a grocery store, so keep it clean):
- Strip retailer brand prefixes: "Pirkka tomaattimurska" → "tomaattimurska", "Atria broileri" → "broileri", "Saarioinen lihapullat" → "lihapullat".
- Strip parentheticals that describe form, packaging, or preparation: "oliivit (kivettömät)" → "oliivit", "sipulikuutiot (pakaste)" → "sipulikuutiot", "tonnikala (vedessä)" → "tonnikala". The form may be useful but it's not part of the searchable name.
- Use Finnish nominative case, plural where natural: "oliivit" not "oliiveja", "tomaatit" not "tomaatteja", "porkkanat" not "porkkanaa".
- Keep "X tai Y" (either/or) constructs intact as one ingredient — do not split them into two rows: "mustat tai vihreät oliivit" stays as written.
- If the same ingredient (same name and unit) appears in multiple sections of the recipe (e.g. öljy listed once under "kastike" and once under "marinadi"), emit a single row with the summed amount. Sections in the source describe cooking order, not separate shopping items.

If the text includes preparation instructions, return them in the "instructions" field as a flat list of strings — one step per string, no numbering, no markdown. Keep the original language (Finnish stays Finnish). If no instructions are present, omit the field or return an empty list.`;

const SYSTEM_PROMPT = RECIPE_DRAFT_PROMPT_CORE;

export const RECIPE_DRAFT_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["name", "time", "servings", "category", "ingredients"],
  properties: {
    name: { type: "string" },
    time: { type: "number" },
    servings: { type: "number" },
    category: { type: "string", enum: ["common", "special"] },
    keepsOvernight: { type: "boolean" },
    ingredients: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "amount", "unit", "category"],
        properties: {
          name: { type: "string" },
          amount: { type: ["number", "null"] },
          unit: { type: "string" },
          category: { type: "string", enum: [...AISLE_CATEGORIES] },
        },
      },
    },
    instructions: {
      type: "array",
      items: { type: "string" },
    },
  },
};

export function recipeFromTextTask(text: string): LLMTask<RecipeDraft> {
  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: text },
  ];

  return {
    name: "recipe-from-text",
    messages,
    opts: {
      temperature: 0.1,
      maxTokens: 4096,
      responseSchema: {
        name: "recipe_draft",
        schema: RECIPE_DRAFT_JSON_SCHEMA,
      },
    },
    parse: (raw: string): LLMTaskParseResult<RecipeDraft> => {
      const cleaned = stripJsonFences(raw).trim();
      if (cleaned.length === 0) {
        return { ok: false, error: "empty response" };
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(cleaned);
      } catch (err) {
        return { ok: false, error: `invalid JSON: ${(err as Error).message}` };
      }

      const warnings: string[] = [];
      const draftCandidate = applyDefaults(parsed, warnings);
      const result = RecipeDraftSchema.safeParse(draftCandidate);
      if (!result.success) {
        return {
          ok: false,
          error: `schema mismatch: ${result.error.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; ")}`,
        };
      }

      const collapsed = {
        ...result.data,
        ingredients: collapseDuplicateIngredients(result.data.ingredients),
      };
      const { confidence, warnings: confWarnings } = computeConfidence(
        collapsed,
        text,
      );
      return {
        ok: true,
        value: collapsed,
        confidence,
        warnings: [...warnings, ...confWarnings],
      };
    },
  };
}

export function stripJsonFences(raw: string): string {
  let s = raw.trim();
  if (s.startsWith("```")) {
    s = s.replace(/^```(?:json)?\s*\n?/i, "");
    s = s.replace(/\n?```\s*$/, "");
  }
  return s;
}

export function applyDefaults(
  parsed: unknown,
  warnings: string[],
): Record<string, unknown> {
  const obj =
    parsed !== null && typeof parsed === "object"
      ? { ...(parsed as Record<string, unknown>) }
      : ({} as Record<string, unknown>);
  if (obj.servings === undefined || obj.servings === null) {
    obj.servings = 4;
    warnings.push("Annoskoko oletettu: 4");
  }
  if (obj.time === undefined || obj.time === null) {
    obj.time = 30;
    warnings.push("Valmistusaika oletettu: 30 min");
  }
  if (obj.category === undefined || obj.category === null) {
    obj.category = "common";
    warnings.push("Kategoria oletettu: Arki");
  }
  if (obj.ingredients === undefined || obj.ingredients === null) {
    obj.ingredients = [];
  }
  if (obj.name === undefined || obj.name === null) {
    obj.name = "";
  }
  return obj;
}

export function computeConfidence(
  draft: RecipeDraft,
  sourceText: string,
): { confidence: number; warnings: string[] } {
  const warnings: string[] = [];
  let score = 1;

  if (draft.ingredients.length === 0) {
    score -= 0.5;
    warnings.push("Reseptistä ei löytynyt aineksia");
  }

  let missingAmountPenalty = 0;
  let missingAmounts = 0;
  for (const ing of draft.ingredients) {
    // Strict null check: 0 is a valid scaled amount, only `null` means
    // "the recipe specifies no countable quantity".
    if (ing.amount === null) {
      missingAmounts++;
      missingAmountPenalty = Math.min(0.4, missingAmountPenalty + 0.2);
    }
  }
  if (missingAmounts > 0) {
    warnings.push(`Määrä puuttuu ${missingAmounts} aineksesta`);
    score -= missingAmountPenalty;
  }

  if (draft.name.trim() === "") {
    score -= 0.2;
    warnings.push("Reseptin nimi puuttuu");
  }

  if (draft.time === 30 && /\d/.test(sourceText)) {
    score -= 0.1;
  }

  return {
    confidence: Math.max(0, Math.min(1, score)),
    warnings,
  };
}

// Collapses duplicate ingredients sharing a normalized (name, unit) key by
// summing numeric amounts. Normalization is intentionally shallow: it lowercases
// and trims, but does not unify abbreviations (e.g. "rkl" vs "rkl." vs
// "ruokalusikka") nor convert units (dl ↔ rkl). Those richer normalizations
// would risk merging things that shouldn't merge.
export function collapseDuplicateIngredients(
  ingredients: Ingredient[],
): Ingredient[] {
  const byKey = new Map<string, Ingredient>();
  const order: string[] = [];
  for (const ing of ingredients) {
    const key = `${ing.name.trim().toLowerCase()}::${ing.unit.trim().toLowerCase()}`;
    const prior = byKey.get(key);
    if (!prior) {
      byKey.set(key, { ...ing });
      order.push(key);
      continue;
    }
    let amount: number | null;
    if (prior.amount === null && ing.amount === null) amount = null;
    else if (prior.amount === null) amount = ing.amount;
    else if (ing.amount === null) amount = prior.amount;
    else amount = Math.round((prior.amount + ing.amount) * 100) / 100;
    byKey.set(key, { ...prior, amount });
  }
  return order.map((k) => byKey.get(k)!);
}
