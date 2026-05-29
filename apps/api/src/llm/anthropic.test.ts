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

  describe("vision()", () => {
    it("builds an image source block with the correct base64 / media_type", async () => {
      const captured: Array<Record<string, unknown>> = [];
      const create = async (args: Record<string, unknown>) => {
        captured.push(args);
        return {
          content: [{ type: "text", text: '{"ok":true}' }],
          usage: { input_tokens: 10, output_tokens: 5 },
        };
      };
      const p = providerWithCreate(create as never);
      const bytes = Buffer.from([0xff, 0xd8, 0xff]);
      const res = await p.vision(
        { data: bytes, mediaType: "image/jpeg" },
        [
          { role: "system", content: "sys" },
          { role: "user", content: "Parse it." },
        ],
      );
      expect(res.content).toBe('{"ok":true}');
      expect(captured).toHaveLength(1);
      expect(captured[0].system).toBe("sys");
      const messages = captured[0].messages as Array<{
        role: string;
        content: unknown;
      }>;
      expect(messages).toHaveLength(1);
      const userMsg = messages[0];
      expect(userMsg.role).toBe("user");
      const content = userMsg.content as Array<Record<string, unknown>>;
      expect(content[0]).toEqual({ type: "text", text: "Parse it." });
      const imgBlock = content[1] as {
        type: string;
        source: { type: string; media_type: string; data: string };
      };
      expect(imgBlock.type).toBe("image");
      expect(imgBlock.source.type).toBe("base64");
      expect(imgBlock.source.media_type).toBe("image/jpeg");
      expect(imgBlock.source.data).toBe(bytes.toString("base64"));
    });

    it("joins text blocks from the response", async () => {
      const create = async () => ({
        content: [
          { type: "text", text: '{"name":' },
          { type: "text", text: '"Pasta"}' },
        ],
        usage: { input_tokens: 1, output_tokens: 1 },
      });
      const p = providerWithCreate(create as never);
      const res = await p.vision(
        { data: Buffer.from([0]), mediaType: "image/png" },
        [{ role: "user", content: "Parse it." }],
      );
      expect(res.content).toBe('{"name":"Pasta"}');
    });
  });
});
