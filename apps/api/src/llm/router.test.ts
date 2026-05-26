import { describe, it, expect, vi } from "vitest";
import {
  Router,
  LLMTaskFailedError,
  NoProvidersConfiguredError,
} from "./router.js";
import { LLMUnavailableError, type LLMProvider } from "./types.js";
import type { LLMTask } from "./tasks/types.js";
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

function fakeProvider(
  name: string,
  reply: string | (() => string | Promise<string>),
  throws?: Error,
): LLMProvider {
  return {
    name,
    chat: vi.fn(async () => {
      if (throws) throw throws;
      const content = typeof reply === "function" ? await reply() : reply;
      return { content, usage: { inputTokens: 1, outputTokens: 1 } };
    }),
  };
}

type Box = { v: string };

function boxTask(): LLMTask<Box> {
  return {
    name: "box",
    messages: [{ role: "user", content: "hi" }],
    parse: (raw: string) => {
      if (raw === "BAD") return { ok: false, error: "bad" };
      if (raw === "LOW") {
        return { ok: true, value: { v: "low" }, confidence: 0.3, warnings: [] };
      }
      return { ok: true, value: { v: raw }, confidence: 0.9, warnings: [] };
    },
  };
}

describe("Router", () => {
  it("throws NoProvidersConfiguredError when no providers", async () => {
    const router = new Router({ local: null, anthropic: null, logger: silentLogger() });
    await expect(router.run(boxTask())).rejects.toBeInstanceOf(
      NoProvidersConfiguredError,
    );
    expect(router.hasAnyProvider()).toBe(false);
  });

  it("uses local first by default, returns when confidence is high", async () => {
    const local = fakeProvider("lmstudio", "ok-local");
    const anthropic = fakeProvider("anthropic", "ok-anthropic");
    const router = new Router({ local, anthropic, logger: silentLogger() });
    const result = await router.run(boxTask());
    expect(result.provider).toBe("lmstudio");
    expect(result.value.v).toBe("ok-local");
    expect(anthropic.chat).not.toHaveBeenCalled();
  });

  it("falls back to anthropic on parse failure", async () => {
    const local = fakeProvider("lmstudio", "BAD");
    const anthropic = fakeProvider("anthropic", "ok-anthropic");
    const router = new Router({ local, anthropic, logger: silentLogger() });
    const result = await router.run(boxTask());
    expect(result.provider).toBe("anthropic");
    expect(result.value.v).toBe("ok-anthropic");
  });

  it("falls back to anthropic on low confidence", async () => {
    const local = fakeProvider("lmstudio", "LOW");
    const anthropic = fakeProvider("anthropic", "ok-anthropic");
    const router = new Router({ local, anthropic, logger: silentLogger() });
    const result = await router.run(boxTask());
    expect(result.provider).toBe("anthropic");
    expect(result.value.v).toBe("ok-anthropic");
  });

  it("falls back when local raises LLMUnavailableError", async () => {
    const local = fakeProvider(
      "lmstudio",
      "",
      new LLMUnavailableError("refused"),
    );
    const anthropic = fakeProvider("anthropic", "ok-anthropic");
    const router = new Router({ local, anthropic, logger: silentLogger() });
    const result = await router.run(boxTask());
    expect(result.provider).toBe("anthropic");
  });

  it("returns LLMTaskFailedError when both fail", async () => {
    const local = fakeProvider("lmstudio", "BAD");
    const anthropic = fakeProvider("anthropic", "BAD");
    const router = new Router({ local, anthropic, logger: silentLogger() });
    await expect(router.run(boxTask())).rejects.toBeInstanceOf(
      LLMTaskFailedError,
    );
  });

  it("returns the best-effort low-confidence result if no provider clears the bar", async () => {
    const local = fakeProvider("lmstudio", "LOW");
    const anthropic = fakeProvider("anthropic", "LOW");
    const router = new Router({ local, anthropic, logger: silentLogger() });
    const result = await router.run(boxTask());
    // anthropic comes last in the order, so its low-confidence reply is returned.
    expect(result.provider).toBe("anthropic");
    expect(result.confidence).toBeLessThan(0.6);
  });

  it("honors HOVI_FORCE_PROVIDER=anthropic by skipping local entirely", async () => {
    const local = fakeProvider("lmstudio", "ok-local");
    const anthropic = fakeProvider("anthropic", "ok-anthropic");
    const router = new Router({
      local,
      anthropic,
      logger: silentLogger(),
      forcedProvider: "anthropic",
    });
    const result = await router.run(boxTask());
    expect(result.provider).toBe("anthropic");
    expect(local.chat).not.toHaveBeenCalled();
  });

  it("forced=anthropic surfaces failure without falling back", async () => {
    const local = fakeProvider("lmstudio", "ok-local");
    const anthropic = fakeProvider("anthropic", "BAD");
    const router = new Router({
      local,
      anthropic,
      logger: silentLogger(),
      forcedProvider: "anthropic",
    });
    await expect(router.run(boxTask())).rejects.toBeInstanceOf(
      LLMTaskFailedError,
    );
    expect(local.chat).not.toHaveBeenCalled();
  });

  it("with only one provider, uses it regardless of confidence", async () => {
    const local = fakeProvider("lmstudio", "LOW");
    const router = new Router({ local, anthropic: null, logger: silentLogger() });
    const result = await router.run(boxTask());
    expect(result.provider).toBe("lmstudio");
    expect(result.confidence).toBeLessThan(0.6);
  });
});

describe("Router with recipe-from-text task", () => {
  it("calls anthropic exactly once when local returns empty ingredients", async () => {
    const { recipeFromTextTask } = await import("./tasks/recipe-from-text.js");
    const lowDraft = JSON.stringify({
      name: "Pasta",
      time: 20,
      servings: 4,
      category: "common",
      ingredients: [],
    });
    const goodDraft = JSON.stringify({
      name: "Pasta",
      time: 20,
      servings: 4,
      category: "common",
      ingredients: [
        { name: "Pasta", amount: "400", unit: "g", category: "pantry" },
      ],
    });
    const local = fakeProvider("lmstudio", lowDraft);
    const anthropic = fakeProvider("anthropic", goodDraft);
    const router = new Router({ local, anthropic, logger: silentLogger() });
    const result = await router.run(recipeFromTextTask("Pasta 20 min"));
    expect(result.provider).toBe("anthropic");
    expect(anthropic.chat).toHaveBeenCalledTimes(1);
  });
});
