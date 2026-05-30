import type { FastifyBaseLogger } from "fastify";
import {
  LLMUnavailableError,
  type LLMProvider,
  type VisionImage,
} from "./types.js";
import type { LLMTask } from "./tasks/types.js";

export type ForcedProvider = "anthropic" | "local" | null;

export type RouterRunResult<T> = {
  value: T;
  confidence: number;
  warnings: string[];
  provider: string;
  model: string;
};

export type RouterOpts = {
  local: LLMProvider | null;
  anthropic: LLMProvider | null;
  logger: FastifyBaseLogger;
  forcedProvider?: ForcedProvider;
  confidenceThreshold?: number;
};

export class NoProvidersConfiguredError extends Error {
  constructor(message = "no LLM providers configured") {
    super(message);
    this.name = "NoProvidersConfiguredError";
  }
}

export class ForcedProviderUnavailableError extends NoProvidersConfiguredError {
  readonly forced: "anthropic" | "local";
  constructor(forced: "anthropic" | "local") {
    super(`forced provider '${forced}' is not configured`);
    this.name = "ForcedProviderUnavailableError";
    this.forced = forced;
  }
}

export class NoVisionProviderError extends NoProvidersConfiguredError {
  constructor(message = "no LLM provider with vision support configured") {
    super(message);
    this.name = "NoVisionProviderError";
  }
}

export class LLMTaskFailedError extends Error {
  readonly attempts: Array<{ provider: string; error: string }>;
  constructor(attempts: Array<{ provider: string; error: string }>) {
    super(
      `task failed across providers: ${attempts
        .map((a) => `${a.provider}: ${a.error}`)
        .join("; ")}`,
    );
    this.name = "LLMTaskFailedError";
    this.attempts = attempts;
  }
}

export class Router {
  private readonly local: LLMProvider | null;
  private readonly anthropic: LLMProvider | null;
  private readonly logger: FastifyBaseLogger;
  private readonly forced: ForcedProvider;
  private readonly threshold: number;

  constructor(opts: RouterOpts) {
    this.local = opts.local;
    this.anthropic = opts.anthropic;
    this.logger = opts.logger;
    this.forced = opts.forcedProvider ?? null;
    this.threshold = opts.confidenceThreshold ?? 0.6;
  }

  hasAnyProvider(): boolean {
    return this.local !== null || this.anthropic !== null;
  }

  async run<T>(task: LLMTask<T>): Promise<RouterRunResult<T>> {
    if (!this.hasAnyProvider()) throw new NoProvidersConfiguredError();

    const order = this.providerOrder();
    if (order.length === 0 && this.forced !== null) {
      throw new ForcedProviderUnavailableError(this.forced);
    }
    const attempts: Array<{ provider: string; error: string }> = [];
    let lastLowConfidence: RouterRunResult<T> | null = null;

    for (const provider of order) {
      try {
        const res = await provider.chat(task.messages, task.opts);
        const parsed = task.parse(res.content);
        if (!parsed.ok) {
          attempts.push({ provider: provider.name, error: parsed.error });
          this.logger.warn(
            { provider: provider.name, task: task.name, error: parsed.error },
            "llm parse failed",
          );
          continue;
        }
        const result: RouterRunResult<T> = {
          value: parsed.value,
          confidence: parsed.confidence,
          warnings: parsed.warnings,
          provider: provider.name,
          model: res.model,
        };
        if (parsed.confidence >= this.threshold) {
          return result;
        }
        // Low confidence: remember it, but try next provider if any.
        lastLowConfidence = result;
        attempts.push({
          provider: provider.name,
          error: `low confidence ${parsed.confidence.toFixed(2)}`,
        });
        this.logger.info(
          {
            provider: provider.name,
            task: task.name,
            confidence: parsed.confidence,
          },
          "low confidence, trying fallback",
        );
      } catch (err) {
        const msg =
          err instanceof LLMUnavailableError
            ? `unavailable: ${err.message}`
            : `error: ${(err as Error).message}`;
        attempts.push({ provider: provider.name, error: msg });
        this.logger.warn(
          { provider: provider.name, task: task.name, error: msg },
          "llm call failed",
        );
      }
    }

    if (lastLowConfidence !== null) {
      return lastLowConfidence;
    }
    throw new LLMTaskFailedError(attempts);
  }

  async runVision<T>(
    task: LLMTask<T>,
    image: VisionImage,
  ): Promise<RouterRunResult<T>> {
    if (!this.hasAnyProvider()) throw new NoProvidersConfiguredError();

    const baseOrder = this.visionProviderOrder();
    if (baseOrder.length === 0 && this.forced !== null) {
      throw new ForcedProviderUnavailableError(this.forced);
    }

    if (this.forced !== null) {
      const forcedProvider = baseOrder[0];
      if (forcedProvider !== undefined && forcedProvider.vision === undefined) {
        throw new ForcedProviderUnavailableError(this.forced);
      }
    }

    const order = baseOrder.filter((p) => p.vision !== undefined);
    if (order.length === 0) {
      throw new NoVisionProviderError();
    }

    const attempts: Array<{ provider: string; error: string }> = [];
    let lastLowConfidence: RouterRunResult<T> | null = null;

    for (const provider of order) {
      try {
        const visionFn = provider.vision;
        if (visionFn === undefined) continue;
        const res = await visionFn.call(
          provider,
          image,
          task.messages,
          task.opts,
        );
        const parsed = task.parse(res.content);
        if (!parsed.ok) {
          attempts.push({ provider: provider.name, error: parsed.error });
          this.logger.warn(
            { provider: provider.name, task: task.name, error: parsed.error },
            "llm vision parse failed",
          );
          continue;
        }
        const result: RouterRunResult<T> = {
          value: parsed.value,
          confidence: parsed.confidence,
          warnings: parsed.warnings,
          provider: provider.name,
          model: res.model,
        };
        if (parsed.confidence >= this.threshold) {
          return result;
        }
        lastLowConfidence = result;
        attempts.push({
          provider: provider.name,
          error: `low confidence ${parsed.confidence.toFixed(2)}`,
        });
        this.logger.info(
          {
            provider: provider.name,
            task: task.name,
            confidence: parsed.confidence,
          },
          "low confidence, trying vision fallback",
        );
      } catch (err) {
        const msg =
          err instanceof LLMUnavailableError
            ? `unavailable: ${err.message}`
            : `error: ${(err as Error).message}`;
        attempts.push({ provider: provider.name, error: msg });
        this.logger.warn(
          { provider: provider.name, task: task.name, error: msg },
          "llm vision call failed",
        );
      }
    }

    if (lastLowConfidence !== null) {
      return lastLowConfidence;
    }
    throw new LLMTaskFailedError(attempts);
  }

  private providerOrder(): LLMProvider[] {
    if (this.forced === "anthropic") {
      return this.anthropic !== null ? [this.anthropic] : [];
    }
    if (this.forced === "local") {
      return this.local !== null ? [this.local] : [];
    }
    const order: LLMProvider[] = [];
    if (this.local !== null) order.push(this.local);
    if (this.anthropic !== null) order.push(this.anthropic);
    return order;
  }

  private visionProviderOrder(): LLMProvider[] {
    if (this.forced === "anthropic") {
      return this.anthropic !== null ? [this.anthropic] : [];
    }
    if (this.forced === "local") {
      return this.local !== null ? [this.local] : [];
    }
    const order: LLMProvider[] = [];
    if (this.anthropic !== null) order.push(this.anthropic);
    if (this.local !== null) order.push(this.local);
    return order;
  }
}
