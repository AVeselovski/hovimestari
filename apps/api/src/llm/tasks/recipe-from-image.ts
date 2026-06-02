import { RecipeDraftSchema, type RecipeDraft } from "@hovi/shared";
import type { ChatMessage } from "../types.js";
import type { LLMTask, LLMTaskParseResult } from "./types.js";
import {
  RECIPE_DRAFT_JSON_SCHEMA,
  RECIPE_DRAFT_PROMPT_CORE,
  applyDefaults,
  collapseDuplicateIngredients,
  computeConfidence,
  stripJsonFences,
} from "./recipe-from-text.js";

const IMAGE_PROMPT_PREAMBLE = `You are looking at a photograph of a recipe — likely a cookbook page, handwritten card, or printed sheet. OCR the visible text first, then structure it. If a field is not visible, omit or use the documented default.

`;

const SYSTEM_PROMPT = IMAGE_PROMPT_PREAMBLE + RECIPE_DRAFT_PROMPT_CORE;

const USER_INSTRUCTION = "Parse the recipe in the attached image.";

export function recipeFromImageTask(): LLMTask<RecipeDraft> {
  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: USER_INSTRUCTION },
  ];

  return {
    name: "recipe-from-image",
    messages,
    opts: {
      temperature: 0.2,
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
        "",
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
