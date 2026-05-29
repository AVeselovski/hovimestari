import type { FastifyBaseLogger } from "fastify";
import {
  LLMUnavailableError,
  type ChatMessage,
  type ChatOpts,
  type ChatResponse,
  type LLMProvider,
  type VisionImage,
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

type OpenAIMessage =
  | { role: "system" | "user" | "assistant"; content: string }
  | {
      role: "user";
      content: Array<
        | { type: "text"; text: string }
        | { type: "image_url"; image_url: { url: string } }
      >;
    };

const VISION_REJECTION_HINTS = ["image", "vision", "multimodal"];

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
    const apiMessages: OpenAIMessage[] = messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));
    return this.runCompletion(apiMessages, opts, { kind: "chat" });
  }

  async vision(
    image: VisionImage,
    messages: ChatMessage[],
    opts?: ChatOpts,
  ): Promise<ChatResponse> {
    const apiMessages = buildVisionMessages(messages, image);
    return this.runCompletion(apiMessages, opts, { kind: "vision" });
  }

  private async runCompletion(
    apiMessages: OpenAIMessage[],
    opts: ChatOpts | undefined,
    mode: { kind: "chat" | "vision" },
  ): Promise<ChatResponse> {
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

    let res = await this.send(url, apiMessages, opts, initialFormat, mode);

    if (!res.ok && res.status === 400 && initialFormat.type === "json_schema") {
      const text = await res.text().catch(() => "");
      if (text.toLowerCase().includes("response_format")) {
        this.logger.warn(
          { provider: this.name, body: text.slice(0, 200) },
          "lmstudio rejected json_schema response_format, retrying with text",
        );
        res = await this.send(url, apiMessages, opts, { type: "text" }, mode);
      } else {
        if (
          mode.kind === "vision" &&
          containsVisionRejectionHint(text.toLowerCase())
        ) {
          this.logger.warn(
            { provider: this.name, body: text.slice(0, 200) },
            "lmstudio rejected vision request — falling back",
          );
          throw new LLMUnavailableError(
            `LM Studio vision rejected: ${text.slice(0, 200)}`,
          );
        }
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
        mode: mode.kind,
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
    messages: OpenAIMessage[],
    opts: ChatOpts | undefined,
    responseFormat: ResponseFormat,
    mode: { kind: "chat" | "vision" },
  ): Promise<Response> {
    const body: Record<string, unknown> = {
      model: this.model,
      messages,
      temperature: opts?.temperature ?? 0.2,
      response_format: responseFormat,
    };
    if (opts?.maxTokens !== undefined) body.max_tokens = opts.maxTokens;

    const timeoutMs = mode.kind === "vision" ? 90_000 : 60_000;

    try {
      return await this.fetchImpl(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      const name = (err as { name?: string } | null)?.name;
      if (name === "TimeoutError" || name === "AbortError") {
        throw new LLMUnavailableError(
          `LM Studio request timed out after ${Math.round(timeoutMs / 1000)}s`,
        );
      }
      throw new LLMUnavailableError(
        `LM Studio fetch failed: ${(err as Error).message}`,
      );
    }
  }
}

function buildVisionMessages(
  messages: ChatMessage[],
  image: VisionImage,
): OpenAIMessage[] {
  const lastUserIdx = findLastUserIndex(messages);
  const dataUrl = `data:${image.mediaType};base64,${image.data.toString("base64")}`;

  return messages.map((m, idx) => {
    if (idx === lastUserIdx) {
      return {
        role: "user" as const,
        content: [
          { type: "text" as const, text: m.content },
          { type: "image_url" as const, image_url: { url: dataUrl } },
        ],
      };
    }
    return { role: m.role, content: m.content };
  });
}

function findLastUserIndex(messages: ChatMessage[]): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") return i;
  }
  return messages.length - 1;
}

function containsVisionRejectionHint(lowerBody: string): boolean {
  return VISION_REJECTION_HINTS.some((h) => lowerBody.includes(h));
}
