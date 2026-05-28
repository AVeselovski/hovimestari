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
  choices: Array<{
    message: { content: string | null };
    finish_reason?: string;
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
};

type ResponseFormat =
  | { type: "text" }
  | {
      type: "json_schema";
      json_schema: { name: string; strict: true; schema: Record<string, unknown> };
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
    const url = `${this.baseUrl}/chat/completions`;
    const startedAt = Date.now();

    const initialFormat: ResponseFormat = opts?.responseSchema
      ? {
          type: "json_schema",
          json_schema: {
            name: opts.responseSchema.name,
            strict: true,
            schema: opts.responseSchema.schema,
          },
        }
      : { type: "text" };

    let res = await this.send(url, messages, opts, initialFormat);

    if (!res.ok && res.status === 400 && initialFormat.type === "json_schema") {
      const text = await res.text().catch(() => "");
      if (text.toLowerCase().includes("response_format")) {
        this.logger.warn(
          { provider: this.name, body: text.slice(0, 200) },
          "lmstudio rejected json_schema response_format, retrying with text",
        );
        res = await this.send(url, messages, opts, { type: "text" });
      } else {
        throw new LLMUnavailableError(
          `LM Studio HTTP 400: ${text.slice(0, 200)}`,
        );
      }
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
    const finishReason = data.choices?.[0]?.finish_reason;
    const inputTokens = data.usage?.prompt_tokens ?? 0;
    const outputTokens = data.usage?.completion_tokens ?? 0;

    if (finishReason === "length") {
      throw new LLMUnavailableError(
        `LM Studio output truncated at ${outputTokens} tokens (finish_reason=length) — raise maxTokens`,
      );
    }

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

  private async send(
    url: string,
    messages: ChatMessage[],
    opts: ChatOpts | undefined,
    responseFormat: ResponseFormat,
  ): Promise<Response> {
    const body: Record<string, unknown> = {
      model: this.model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      temperature: opts?.temperature ?? 0.2,
      response_format: responseFormat,
    };
    if (opts?.maxTokens !== undefined) body.max_tokens = opts.maxTokens;

    try {
      return await this.fetchImpl(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(60_000),
      });
    } catch (err) {
      const name = (err as { name?: string } | null)?.name;
      if (name === "TimeoutError" || name === "AbortError") {
        throw new LLMUnavailableError("LM Studio request timed out after 60s");
      }
      throw new LLMUnavailableError(
        `LM Studio fetch failed: ${(err as Error).message}`,
      );
    }
  }
}
