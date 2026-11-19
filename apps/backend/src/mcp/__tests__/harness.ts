import { CONNECTION_KEY_PREFIX } from "@hovimestari/types";
import { jest } from "@jest/globals";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import type { Express } from "express";
import { randomBytes } from "node:crypto";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { ConnectionLookup, ResolvedConnection } from "../../lib/connectionKeys.js";

// Lifted from finanssiappisV2's mcp/__tests__/harness.ts. A real listening
// server and a real MCP client, because Supertest cannot carry the client's
// streamable HTTP exchange, and a stand-in for the key lookup. Every key is
// made here at start-up, in the format lib/connectionKeys.ts makes, so no
// test file holds one.

/** A key in the real format, made now. */
export const freshKey = (): string => CONNECTION_KEY_PREFIX + randomBytes(32).toString("base64url");

export const USER_ID = "11111111-1111-4111-8111-111111111111";
export const OTHER_USER_ID = "22222222-2222-4222-8222-222222222222";
export const CONNECTION_ID = "33333333-3333-4333-8333-333333333333";
export const SECOND_CONNECTION_ID = "44444444-4444-4444-8444-444444444444";
export const WRITE_CONNECTION_ID = "55555555-5555-4555-8555-555555555555";
export const OTHER_CONNECTION_ID = "66666666-6666-4666-8666-666666666666";
export const CONNECTION_NAME = "Claude on my laptop";
export const TIME_ZONE = "Europe/Helsinki";

/** A read key of USER_ID. */
export const READ_KEY = freshKey();
/** A second read key of USER_ID: it shares that user's limits. */
export const SECOND_KEY = freshKey();
/** A read-and-write key of USER_ID. */
export const WRITE_KEY = freshKey();
/** A read key of OTHER_USER_ID. */
export const OTHER_USER_KEY = freshKey();
/** Known keys that no longer work: they resolve to a dead state, not to unknown. */
export const EXPIRED_KEY = freshKey();
export const REVOKED_KEY = freshKey();

const LIVE_KEYS: Record<string, Pick<ResolvedConnection, "id" | "userId" | "access">> = {
  [READ_KEY]: { id: CONNECTION_ID, userId: USER_ID, access: "read" },
  [SECOND_KEY]: { id: SECOND_CONNECTION_ID, userId: USER_ID, access: "read" },
  [WRITE_KEY]: { id: WRITE_CONNECTION_ID, userId: USER_ID, access: "read_write" },
  [OTHER_USER_KEY]: { id: OTHER_CONNECTION_ID, userId: OTHER_USER_ID, access: "read" },
};

/** The live keys above resolve, the two dead ones are known, nothing else is: a stand-in for lookupConnectionKey. */
export async function resolveTestKey(key: string): Promise<ConnectionLookup> {
  if (key === EXPIRED_KEY) return { state: "expired" };
  if (key === REVOKED_KEY) return { state: "revoked" };
  const live = LIVE_KEYS[key];
  if (!live) return { state: "unknown" };
  return {
    state: "active",
    connection: {
      ...live,
      name: CONNECTION_NAME,
      expiresAt: new Date("2027-01-01T00:00:00.000Z"),
      timeZone: TIME_ZONE,
      touchDue: true,
    },
  };
}

/** The rest of lib/connectionKeys.js, which the REST routes import and these tests never call. */
export const OTHER_KEY_EXPORTS = {
  hashConnectionKey: () => "",
  generateConnectionKey: () => ({ key: "", hash: "" }),
};

/** The mocks a suite registers for lib/connectionKeys.js. */
export function keyMocks(): {
  lookupConnectionKey: jest.Mock<typeof resolveTestKey>;
  touchLastUsed: jest.Mock<(connectionId: string) => Promise<void>>;
} {
  return {
    lookupConnectionKey: jest.fn(resolveTestKey),
    touchLastUsed: jest.fn(async (_connectionId: string) => undefined),
  };
}

export async function listen(app: Express): Promise<{ url: URL; close: () => Promise<void> }> {
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const { port } = server.address() as AddressInfo;
  return {
    url: new URL(`http://127.0.0.1:${port}/mcp`),
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

/**
 * A connected MCP client. `legacy` speaks the 2025 revisions (SSE-capable,
 * initialize first), `modern` pins 2026-07-28 (plain JSON, protocol headers).
 */
export async function connect(url: URL, key: string, era: "legacy" | "modern" = "legacy"): Promise<Client> {
  const client = new Client(
    { name: "test", version: "0.0.0" },
    era === "modern" ? { versionNegotiation: { mode: { pin: "2026-07-28" } } } : {},
  );
  await client.connect(
    new StreamableHTTPClientTransport(url, { requestInit: { headers: { Authorization: `Bearer ${key}` } } }),
  );
  return client;
}

/** The SDK warns once when the handler is built, and every tool call logs a line. */
export function quietConsole() {
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
  jest.spyOn(console, "log").mockImplementation(() => undefined);
}

/**
 * Freezes `Date` at `at`, and only `Date`: timers, ticks and I/O stay real,
 * so a server, a client and a database still run. The limiters' windows and
 * every service clock then read the same fixed instant.
 */
export function freezeDate(at: string | number) {
  jest.useFakeTimers({
    now: new Date(at),
    doNotFake: [
      "hrtime",
      "nextTick",
      "performance",
      "queueMicrotask",
      "requestAnimationFrame",
      "cancelAnimationFrame",
      "requestIdleCallback",
      "cancelIdleCallback",
      "setImmediate",
      "clearImmediate",
      "setInterval",
      "clearInterval",
      "setTimeout",
      "clearTimeout",
    ],
  });
}
