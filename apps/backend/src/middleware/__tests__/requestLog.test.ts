import { describe, expect, it, jest } from "@jest/globals";
import express from "express";
import http from "node:http";
import type { AddressInfo } from "node:net";
import request from "supertest";

const { requestLog, routeKey } = await import("../requestLog.js");

const VAULT_ID = "c3d4e5f6-a7b8-9012-cdef-123456789012";

function makeApp(log: (line: string) => void, onSlow: () => void = () => {}) {
  const app = express();
  app.use(requestLog(log));
  app.get("/livez", (_req, res) => res.sendStatus(200));
  app.get("/health", (_req, res) => res.sendStatus(200));
  app.get("/api/v1/vaults/:vaultId/dashboard", (_req, res) => res.status(200).json({}));
  app.get("/slow", () => {
    // Never answers: the client gives up first.
    onSlow();
  });
  return app;
}

/** Waits for the next log line, since the line is written on the response's close event. */
function nextLine(log: jest.Mock<(line: string) => void>): Promise<string> {
  return new Promise((resolve) => log.mockImplementationOnce((line) => resolve(line)));
}

describe("routeKey", () => {
  it("replaces ids and periods and drops the query string", () => {
    expect(routeKey(`/api/v1/vaults/${VAULT_ID}/dashboard?from=2026-09-01&to=2026-09-30`)).toBe(
      "/api/v1/vaults/:id/dashboard",
    );
    expect(routeKey(`/api/v1/vaults/${VAULT_ID}/tax/periods/2026-09`)).toBe("/api/v1/vaults/:id/tax/periods/:period");
    expect(routeKey("/api/v1/auth/login")).toBe("/api/v1/auth/login");
  });
});

describe("requestLog", () => {
  it("logs method, route, status, duration and the Fly request id", async () => {
    const log = jest.fn<(line: string) => void>();
    const line = nextLine(log);

    await request(makeApp(log))
      .get(`/api/v1/vaults/${VAULT_ID}/dashboard?from=2026-09-01`)
      .set("fly-request-id", "01JREQ");

    expect(await line).toMatch(/^\[req\] GET \/api\/v1\/vaults\/:id\/dashboard 200 \d+ms fly=01JREQ$/);
    expect(await line).not.toContain(VAULT_ID);
  });

  it("omits the Fly request id when the header is absent", async () => {
    const log = jest.fn<(line: string) => void>();
    const line = nextLine(log);

    await request(makeApp(log)).get("/nope");

    expect(await line).toMatch(/^\[req\] GET \/nope 404 \d+ms$/);
  });

  it("skips the health checks", async () => {
    const log = jest.fn<(line: string) => void>();
    const app = makeApp(log);

    await request(app).get("/livez");
    await request(app).get("/health");

    expect(log).not.toHaveBeenCalled();
  });

  it("logs a request the client abandoned as aborted", async () => {
    const log = jest.fn<(line: string) => void>();
    const line = nextLine(log);
    let entered!: () => void;
    const routeEntered = new Promise<void>((resolve) => (entered = resolve));
    const server = makeApp(log, entered).listen(0);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    try {
      const client = http.get({ port: (server.address() as AddressInfo).port, path: "/slow" });
      client.on("error", () => {});
      // Gives up once the route has the request, however long that takes.
      await routeEntered;
      client.destroy();

      expect(await line).toMatch(/^\[req\] GET \/slow aborted \d+ms$/);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
