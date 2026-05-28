import {
  AISLE_CATEGORIES,
  RecipeDraftSchema,
  type RecipeDraft,
} from "@hovi/shared";
import type { ChatMessage } from "../types.js";
import type { LLMTask, LLMTaskParseResult } from "./types.js";

const CATEGORY_LIST = AISLE_CATEGORIES.join(", ");

const SYSTEM_PROMPT = `You parse recipes into structured JSON.

The user supplies a recipe as free-form text. The text may be Finnish. Your output JSON must keep Finnish text Finnish — recipe name, ingredient names, and units stay in their original language.

Return one JSON object only (no prose, no markdown fences) with this shape:
{
  "name": string,
  "time": number,        // total minutes; estimate if not stated
  "servings": number,    // integer; default 4 if not stated
  "category": "common" | "special",  // "common" for everyday meals, "special" for celebratory dishes
  "keepsOvernight": boolean | undefined,  // omit unless the recipe is clearly meal-prep-friendly
  "ingredients": [
    { "name": string, "amount": string, "unit": string, "category": AisleCategory }
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

amount and unit are separate strings ("400" and "g", "1" and "tlk", "2" and "kynttä"). If amount is unclear, use an empty string. Output the JSON object and nothing else.

Jos teksti sisältää valmistusohjeet, palauta ne instructions-kentässä numeroimattomana stringien listana — yksi vaihe per merkkijono, ei markdown-muotoilua. Jos ohjeita ei ole, jätä kenttä pois tai palauta tyhjä lista.`;

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
          amount: { type: "string" },
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
      maxTokens: 2048,
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

      const { confidence, warnings: confWarnings } = computeConfidence(
        result.data,
        text,
      );
      return {
        ok: true,
        value: result.data,
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

function applyDefaults(
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
    if (ing.amount.trim() === "") {
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
