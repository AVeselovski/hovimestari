import { describe, expect, it } from "@jest/globals";
import express, { type Request } from "express";
import http from "node:http";
import type { AddressInfo } from "node:net";

const { isAborted } = await import("../requestAborted.js");

/**
 * Runs one real request against a throwaway server and returns what
 * `isAborted` reported once `act` has run. A real socket, because the
 * property under test is what Node does when a client goes away.
 */
async function observe(opts: {
  method: "GET" | "POST";
  act: (client: http.ClientRequest, req: Request) => Promise<void>;
}): Promise<{ before: boolean; after: boolean }> {
  const app = express();
  app.use(express.json());

  const seen = new Promise<{ before: boolean; after: boolean }>((resolve) => {
    app.all("/", async (req, res) => {
      const before = isAborted(req);
      await opts.act(client, req);
      const after = isAborted(req);
      resolve({ before, after });
      if (!res.destroyed && !res.writableEnded) res.status(204).end();
    });
  });

  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const { port } = server.address() as AddressInfo;

  const client = http.request({
    port,
    method: opts.method,
    path: "/",
    headers: { "content-type": "application/json" },
  });
  client.on("error", () => {});
  client.on("response", (res) => res.resume());
  client.end(opts.method === "POST" ? JSON.stringify({ a: 1 }) : undefined);

  const result = await seen;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return result;
}

function socketClosed(req: Request): Promise<void> {
  return new Promise((resolve) => {
    if (req.socket.destroyed) resolve();
    else req.socket.once("close", () => resolve());
  });
}

describe("isAborted", () => {
  it("is false for a live GET request", async () => {
    const result = await observe({ method: "GET", act: async () => {} });
    expect(result).toEqual({ before: false, after: false });
  });

  it("is false for a live POST request whose body has been read", async () => {
    const result = await observe({ method: "POST", act: async () => {} });
    expect(result).toEqual({ before: false, after: false });
  });

  it("turns true once the client closes the connection", async () => {
    const result = await observe({
      method: "GET",
      act: async (client, req) => {
        client.destroy();
        await socketClosed(req);
      },
    });
    expect(result).toEqual({ before: false, after: true });
  });

  it("turns true once the response has been sent", async () => {
    const result = await observe({
      method: "GET",
      act: async (_client, req) => {
        req.res!.status(204).end();
      },
    });
    expect(result).toEqual({ before: false, after: true });
  });
});
