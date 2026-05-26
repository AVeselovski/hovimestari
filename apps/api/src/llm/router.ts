import type { FastifyBaseLogger } from "fastify";
import { LLMUnavailableError, type LLMProvider } from "./types.js";
import type { LLMTask } from "./tasks/types.js";

export type ForcedProvider = "anthropic" | "local" | null;

export type RouterRunResult<T> = {
  value: T;
  confidence: number;
  warnings: string[];
  provider: string;
};

export type RouterOpts = {
  local: LLMProvider | null;
  anthropic: LLMProvider | null;
  logger: FastifyBaseLogger;
  forcedProvider?: ForcedProvider;
  confidenceThreshold?: number;
};

export class NoProvidersConfiguredError extends Error {
  constructor() {
    super("no LLM providers configured");
    this.name = "NoProvidersConfiguredError";
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
}
