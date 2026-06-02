import type { FastifyInstance } from "fastify";
import {
  RecipeImageImportRequestSchema,
  RecipeImportRequestSchema,
  type RecipeImportResponse,
} from "@hovi/shared";
import {
  ForcedProviderUnavailableError,
  LLMTaskFailedError,
  NoProvidersConfiguredError,
  NoVisionProviderError,
  recipeFromImageTask,
  recipeFromTextTask,
  type Router,
} from "../llm/index.js";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export type RecipesRoutesOpts = { router: Router };

export async function recipesRoutes(
  app: FastifyInstance,
  opts: RecipesRoutesOpts,
): Promise<void> {
  const { router } = opts;

  app.post("/recipes/from-text", async (req, reply) => {
    const parsed = RecipeImportRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: "invalid body", issues: parsed.error.issues };
    }

    if (!router.hasAnyProvider()) {
      reply.code(503);
      return { error: "no_llm_provider_configured" };
    }

    try {
      const result = await router.run(recipeFromTextTask(parsed.data.text));
      const body: RecipeImportResponse = {
        draft: result.value,
        confidence: result.confidence,
        warnings: result.warnings,
        provider: result.provider,
        model: result.model,
        fallback: result.fallback,
      };
      return body;
    } catch (err) {
      if (err instanceof ForcedProviderUnavailableError) {
        reply.code(503);
        return {
          error: "forced_provider_unavailable",
          forced: err.forced,
          detail: err.message,
        };
      }
      if (err instanceof NoProvidersConfiguredError) {
        reply.code(503);
        return { error: "no_llm_provider_configured" };
      }
      if (err instanceof LLMTaskFailedError) {
        reply.code(502);
        return { error: "llm_failed", attempts: err.attempts };
      }
      app.log.error(err, "recipe import unexpected error");
      reply.code(502);
      return { error: "llm_failed", detail: (err as Error).message };
    }
  });

  app.post(
    "/recipes/from-image",
    { bodyLimit: 7 * 1024 * 1024 },
    async (req, reply) => {
      const parsed = RecipeImageImportRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        reply.code(400);
        return { error: "invalid body", issues: parsed.error.issues };
      }

      if (!router.hasAnyProvider()) {
        reply.code(503);
        return { error: "no_llm_provider_configured" };
      }

      let buffer: Buffer;
      try {
        buffer = Buffer.from(parsed.data.image.data, "base64");
      } catch {
        reply.code(400);
        return { error: "invalid_image_data" };
      }
      if (buffer.length === 0) {
        reply.code(400);
        return { error: "invalid_image_data" };
      }
      if (buffer.length > MAX_IMAGE_BYTES) {
        reply.code(400);
        return { error: "image_too_large" };
      }

      try {
        const result = await router.runVision(recipeFromImageTask(), {
          data: buffer,
          mediaType: parsed.data.image.mediaType,
        });
        const body: RecipeImportResponse = {
          draft: result.value,
          confidence: result.confidence,
          warnings: result.warnings,
          provider: result.provider,
          model: result.model,
          fallback: result.fallback,
        };
        return body;
      } catch (err) {
        if (err instanceof ForcedProviderUnavailableError) {
          reply.code(503);
          return {
            error: "forced_provider_unavailable",
            forced: err.forced,
            detail: err.message,
          };
        }
        if (err instanceof NoVisionProviderError) {
          reply.code(503);
          return { error: "no_vision_provider_configured" };
        }
        if (err instanceof NoProvidersConfiguredError) {
          reply.code(503);
          return { error: "no_llm_provider_configured" };
        }
        if (err instanceof LLMTaskFailedError) {
          reply.code(502);
          return { error: "llm_failed", attempts: err.attempts };
        }
        app.log.error(err, "recipe image import unexpected error");
        reply.code(502);
        return { error: "llm_failed", detail: (err as Error).message };
      }
    },
  );
}
