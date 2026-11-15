import { describe, expect, it, jest } from "@jest/globals";
import request from "supertest";

// The db mock throws on any use: liveness must answer without the database.
const mockDbExecute = jest.fn<() => Promise<unknown>>(() => {
  throw new Error("liveness must not touch the database");
});

jest.unstable_mockModule("../db/index.js", () => ({
  db: { execute: mockDbExecute },
}));

const { app } = await import("../app.js");

describe("GET /livez", () => {
  it("returns 200 without touching the database", async () => {
    const res = await request(app).get("/livez");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
    expect(mockDbExecute).not.toHaveBeenCalled();
  });
});

describe("CORS preflight", () => {
  it("lets the browser cache the preflight for two hours", async () => {
    const res = await request(app)
      .options("/api/v1/users/me")
      .set("Origin", "http://localhost:3000")
      .set("Access-Control-Request-Method", "GET");

    expect(res.status).toBe(204);
    expect(res.headers["access-control-max-age"]).toBe("7200");
  });
});
