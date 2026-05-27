import { describe, it, expect } from "vitest";
import { APIConnectionError, APIError } from "@anthropic-ai/sdk";
import { AnthropicProvider } from "./anthropic.js";
import { LLMUnavailableError } from "./types.js";
import type { FastifyBaseLogger } from "fastify";

function silentLogger(): FastifyBaseLogger {
  const noop = (): void => undefined;
  const logger = {
    info: noop,
    warn: noop,
    error: noop,
    debug: noop,
    trace: noop,
    fatal: noop,
    level: "info",
    silent: noop,
  } as unknown as FastifyBaseLogger;
  (logger as unknown as { child: () => FastifyBaseLogger }).child = () =>
    logger;
  return logger;
}

function providerWithCreate(
  create: (...args: unknown[]) => Promise<unknown>,
): AnthropicProvider {
  const p = new AnthropicProvider({
    apiKey: "test",
    model: "claude-test",
    logger: silentLogger(),
  });
  // Swap the SDK client for a minimal stub on the messages.create path.
  (p as unknown as { client: { messages: { create: typeof create } } }).client =
    {
      messages: { create },
    };
  return p;
}

describe("AnthropicProvider", () => {
  it("wraps APIConnectionError as LLMUnavailableError", async () => {
    const p = providerWithCreate(async () => {
      throw new APIConnectionError({ message: "ECONNREFUSED" });
    });
    await expect(p.chat([{ role: "user", content: "hi" }])).rejects.toThrow(
      LLMUnavailableError,
    );
  });

  it("wraps 5xx APIError as LLMUnavailableError", async () => {
    const p = providerWithCreate(async () => {
      throw new APIError(503, undefined, "service unavailable", undefined);
    });
    await expect(p.chat([{ role: "user", content: "hi" }])).rejects.toThrow(
      LLMUnavailableError,
    );
  });

  it("wraps 429 APIError as LLMUnavailableError", async () => {
    const p = providerWithCreate(async () => {
      throw new APIError(429, undefined, "rate limited", undefined);
    });
    await expect(p.chat([{ role: "user", content: "hi" }])).rejects.toThrow(
      LLMUnavailableError,
    );
  });

  it("re-throws 400 APIError as-is", async () => {
    const original = new APIError(400, undefined, "bad request", undefined);
    const p = providerWithCreate(async () => {
      throw original;
    });
    await expect(p.chat([{ role: "user", content: "hi" }])).rejects.toBe(
      original,
    );
  });

  it("re-throws unknown errors as-is", async () => {
    const original = new Error("boom");
    const p = providerWithCreate(async () => {
      throw original;
    });
    await expect(p.chat([{ role: "user", content: "hi" }])).rejects.toBe(
      original,
    );
  });
});
