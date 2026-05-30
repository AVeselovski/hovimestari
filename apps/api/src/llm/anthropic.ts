import Anthropic, { APIConnectionError, APIError } from "@anthropic-ai/sdk";
import type { FastifyBaseLogger } from "fastify";
import {
  LLMUnavailableError,
  type ChatMessage,
  type ChatOpts,
  type ChatResponse,
  type LLMProvider,
  type VisionImage,
} from "./types.js";

export type AnthropicProviderOpts = {
  apiKey: string;
  textModel: string;
  visionModel: string;
  logger: FastifyBaseLogger;
};

export class AnthropicProvider implements LLMProvider {
  readonly name = "anthropic";
  private readonly client: Anthropic;
  private readonly textModel: string;
  private readonly visionModel: string;
  private readonly logger: FastifyBaseLogger;

  constructor(opts: AnthropicProviderOpts) {
    this.client = new Anthropic({ apiKey: opts.apiKey });
    this.textModel = opts.textModel;
    this.visionModel = opts.visionModel;
    this.logger = opts.logger;
  }

  async chat(messages: ChatMessage[], opts?: ChatOpts): Promise<ChatResponse> {
    const systemMessages = messages.filter((m) => m.role === "system");
    const turnMessages = messages.filter((m) => m.role !== "system");

    const system = systemMessages.map((m) => m.content).join("\n\n");
    const apiMessages = turnMessages.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    // Without tool-use we coax JSON via system prompt + assistant prefill.
    // The prefill is reflected back as the first character of the response so
    // we restore it before returning to the caller.
    // responseSchema is LM-Studio-only for now.
    const wantsJson = opts?.jsonMode === true;
    if (wantsJson) {
      apiMessages.push({ role: "assistant", content: "{" });
    }

    const startedAt = Date.now();
    let res: Awaited<ReturnType<typeof this.client.messages.create>>;
    try {
      res = await this.client.messages.create({
        model: this.textModel,
        max_tokens: opts?.maxTokens ?? 2048,
        temperature: opts?.temperature ?? 0.2,
        system,
        messages: apiMessages,
      });
    } catch (err) {
      if (err instanceof APIConnectionError) {
        throw new LLMUnavailableError(
          `Anthropic connection error: ${(err as Error).message}`,
        );
      }
      if (err instanceof APIError) {
        const status = err.status;
        if (typeof status === "number" && (status >= 500 || status === 429)) {
          throw new LLMUnavailableError(
            `Anthropic transient ${status}: ${err.message}`,
          );
        }
      }
      throw err;
    }
    const latencyMs = Date.now() - startedAt;

    const raw = res.content
      .map((block) => (block.type === "text" ? block.text : ""))
      .join("");
    const content = wantsJson ? "{" + raw : raw;

    this.logger.info(
      {
        provider: this.name,
        model: this.textModel,
        inputTokens: res.usage.input_tokens,
        outputTokens: res.usage.output_tokens,
        latencyMs,
      },
      "llm call",
    );

    return {
      content,
      model: this.textModel,
      usage: {
        inputTokens: res.usage.input_tokens,
        outputTokens: res.usage.output_tokens,
      },
    };
  }

  async vision(
    image: VisionImage,
    messages: ChatMessage[],
    opts?: ChatOpts,
  ): Promise<ChatResponse> {
    const systemMessages = messages.filter((m) => m.role === "system");
    const turnMessages = messages.filter((m) => m.role !== "system");

    const system = systemMessages.map((m) => m.content).join("\n\n");

    let lastUserIdx = -1;
    for (let i = turnMessages.length - 1; i >= 0; i--) {
      if (turnMessages[i].role === "user") {
        lastUserIdx = i;
        break;
      }
    }

    const base64 = image.data.toString("base64");
    const apiMessages = turnMessages.map((m, idx) => {
      if (idx === lastUserIdx) {
        return {
          role: "user" as const,
          content: [
            { type: "text" as const, text: m.content },
            {
              type: "image" as const,
              source: {
                type: "base64" as const,
                media_type: image.mediaType,
                data: base64,
              },
            },
          ],
        };
      }
      return {
        role: m.role as "user" | "assistant",
        content: m.content,
      };
    });

    const startedAt = Date.now();
    let res: Awaited<ReturnType<typeof this.client.messages.create>>;
    try {
      res = await this.client.messages.create({
        model: this.visionModel,
        max_tokens: opts?.maxTokens ?? 2048,
        temperature: opts?.temperature ?? 0.2,
        system,
        messages: apiMessages,
      });
    } catch (err) {
      if (err instanceof APIConnectionError) {
        throw new LLMUnavailableError(
          `Anthropic connection error: ${(err as Error).message}`,
        );
      }
      if (err instanceof APIError) {
        const status = err.status;
        if (typeof status === "number" && (status >= 500 || status === 429)) {
          throw new LLMUnavailableError(
            `Anthropic transient ${status}: ${err.message}`,
          );
        }
      }
      throw err;
    }
    const latencyMs = Date.now() - startedAt;

    const content = res.content
      .map((block) => (block.type === "text" ? block.text : ""))
      .join("");

    this.logger.info(
      {
        provider: this.name,
        model: this.visionModel,
        mode: "vision",
        inputTokens: res.usage.input_tokens,
        outputTokens: res.usage.output_tokens,
        latencyMs,
      },
      "llm call",
    );

    return {
      content,
      model: this.visionModel,
      usage: {
        inputTokens: res.usage.input_tokens,
        outputTokens: res.usage.output_tokens,
      },
    };
  }
}
