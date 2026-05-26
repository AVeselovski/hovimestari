import Anthropic from "@anthropic-ai/sdk";
import type { FastifyBaseLogger } from "fastify";
import type { ChatMessage, ChatOpts, ChatResponse, LLMProvider } from "./types.js";

export type AnthropicProviderOpts = {
  apiKey: string;
  model: string;
  logger: FastifyBaseLogger;
};

export class AnthropicProvider implements LLMProvider {
  readonly name = "anthropic";
  private readonly client: Anthropic;
  private readonly model: string;
  private readonly logger: FastifyBaseLogger;

  constructor(opts: AnthropicProviderOpts) {
    this.client = new Anthropic({ apiKey: opts.apiKey });
    this.model = opts.model;
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
    const wantsJson = opts?.jsonMode === true;
    if (wantsJson) {
      apiMessages.push({ role: "assistant", content: "{" });
    }

    const startedAt = Date.now();
    const res = await this.client.messages.create({
      model: this.model,
      max_tokens: opts?.maxTokens ?? 2048,
      temperature: opts?.temperature ?? 0.2,
      system,
      messages: apiMessages,
    });
    const latencyMs = Date.now() - startedAt;

    const raw = res.content
      .map((block) => (block.type === "text" ? block.text : ""))
      .join("");
    const content = wantsJson ? "{" + raw : raw;

    this.logger.info(
      {
        provider: this.name,
        model: this.model,
        inputTokens: res.usage.input_tokens,
        outputTokens: res.usage.output_tokens,
        latencyMs,
      },
      "llm call",
    );

    return {
      content,
      usage: {
        inputTokens: res.usage.input_tokens,
        outputTokens: res.usage.output_tokens,
      },
    };
  }
}
