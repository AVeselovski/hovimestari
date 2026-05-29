import type { FastifyBaseLogger } from "fastify";
import { AnthropicProvider } from "./anthropic.js";
import { LMStudioProvider } from "./lmstudio.js";
import { Router, type ForcedProvider } from "./router.js";

export {
  Router,
  NoProvidersConfiguredError,
  ForcedProviderUnavailableError,
  LLMTaskFailedError,
  NoVisionProviderError,
} from "./router.js";
export { recipeFromTextTask } from "./tasks/recipe-from-text.js";
export { recipeFromImageTask } from "./tasks/recipe-from-image.js";
export type { LLMProvider, VisionImage, SupportedImageMediaType } from "./types.js";
export { LLMUnavailableError } from "./types.js";

export function buildRouterFromEnv(logger: FastifyBaseLogger): Router {
  const anthropicKey = process.env.ANTHROPIC_API_KEY?.trim();
  const anthropicModel =
    process.env.ANTHROPIC_MODEL?.trim() || "claude-sonnet-4-6";
  const lmstudioBase = process.env.LMSTUDIO_BASE_URL?.trim();
  const lmstudioModel = process.env.LMSTUDIO_MODEL?.trim() || "local-model";
  const forcedRaw = process.env.HOVI_FORCE_PROVIDER?.trim().toLowerCase();
  const forced: ForcedProvider =
    forcedRaw === "anthropic" || forcedRaw === "local" ? forcedRaw : null;

  const anthropic =
    anthropicKey !== undefined && anthropicKey.length > 0
      ? new AnthropicProvider({
          apiKey: anthropicKey,
          model: anthropicModel,
          logger,
        })
      : null;

  const local =
    lmstudioBase !== undefined && lmstudioBase.length > 0
      ? new LMStudioProvider({
          baseUrl: lmstudioBase,
          model: lmstudioModel,
          logger,
        })
      : null;

  return new Router({ local, anthropic, logger, forcedProvider: forced });
}
