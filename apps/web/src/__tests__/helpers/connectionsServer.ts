import { api } from "@/lib/api";
import {
  CONNECTION_WRITE_EXPIRY_DAYS,
  MAX_LIVE_CONNECTIONS,
  type Connection,
  type ConnectionAccess,
  type ConnectionList,
  type CreatedConnection,
  type ErrorCode,
} from "@hovimestari/types";
import {
  AxiosError,
  AxiosHeaders,
  type AxiosAdapter,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from "axios";
import { randomBytes, randomUUID } from "node:crypto";

// ---------------------------------------------------------------------------
// A stand-in for the backend's `/connections` routes, behind the real API
// client: it replaces axios's adapter, so the interceptors (the bearer, the
// renew-once-and-retry on a 401) run as in the app. It remembers what it was
// sent: a created key shows in the next list, a revoked one is gone, and the
// limit of ten counts what it holds. Its refusals carry the backend's codes.
// ---------------------------------------------------------------------------

/**
 * A connection key made at run time, as the server makes one: the prefix and
 * 32 random bytes in base64url. Never a literal, so no committed file holds
 * anything a secret scanner reads as a key.
 */
export function testConnectionKey(): string {
  return ["hovi", "mcp", randomBytes(32).toString("base64url")].join("_");
}

/** One request the fake server answered. */
export interface SentRequest {
  method: string;
  url: string;
  body: unknown;
  bearer: string | undefined;
}

/** A refusal the test makes the server give: status and code. */
export interface Refusal {
  status: number;
  code?: ErrorCode;
}

export interface FakeConnectionsServer {
  /** What the server holds now, newest first. Tests may edit it. */
  connections: Connection[];
  availability: ConnectionList["availability"];
  /** Every key the server has handed out. */
  issuedKeys: string[];
  /** Every request, in order. */
  sent: SentRequest[];
  /** Answers the next list with a failure while set. */
  listRefusal: Refusal | null;
  /** While set, a list read waits for this before it answers, as a slow network does. */
  listGate: Promise<void> | null;
  /** While true, a create makes its key and the answer is lost on the way, as a dropped network does. */
  loseCreateAnswer: boolean;
  /** Decides a refusal for a create before the server's own rules, or null to go on. */
  refuseCreate: ((req: SentRequest) => Refusal | null) | null;
  /** Decides a refusal for a revoke before the server's own rules, or null to go on. */
  refuseRevoke: ((req: SentRequest) => Refusal | null) | null;
  /** Puts the client's own adapter back. */
  restore: () => void;
}

function answer(config: InternalAxiosRequestConfig, status: number, data: unknown): Promise<AxiosResponse> {
  const response = { data, status, statusText: "", headers: {}, config } as AxiosResponse;
  if (status >= 400) {
    return Promise.reject(new AxiosError("refused", "ERR_BAD_REQUEST", config, undefined, response));
  }
  return Promise.resolve(response);
}

function refuse(config: InternalAxiosRequestConfig, refusal: Refusal): Promise<AxiosResponse> {
  return answer(config, refusal.status, refusal.code ? { code: refusal.code, message: refusal.code } : {});
}

/** A connection as the server lists it, for a test's starting state. */
export function testConnection(overrides: Partial<Connection> = {}): Connection {
  return {
    id: randomUUID(),
    name: "Claude on my laptop",
    access: "read",
    status: "active",
    createdAt: "2026-11-01T08:00:00.000Z",
    expiresAt: "2026-12-19T08:00:00.000Z",
    lastUsedAt: null,
    ...overrides,
  };
}

/** Installs the fake server behind `api`. Call `restore()` after the test. */
export function fakeConnectionsServer(
  initial: Partial<Pick<FakeConnectionsServer, "connections" | "availability">> = {},
): FakeConnectionsServer {
  const previous = api.defaults.adapter;
  const server: FakeConnectionsServer = {
    connections: initial.connections ?? [],
    availability: initial.availability ?? { connect: true, write: false },
    issuedKeys: [],
    sent: [],
    listRefusal: null,
    listGate: null,
    loseCreateAnswer: false,
    refuseCreate: null,
    refuseRevoke: null,
    restore: () => {
      api.defaults.adapter = previous;
    },
  };

  const adapter: AxiosAdapter = async (config) => {
    const method = (config.method ?? "get").toUpperCase();
    const url = config.url ?? "";
    const bearer = AxiosHeaders.from(config.headers).get("Authorization") as string | undefined;
    const body: unknown = typeof config.data === "string" ? JSON.parse(config.data) : config.data;
    const req: SentRequest = { method, url, body, bearer };
    server.sent.push(req);

    if (method === "GET" && url === "/connections") {
      if (server.listGate) await server.listGate;
      if (server.listRefusal) return refuse(config, server.listRefusal);
      const list: ConnectionList = {
        connections: server.connections.map((c) => ({ ...c })),
        availability: { ...server.availability },
      };
      return answer(config, 200, list);
    }

    if (method === "POST" && url === "/connections") {
      const own = server.refuseCreate?.(req);
      if (own) return refuse(config, own);
      const b = body as { name: string; access: ConnectionAccess; expiresInDays: number };
      if (!server.availability.connect) return refuse(config, { status: 409, code: "connect_off" });
      if (b.access === "read_write" && !server.availability.write) {
        return refuse(config, { status: 400, code: "writes_off" });
      }
      if (b.access === "read_write" && !(CONNECTION_WRITE_EXPIRY_DAYS as readonly number[]).includes(b.expiresInDays)) {
        return refuse(config, { status: 400, code: "connection_write_expiry_too_long" });
      }
      const now = Date.now();
      const live = server.connections.filter((c) => Date.parse(c.expiresAt) > now).length;
      if (live >= MAX_LIVE_CONNECTIONS) return refuse(config, { status: 409, code: "connection_limit" });
      const connection: Connection = {
        id: randomUUID(),
        name: b.name.trim(),
        access: b.access,
        status: "active",
        createdAt: new Date(now).toISOString(),
        expiresAt: new Date(now + b.expiresInDays * 24 * 60 * 60 * 1000).toISOString(),
        lastUsedAt: null,
      };
      const key = testConnectionKey();
      server.issuedKeys.push(key);
      server.connections.unshift(connection);
      const created: CreatedConnection = { connection: { ...connection }, key };
      if (server.loseCreateAnswer) {
        return Promise.reject(new AxiosError("Network Error", AxiosError.ERR_NETWORK, config));
      }
      return answer(config, 201, created);
    }

    const revoke = /^\/connections\/([^/]+)$/.exec(url);
    if (method === "DELETE" && revoke) {
      const own = server.refuseRevoke?.(req);
      if (own) return refuse(config, own);
      const id = decodeURIComponent(revoke[1] ?? "");
      const at = server.connections.findIndex((c) => c.id === id);
      if (at < 0) return refuse(config, { status: 404, code: "connection_not_found" });
      server.connections.splice(at, 1);
      return answer(config, 204, "");
    }

    return refuse(config, { status: 404 });
  };

  api.defaults.adapter = adapter;
  return server;
}
