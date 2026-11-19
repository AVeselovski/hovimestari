import { afterAll, beforeAll, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { randomUUID } from "node:crypto";
import request from "supertest";
import {
  connect,
  CONNECTION_ID,
  EXPIRED_KEY,
  freezeDate,
  freshKey,
  keyMocks,
  listen,
  OTHER_KEY_EXPORTS,
  quietConsole,
  READ_KEY,
  resolveTestKey,
  REVOKED_KEY,
  WRITE_KEY,
} from "./harness.js";

// /mcp end to end on the app, with the key lookup stood in for: the
// refusals, the Origin guard, the body limits, the order of the gate and the
// record of use, and through the real MCP client the tool list, the rules
// resource and the instructions in both protocol eras.

quietConsole();
freezeDate("2026-11-19T10:00:00.000Z");
const keys = keyMocks();
jest.unstable_mockModule("../../db/index.js", () => ({ db: {} }));
jest.unstable_mockModule("../../lib/connectionKeys.js", () => ({ ...OTHER_KEY_EXPORTS, ...keys }));

const { app } = await import("../../app.js");
const { env } = await import("../../lib/env.js");
const { APP_RULES, WRITE_RULES } = await import("../appRules.js");
const { signAccessToken } = await import("../../lib/jwt.js");
const { AUTH_FAILURE_LIMIT } = await import("../router.js");

const initialize = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "curl", version: "0" } },
};
const ACCEPT = "application/json, text/event-stream";

describe("/mcp authentication", () => {
  beforeEach(() => {
    keys.lookupConnectionKey.mockClear();
    keys.touchLastUsed.mockClear();
  });

  it("answers 401 invalid_token with a Bearer challenge when there is no key", async () => {
    const res = await request(app).post("/mcp").set("Accept", ACCEPT).send(initialize);
    expect(res.status).toBe(401);
    expect(res.headers["www-authenticate"]).toMatch(/^Bearer error="invalid_token"/);
    expect(res.body.error).toBe("invalid_token");
    expect(keys.touchLastUsed).not.toHaveBeenCalled();
  });

  it.each([
    ["an unknown", () => freshKey(), "Invalid or expired token."],
    ["an expired", () => EXPIRED_KEY, "This key has expired. Create a new one in Settings."],
    ["a revoked", () => REVOKED_KEY, "This key was revoked."],
  ])("answers 401 to %s key, saying why in the header and the body", async (_label, keyOf, message) => {
    const key = keyOf();
    const res = await request(app)
      .post("/mcp")
      .set("Authorization", `Bearer ${key}`)
      .set("Accept", ACCEPT)
      .send(initialize);
    expect(res.status).toBe(401);
    expect(res.headers["www-authenticate"]).toBe(`Bearer error="invalid_token", error_description="${message}"`);
    expect(res.body).toEqual({ error: "invalid_token", error_description: message });
    expect(res.headers["www-authenticate"]).not.toContain(key);
    expect(JSON.stringify(res.body)).not.toContain(key);
    expect(keys.touchLastUsed).not.toHaveBeenCalled();
  });

  it("answers 401 to the app's own JWT", async () => {
    const res = await request(app)
      .post("/mcp")
      .set("Authorization", `Bearer ${signAccessToken({ sub: randomUUID(), fam: randomUUID() })}`)
      .set("Accept", ACCEPT)
      .send(initialize);
    expect(res.status).toBe(401);
  });

  it("refuses a request with an Origin header before looking at the key", async () => {
    const res = await request(app)
      .post("/mcp")
      .set("Origin", "http://evil.example")
      .set("Authorization", `Bearer ${READ_KEY}`)
      .set("Accept", ACCEPT)
      .send(initialize);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "forbidden", error_description: "Browser requests are not accepted." });
    expect(keys.lookupConnectionKey).not.toHaveBeenCalled();
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("refuses the app's own web origin too: no Origin is accepted", async () => {
    const res = await request(app)
      .post("/mcp")
      .set("Origin", env.CORS_ORIGIN)
      .set("Authorization", `Bearer ${READ_KEY}`)
      .set("Accept", ACCEPT)
      .send(initialize);
    expect(res.status).toBe(403);
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
    expect(res.headers["access-control-allow-credentials"]).toBeUndefined();
  });

  it("answers a valid key and records its use", async () => {
    const res = await request(app)
      .post("/mcp")
      .set("Authorization", `Bearer ${READ_KEY}`)
      .set("Accept", ACCEPT)
      .send(initialize);
    expect(res.status).toBe(200);
    expect(res.text).toContain('"serverInfo":{"name":"hovimestari"');
    expect(keys.touchLastUsed).toHaveBeenCalledWith(CONNECTION_ID);
  });

  it("records no use when the lookup says one is not due", async () => {
    keys.lookupConnectionKey.mockImplementationOnce(async (key) => {
      const found = await resolveTestKey(key);
      return found.state === "active" ? { ...found, connection: { ...found.connection, touchDue: false } } : found;
    });
    const res = await request(app)
      .post("/mcp")
      .set("Authorization", `Bearer ${READ_KEY}`)
      .set("Accept", ACCEPT)
      .send(initialize);
    expect(res.status).toBe(200);
    expect(keys.touchLastUsed).not.toHaveBeenCalled();
  });

  it("answers the call when recording its use fails", async () => {
    const logged = jest.spyOn(console, "error").mockImplementation(() => undefined);
    keys.touchLastUsed.mockRejectedValueOnce(new Error("connection terminated"));
    const res = await request(app)
      .post("/mcp")
      .set("Authorization", `Bearer ${READ_KEY}`)
      .set("Accept", ACCEPT)
      .send(initialize);
    expect(res.status).toBe(200);
    expect(res.text).toContain('"serverInfo":{"name":"hovimestari"');
    expect(logged).toHaveBeenCalledWith(expect.stringContaining(CONNECTION_ID), expect.anything());
    expect(JSON.stringify(logged.mock.calls)).not.toContain(READ_KEY);
    logged.mockRestore();
  });

  it("answers a failed key lookup with 500, logs its failure without the key, and counts it on no brake", async () => {
    const logged = jest.spyOn(console, "error").mockImplementation(() => undefined);
    const key = freshKey();
    keys.lookupConnectionKey.mockRejectedValueOnce(
      Object.assign(new Error("canceling statement due to statement timeout"), { code: "57014" }),
    );
    const res = await request(app)
      .post("/mcp")
      .set("Authorization", `Bearer ${key}`)
      .set("Accept", ACCEPT)
      .send(initialize);
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "server_error", error_description: "Internal Server Error" });
    expect(logged).toHaveBeenCalledWith("[mcp] key lookup failed:", expect.stringContaining("code=57014"));
    expect(JSON.stringify(logged.mock.calls)).not.toContain(key);
    expect(keys.touchLastUsed).not.toHaveBeenCalled();
    logged.mockRestore();

    // The failure is not on the refused-key books: the same key's next refusal is its first.
    const refused = await request(app)
      .post("/mcp")
      .set("Authorization", `Bearer ${key}`)
      .set("Accept", ACCEPT)
      .send(initialize);
    expect(refused.status).toBe(401);
    expect(refused.headers["ratelimit-remaining"]).toBe(String(AUTH_FAILURE_LIMIT - 1));
  });

  it("pins GET and DELETE as the SDK answers them: 405 with a JSON-RPC error and no Allow header", async () => {
    for (const method of ["get", "delete"] as const) {
      const res = await request(app)[method]("/mcp").set("Authorization", `Bearer ${READ_KEY}`).set("Accept", ACCEPT);
      expect(res.status).toBe(405);
      expect(res.body).toMatchObject({ jsonrpc: "2.0", error: { code: -32000 } });
      expect(res.headers.allow).toBeUndefined();
    }
  });

  it("gives a legacy GET the SDK's 405, not an HTML 404", async () => {
    const res = await request(app).get("/mcp").set("Authorization", `Bearer ${READ_KEY}`).set("Accept", ACCEPT);
    expect(res.status).toBe(405);
  });

  it("does not let a connection key into the REST API", async () => {
    const res = await request(app).get("/api/v1/targets").set("Authorization", `Bearer ${READ_KEY}`);
    expect(res.status).toBe(401);
    expect(keys.lookupConnectionKey).not.toHaveBeenCalled();
  });
});

describe("/mcp request bodies", () => {
  it("answers a body over 100 kB with 413 JSON, before the key, logging none of it", async () => {
    const logged = jest.spyOn(console, "error").mockImplementation(() => undefined);
    keys.lookupConnectionKey.mockClear();
    const res = await request(app)
      .post("/mcp")
      .set("Authorization", `Bearer ${READ_KEY}`)
      .set("Accept", ACCEPT)
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ ...initialize, padding: "private-body-text ".repeat(12_000) }));
    expect(res.status).toBe(413);
    expect(res.body).toEqual({ error: "payload_too_large", error_description: "The request body is over 100 kB." });
    expect(keys.lookupConnectionKey).not.toHaveBeenCalled();
    expect(logged).not.toHaveBeenCalled();
    logged.mockRestore();
  });

  it("answers malformed JSON with a JSON-RPC parse error, logging none of it", async () => {
    const logged = jest.spyOn(console, "error").mockImplementation(() => undefined);
    const res = await request(app)
      .post("/mcp")
      .set("Authorization", `Bearer ${READ_KEY}`)
      .set("Accept", ACCEPT)
      .set("Content-Type", "application/json")
      .send('{"jsonrpc":"2.0","method":"private-body-text"');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
    expect(logged).not.toHaveBeenCalled();
    logged.mockRestore();
  });
});

describe("/mcp and the Host header", () => {
  // Pinned as it behaves: the SDK's handler does not check Host, so a
  // request naming a foreign host and carrying no Origin is answered like
  // any other. The guard against DNS rebinding is the Origin refusal, since
  // a page's request always carries Origin. A request with no Origin comes
  // from a program, which needs the key anyway.
  it("answers a foreign Host without an Origin like any other request", async () => {
    const res = await request(app)
      .post("/mcp")
      .set("Host", "attacker.example")
      .set("Authorization", `Bearer ${READ_KEY}`)
      .set("Accept", ACCEPT)
      .send(initialize);
    expect(res.status).toBe(200);
    expect(res.text).toContain('"serverInfo":{"name":"hovimestari"');
  });

  it("still refuses a foreign Host with an Origin", async () => {
    const res = await request(app)
      .post("/mcp")
      .set("Host", "attacker.example")
      .set("Origin", "http://attacker.example")
      .set("Authorization", `Bearer ${READ_KEY}`)
      .set("Accept", ACCEPT)
      .send(initialize);
    expect(res.status).toBe(403);
  });
});

describe("/mcp through the MCP client", () => {
  let server: Awaited<ReturnType<typeof listen>>;
  beforeAll(async () => {
    server = await listen(app);
  });
  afterAll(async () => {
    await server.close();
  });
  beforeEach(() => {
    env.MCP_WRITES_ENABLED = false;
  });

  it.each(["legacy", "modern"] as const)("lists exactly get_context (%s era)", async (era) => {
    const client = await connect(server.url, READ_KEY, era);
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual(["get_context"]);
    await client.close();
  });

  it("lists the same tools to a writing key while writing is on: no write tool exists yet", async () => {
    env.MCP_WRITES_ENABLED = true;
    const client = await connect(server.url, WRITE_KEY);
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual(["get_context"]);
    await client.close();
  });

  it("marks every tool read-only and takes no user id as input", async () => {
    const client = await connect(server.url, READ_KEY);
    const { tools } = await client.listTools();
    for (const tool of tools) {
      expect(tool.annotations).toMatchObject({ readOnlyHint: true, idempotentHint: true, openWorldHint: false });
      expect(Object.keys(tool.inputSchema.properties ?? {}).join(" ")).not.toMatch(/user/i);
    }
    await client.close();
  });

  it.each(["legacy", "modern"] as const)("serves the app rules as a resource (%s era)", async (era) => {
    const client = await connect(server.url, READ_KEY, era);
    const { resources } = await client.listResources();
    expect(resources).toEqual([
      expect.objectContaining({
        uri: "hovimestari://app-rules",
        mimeType: "text/markdown",
        title: "How to read Hovimestari's figures",
      }),
    ]);
    const read = await client.readResource({ uri: "hovimestari://app-rules" });
    expect(read.contents[0]).toMatchObject({ text: APP_RULES });
    await client.close();
  });

  it("serves the write rules only to a writing key while writing is on", async () => {
    const off = await connect(server.url, WRITE_KEY);
    expect((await off.readResource({ uri: "hovimestari://app-rules" })).contents[0]).toMatchObject({ text: APP_RULES });
    await off.close();

    env.MCP_WRITES_ENABLED = true;
    const on = await connect(server.url, WRITE_KEY);
    expect((await on.listResources()).resources[0].title).toBe("How to read and change Hovimestari");
    expect((await on.readResource({ uri: "hovimestari://app-rules" })).contents[0]).toMatchObject({
      text: `${APP_RULES}\n${WRITE_RULES}`,
    });
    await on.close();

    const reader = await connect(server.url, READ_KEY);
    expect((await reader.readResource({ uri: "hovimestari://app-rules" })).contents[0]).toMatchObject({
      text: APP_RULES,
    });
    await reader.close();
  });

  it("introduces the app in the server instructions, by what the key can do", async () => {
    const reader = await connect(server.url, READ_KEY);
    expect(reader.getInstructions()).toBe(
      "Hovimestari, one person's food log and plan, read-only. Call get_context first: it carries the rules for reading every figure. Quote the app's figures and do not recompute totals from entries. Nothing the app returns is nutrition or medical advice.",
    );
    await reader.close();

    const writerWhileOff = await connect(server.url, WRITE_KEY);
    expect(writerWhileOff.getInstructions()).toMatch(/read-only\. .* Changes are switched off in the app for now\.$/);
    await writerWhileOff.close();

    env.MCP_WRITES_ENABLED = true;
    const writer = await connect(server.url, WRITE_KEY);
    expect(writer.getInstructions()).toContain("read and write. Call get_context first");
    expect(writer.getInstructions()).toContain("wait for their yes");
    await writer.close();
  });
});
