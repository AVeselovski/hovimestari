import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import request from "supertest";

// ---------------------------------------------------------------------------
// Mock the db module so the health check can simulate both success and failure
// of the underlying `SELECT 1` ping without requiring a real Postgres.
// ---------------------------------------------------------------------------

const mockDbExecute = jest.fn<() => Promise<unknown>>();

jest.unstable_mockModule("../db/index.js", () => ({
  db: {
    execute: mockDbExecute,
  },
}));

const { app } = await import("../app.js");

describe("GET /health", () => {
  beforeEach(() => {
    mockDbExecute.mockReset();
  });

  it("returns 200 with { status: ok, db: ok } when the DB ping succeeds", async () => {
    mockDbExecute.mockResolvedValueOnce({ rows: [{ "?column?": 1 }] });

    const res = await request(app).get("/health");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok", db: "ok" });
    expect(mockDbExecute).toHaveBeenCalledTimes(1);
  });

  it("returns 503 with { status: error, db: error } when the DB ping fails", async () => {
    mockDbExecute.mockRejectedValueOnce(new Error("connection refused"));

    const res = await request(app).get("/health");

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: "error", db: "error" });
    expect(mockDbExecute).toHaveBeenCalledTimes(1);
  });
});
