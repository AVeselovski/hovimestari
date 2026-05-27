import { describe, it, expect } from "vitest";
import { LMStudioProvider } from "./lmstudio.js";
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

describe("LMStudioProvider", () => {
  it("wraps fetch TimeoutError as LLMUnavailableError", async () => {
    const fetchImpl = (async () => {
      throw Object.assign(new Error("timed out"), { name: "TimeoutError" });
    }) as unknown as typeof fetch;
    const p = new LMStudioProvider({
      baseUrl: "http://localhost:1234/v1",
      model: "x",
      logger: silentLogger(),
      fetchImpl,
    });
    await expect(p.chat([{ role: "user", content: "hi" }])).rejects.toThrow(
      LLMUnavailableError,
    );
    await expect(p.chat([{ role: "user", content: "hi" }])).rejects.toThrow(
      /timed out/i,
    );
  });

  it("wraps AbortError as LLMUnavailableError", async () => {
    const fetchImpl = (async () => {
      throw Object.assign(new Error("aborted"), { name: "AbortError" });
    }) as unknown as typeof fetch;
    const p = new LMStudioProvider({
      baseUrl: "http://localhost:1234/v1",
      model: "x",
      logger: silentLogger(),
      fetchImpl,
    });
    await expect(p.chat([{ role: "user", content: "hi" }])).rejects.toThrow(
      LLMUnavailableError,
    );
  });

  it("wraps generic network errors as LLMUnavailableError", async () => {
    const fetchImpl = (async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;
    const p = new LMStudioProvider({
      baseUrl: "http://localhost:1234/v1",
      model: "x",
      logger: silentLogger(),
      fetchImpl,
    });
    await expect(p.chat([{ role: "user", content: "hi" }])).rejects.toThrow(
      LLMUnavailableError,
    );
  });
});
