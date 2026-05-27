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

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
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

  it("sends response_format=json_schema when responseSchema is provided", async () => {
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      calls.push({
        url,
        body: JSON.parse(init.body as string) as Record<string, unknown>,
      });
      return jsonResponse({
        choices: [{ message: { content: "{}" } }],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      });
    }) as unknown as typeof fetch;
    const p = new LMStudioProvider({
      baseUrl: "http://localhost:1234/v1",
      model: "x",
      logger: silentLogger(),
      fetchImpl,
    });
    await p.chat([{ role: "user", content: "hi" }], {
      responseSchema: {
        name: "recipe_draft",
        schema: { type: "object" },
      },
    });
    expect(calls).toHaveLength(1);
    const rf = calls[0].body.response_format as {
      type: string;
      json_schema: { name: string; strict: boolean; schema: unknown };
    };
    expect(rf.type).toBe("json_schema");
    expect(rf.json_schema.name).toBe("recipe_draft");
    expect(rf.json_schema.strict).toBe(true);
    expect(rf.json_schema.schema).toEqual({ type: "object" });
  });

  it("sends response_format=text when no responseSchema is provided", async () => {
    const calls: Array<Record<string, unknown>> = [];
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      calls.push(JSON.parse(init.body as string) as Record<string, unknown>);
      return jsonResponse({
        choices: [{ message: { content: "ok" } }],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      });
    }) as unknown as typeof fetch;
    const p = new LMStudioProvider({
      baseUrl: "http://localhost:1234/v1",
      model: "x",
      logger: silentLogger(),
      fetchImpl,
    });
    await p.chat([{ role: "user", content: "hi" }]);
    expect(calls).toHaveLength(1);
    expect(calls[0].response_format).toEqual({ type: "text" });
  });

  it("retries once with response_format=text on 400 mentioning response_format", async () => {
    const calls: Array<Record<string, unknown>> = [];
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string) as Record<string, unknown>;
      calls.push(body);
      if (calls.length === 1) {
        return new Response(
          "'response_format.type' must be 'json_schema' or 'text'",
          { status: 400 },
        );
      }
      return jsonResponse({
        choices: [{ message: { content: "ok" } }],
        usage: { prompt_tokens: 2, completion_tokens: 3 },
      });
    }) as unknown as typeof fetch;
    const p = new LMStudioProvider({
      baseUrl: "http://localhost:1234/v1",
      model: "x",
      logger: silentLogger(),
      fetchImpl,
    });
    const res = await p.chat([{ role: "user", content: "hi" }], {
      responseSchema: {
        name: "recipe_draft",
        schema: { type: "object" },
      },
    });
    expect(res.content).toBe("ok");
    expect(calls).toHaveLength(2);
    expect((calls[0].response_format as { type: string }).type).toBe(
      "json_schema",
    );
    expect(calls[1].response_format).toEqual({ type: "text" });
  });

  it("does not retry on 400 unrelated to response_format", async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      return new Response("invalid model", { status: 400 });
    }) as unknown as typeof fetch;
    const p = new LMStudioProvider({
      baseUrl: "http://localhost:1234/v1",
      model: "x",
      logger: silentLogger(),
      fetchImpl,
    });
    await expect(
      p.chat([{ role: "user", content: "hi" }], {
        responseSchema: { name: "x", schema: {} },
      }),
    ).rejects.toThrow(LLMUnavailableError);
    expect(calls).toBe(1);
  });
});
