export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type ChatOpts = {
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
  responseSchema?: { name: string; schema: Record<string, unknown> };
};

export type ChatResponse = {
  content: string;
  usage: { inputTokens: number; outputTokens: number };
};

export interface LLMProvider {
  name: string;
  chat(messages: ChatMessage[], opts?: ChatOpts): Promise<ChatResponse>;
}

export class LLMUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LLMUnavailableError";
  }
}
