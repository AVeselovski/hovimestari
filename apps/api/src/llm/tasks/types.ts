import type { ChatMessage, ChatOpts } from "../types.js";

export type LLMTaskParseResult<T> =
  | { ok: true; value: T; confidence: number; warnings: string[] }
  | { ok: false; error: string };

export type LLMTask<T> = {
  name: string;
  messages: ChatMessage[];
  opts?: ChatOpts;
  parse: (raw: string) => LLMTaskParseResult<T>;
};
