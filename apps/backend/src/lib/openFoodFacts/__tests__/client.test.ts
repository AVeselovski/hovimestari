import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import { readFileSync } from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { defaultUserAgent, fetchProduct, OFF_FIELDS, OFF_TIMEOUT_MS, OffUnavailableError } from "../client.js";

// Against a local node:http server standing in for Open Food Facts, through
// the real fetch: what is sent, and what each answer becomes. Never the live
// service.

/** The headers a lookup sends: the client's User-Agent and Accept, and what fetch adds by itself. */
const SENT_HEADERS = [
  "accept",
  "accept-encoding",
  "accept-language",
  "connection",
  "host",
  "sec-fetch-mode",
  "user-agent",
];

const fixture = (file: string) => readFileSync(new URL(`./fixtures/${file}`, import.meta.url), "utf8");

type Reply = (res: http.ServerResponse) => void;
const seen: http.IncomingMessage[] = [];
let reply: Reply = (res) => res.end();
let server: http.Server;
let baseUrl: string;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    seen.push(req);
    reply(res);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const json =
  (status: number, body: string): Reply =>
  (res) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(body);
  };

const ask = (gtin = "06408430000258", timeoutMs?: number) =>
  fetchProduct(gtin, { fetch: globalThis.fetch, baseUrl, userAgent: defaultUserAgent(), timeoutMs });

/** The error `promise` rejects with. */
async function failure(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (err) {
    return err as Error;
  }
  throw new Error("expected a failure");
}

describe("the request", () => {
  it("asks for the product's 13-digit form with the fields, and sends nothing of the person", async () => {
    reply = json(200, fixture("valio-milk-6408430000258.json"));
    seen.length = 0;
    await ask("06408430000258");
    const [req] = seen;
    const url = new URL(req.url ?? "", baseUrl);
    expect(url.pathname).toBe("/api/v2/product/6408430000258");
    expect(url.searchParams.get("fields")).toBe(OFF_FIELDS);
    // Only the fields something reads: every one asked for is one the lookup uses.
    expect(OFF_FIELDS.split(",")).toEqual([
      "code",
      "product_name",
      "product_name_fi",
      "product_name_en",
      "brands",
      "nutriments",
      "no_nutrition_data",
    ]);
    expect([...url.searchParams.keys()]).toEqual(["fields"]);
    expect(req.headers["user-agent"]).toMatch(/^Hovimestari\/\d+\.\d+\.\d+$/);
    expect(req.headers["user-agent"]).not.toContain("@");
    // Every header sent is one the client sets or one fetch itself adds. A new one fails here.
    expect(Object.keys(req.headers).sort()).toEqual(SENT_HEADERS);
    expect(req.headers.accept).toBe("application/json");
  });

  it("sends a UPC-A as the 13-digit form Open Food Facts answers under", async () => {
    reply = json(200, fixture("upc-a-0012000161155.json"));
    seen.length = 0;
    const answer = await ask("00012000161155");
    expect(new URL(seen[0].url ?? "", baseUrl).pathname).toBe("/api/v2/product/0012000161155");
    expect(answer).toMatchObject({ kind: "found", code: "0012000161155" });
  });
});

describe("the answer", () => {
  it("reads 200 with status 1 as found", async () => {
    reply = json(200, fixture("valio-milk-6408430000258.json"));
    expect(await ask()).toMatchObject({ kind: "found", code: "6408430000258", product: { brands: "Valio" } });
  });

  it("answers the product's own code, not the code the answer echoes", async () => {
    // Open Food Facts echoes the asked code at the top. Only `product.code` is the product's.
    const merged = JSON.parse(fixture("valio-milk-6408430000258.json"));
    merged.product.code = "6400000000017";
    reply = json(200, JSON.stringify(merged));
    expect(await ask()).toMatchObject({ kind: "found", code: "6400000000017" });
    delete merged.product.code;
    reply = json(200, JSON.stringify(merged));
    expect(await ask()).toMatchObject({ kind: "found", code: null });
  });

  it("reads 404 and 200 with status 0 as not found", async () => {
    reply = json(404, fixture("not-found-6400000000017.json"));
    expect(await ask("06400000000017")).toEqual({ kind: "not_found" });
    reply = json(200, '{"code":"0000000000017","status":0,"status_verbose":"no code or invalid code"}');
    expect(await ask("06400000000017")).toEqual({ kind: "not_found" });
  });

  it.each([
    ["a 503", json(503, "busy")],
    ["a 429", json(429, "slow down")],
    ["a body that is not JSON", json(200, "<html>")],
    ["a body over 512 KB", json(200, `{"status":1,"pad":"${"x".repeat(600 * 1024)}"}`)],
  ])("counts %s as unavailable, with no code or address in the message", async (_, r) => {
    reply = r;
    const err = await failure(ask());
    expect(err).toBeInstanceOf(OffUnavailableError);
    expect(err.message).not.toMatch(/[0-9]{8,}/);
    expect(err.message).not.toContain("127.0.0.1");
  });

  it("counts a body over 512 KB as unavailable when no length is declared too", async () => {
    reply = (res) => {
      res.writeHead(200, { "content-type": "application/json" });
      for (let i = 0; i < 8; i++) res.write("x".repeat(100 * 1024));
      res.end();
    };
    expect((await failure(ask())).message).toBe("Open Food Facts lookup failed: body too long");
  });

  it("gives up on a slow answer at the timeout", async () => {
    expect(OFF_TIMEOUT_MS).toBe(5_000);
    reply = (res) => setTimeout(() => json(200, fixture("valio-milk-6408430000258.json"))(res), 1_200).unref();
    const err = await failure(ask("06408430000258", 200));
    expect(err.message).toBe("Open Food Facts lookup failed: timeout");
  });

  it("follows no redirect, and counts one as unavailable", async () => {
    const elsewhere = http.createServer((_, res) => json(200, fixture("valio-milk-6408430000258.json"))(res));
    await new Promise<void>((resolve) => elsewhere.listen(0, "127.0.0.1", resolve));
    let reached = 0;
    elsewhere.on("request", () => reached++);
    try {
      const target = `http://127.0.0.1:${(elsewhere.address() as AddressInfo).port}/api/v2/product/6408430000258`;
      reply = (res) => {
        res.writeHead(302, { location: target });
        res.end();
      };
      const err = await failure(ask());
      expect(err).toBeInstanceOf(OffUnavailableError);
      expect(err.message).toBe("Open Food Facts lookup failed: network");
      expect(reached).toBe(0);
    } finally {
      elsewhere.closeAllConnections();
      await new Promise<void>((resolve) => elsewhere.close(() => resolve()));
    }
  });

  it("counts a network failure as unavailable", async () => {
    const err = await failure(
      fetchProduct("06408430000258", {
        fetch: globalThis.fetch,
        baseUrl: "http://127.0.0.1:1",
        userAgent: "Hovimestari/0",
      }),
    );
    expect(err.message).toBe("Open Food Facts lookup failed: network");
  });
});
