import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { APIConnectionError, APIError } from "@anthropic-ai/sdk";
import { AnthropicProvider } from "./anthropic.js";
import { buildRouterFromEnv } from "./index.js";
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
  models?: { textModel?: string; visionModel?: string },
): AnthropicProvider {
  const p = new AnthropicProvider({
    apiKey: "test",
    textModel: models?.textModel ?? "claude-test-text",
    visionModel: models?.visionModel ?? "claude-test-vision",
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

  describe("model selection", () => {
    it("chat() uses textModel and vision() uses visionModel", async () => {
      const captured: Array<Record<string, unknown>> = [];
      const create = async (args: Record<string, unknown>) => {
        captured.push(args);
        return {
          content: [{ type: "text", text: "ok" }],
          usage: { input_tokens: 1, output_tokens: 1 },
        };
      };
      const p = providerWithCreate(create as never, {
        textModel: "t-model",
        visionModel: "v-model",
      });
      await p.chat([{ role: "user", content: "hi" }]);
      await p.vision(
        { data: Buffer.from([0]), mediaType: "image/png" },
        [{ role: "user", content: "Parse it." }],
      );
      expect(captured).toHaveLength(2);
      expect(captured[0].model).toBe("t-model");
      expect(captured[1].model).toBe("v-model");
    });
  });
});

describe("buildRouterFromEnv model precedence", () => {
  const ENV_KEYS = [
    "ANTHROPIC_API_KEY",
    "ANTHROPIC_MODEL",
    "ANTHROPIC_TEXT_MODEL",
    "ANTHROPIC_VISION_MODEL",
  ] as const;
  let saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    saved = {};
    for (const k of ENV_KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
    process.env.ANTHROPIC_API_KEY = "test-key";
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  function getProviderModels(): { textModel: string; visionModel: string } {
    const router = buildRouterFromEnv(silentLogger());
    const provider = (
      router as unknown as { anthropic: AnthropicProvider | null }
    ).anthropic;
    if (provider === null) {
      throw new Error("expected anthropic provider");
    }
    const internals = provider as unknown as {
      textModel: string;
      visionModel: string;
    };
    return {
      textModel: internals.textModel,
      visionModel: internals.visionModel,
    };
  }

  it("falls back both methods to legacy ANTHROPIC_MODEL when set alone", () => {
    process.env.ANTHROPIC_MODEL = "foo";
    const m = getProviderModels();
    expect(m.textModel).toBe("foo");
    expect(m.visionModel).toBe("foo");
  });

  it("uses task-specific vars when set", () => {
    process.env.ANTHROPIC_TEXT_MODEL = "t-model";
    process.env.ANTHROPIC_VISION_MODEL = "v-model";
    const m = getProviderModels();
    expect(m.textModel).toBe("t-model");
    expect(m.visionModel).toBe("v-model");
  });

  it("task-specific vars override legacy ANTHROPIC_MODEL", () => {
    process.env.ANTHROPIC_MODEL = "legacy";
    process.env.ANTHROPIC_TEXT_MODEL = "t-model";
    process.env.ANTHROPIC_VISION_MODEL = "v-model";
    const m = getProviderModels();
    expect(m.textModel).toBe("t-model");
    expect(m.visionModel).toBe("v-model");
  });

  it("defaults to Haiku for text and Sonnet for vision when nothing is set", () => {
    const m = getProviderModels();
    expect(m.textModel).toBe("claude-haiku-4-5-20251001");
    expect(m.visionModel).toBe("claude-sonnet-4-6");
  });
});
