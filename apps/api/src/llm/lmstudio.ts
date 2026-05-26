import type { FastifyBaseLogger } from "fastify";
import {
  LLMUnavailableError,
  type ChatMessage,
  type ChatOpts,
  type ChatResponse,
  type LLMProvider,
} from "./types.js";

export type LMStudioProviderOpts = {
  baseUrl: string;
  model: string;
  logger: FastifyBaseLogger;
  fetchImpl?: typeof fetch;
};

type ChatCompletionResponse = {
  choices: Array<{ message: { content: string | null } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
};

export class LMStudioProvider implements LLMProvider {
  readonly name = "lmstudio";
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly logger: FastifyBaseLogger;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: LMStudioProviderOpts) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.model = opts.model;
    this.logger = opts.logger;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async chat(messages: ChatMessage[], opts?: ChatOpts): Promise<ChatResponse> {
    const body: Record<string, unknown> = {
      model: this.model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      temperature: opts?.temperature ?? 0.2,
    };
    if (opts?.maxTokens !== undefined) body.max_tokens = opts.maxTokens;
    if (opts?.jsonMode === true) {
      body.response_format = { type: "json_object" };
    }

    const url = `${this.baseUrl}/chat/completions`;
    const startedAt = Date.now();
    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (err) {
      throw new LLMUnavailableError(
        `LM Studio fetch failed: ${(err as Error).message}`,
      );
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new LLMUnavailableError(
        `LM Studio HTTP ${res.status}: ${text.slice(0, 200)}`,
      );
    }

    const data = (await res.json()) as ChatCompletionResponse;
    const latencyMs = Date.now() - startedAt;
    const content = data.choices?.[0]?.message?.content ?? "";
    const inputTokens = data.usage?.prompt_tokens ?? 0;
    const outputTokens = data.usage?.completion_tokens ?? 0;

    this.logger.info(
      {
        provider: this.name,
        model: this.model,
        inputTokens,
        outputTokens,
        latencyMs,
      },
      "llm call",
    );

    return { content, usage: { inputTokens, outputTokens } };
  }
}
