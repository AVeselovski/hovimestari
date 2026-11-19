import { afterAll, describe, expect, it, jest } from "@jest/globals";
import request from "supertest";
import { freshKey } from "./harness.js";

// MCP_ENABLED=false leaves /mcp unmounted. Set before the app (and its env
// validation) loads; this file has its own module registry.
process.env.MCP_ENABLED = "false";

jest.spyOn(console, "warn").mockImplementation(() => undefined);
jest.unstable_mockModule("../../db/index.js", () => ({ db: {} }));

const { app } = await import("../../app.js");

describe("MCP_ENABLED=false", () => {
  afterAll(() => {
    delete process.env.MCP_ENABLED;
  });

  it("answers 404 at /mcp", async () => {
    const res = await request(app)
      .post("/mcp")
      .set("Authorization", `Bearer ${freshKey()}`)
      .set("Accept", "application/json, text/event-stream")
      .send({ jsonrpc: "2.0", id: 1, method: "ping" });
    expect(res.status).toBe(404);
    expect(res.headers["www-authenticate"]).toBeUndefined();
  });
});
