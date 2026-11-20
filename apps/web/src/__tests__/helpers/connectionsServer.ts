import { api } from "@/lib/api";
import {
  CONNECTION_WRITE_EXPIRY_DAYS,
  DEFAULT_CHANGE_PAGE_SIZE,
  MAX_LIVE_CONNECTIONS,
  type AssistantChange,
  type AssistantChangePage,
  type Connection,
  type ConnectionAccess,
  type ConnectionList,
  type CreatedConnection,
  type ErrorCode,
  type PastConnection,
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
//
// It also holds each connection's record of changes, newest first, and pages
// it as the route does: a cursor names the last change a page showed, a page
// after it starts below that change, and a cursor it never issued, or one
// whose change is no longer in the record, is refused `invalid_request`. The
// list counts each connection's changes from it.
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
  /** The query parameters, such as a changes read's `cursor`. */
  params: Record<string, string | undefined>;
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
  /** Each connection's record, by connection id, newest first. Tests may add to it at any time. */
  changes: Map<string, AssistantChange[]>;
  /** Revoked connections that made changes, as the list answers them. */
  past: PastConnection[];
  /** How many changes a page holds. */
  pageSize: number;
  /** Answers the next changes reads with a failure while set. */
  changesRefusal: Refusal | null;
  /** While set, a changes read waits for this before it answers. */
  changesGate: Promise<void> | null;
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
    changes: new Map(),
    past: [],
    pageSize: DEFAULT_CHANGE_PAGE_SIZE,
    changesRefusal: null,
    changesGate: null,
    listRefusal: null,
    listGate: null,
    loseCreateAnswer: false,
    refuseCreate: null,
    refuseRevoke: null,
    restore: () => {
      api.defaults.adapter = previous;
    },
  };

  // Each issued cursor, to the connection and the change it names.
  const cursors = new Map<string, { connectionId: string; changeId: string }>();

  const adapter: AxiosAdapter = async (config) => {
    const method = (config.method ?? "get").toUpperCase();
    const url = config.url ?? "";
    const params = (config.params ?? {}) as Record<string, string | undefined>;
    const bearer = AxiosHeaders.from(config.headers).get("Authorization") as string | undefined;
    const body: unknown = typeof config.data === "string" ? JSON.parse(config.data) : config.data;
    const req: SentRequest = { method, url, params: { ...params }, body, bearer };
    server.sent.push(req);

    if (method === "GET" && url === "/connections") {
      if (server.listGate) await server.listGate;
      if (server.listRefusal) return refuse(config, server.listRefusal);
      const list: ConnectionList = {
        connections: server.connections.map((c) => ({ ...c, changeCount: server.changes.get(c.id)?.length ?? 0 })),
        past: server.past.map((p) => ({ ...p })),
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

    const changesOf = /^\/connections\/([^/]+)\/changes$/.exec(url);
    if (method === "GET" && changesOf) {
      if (server.changesGate) await server.changesGate;
      if (server.changesRefusal) return refuse(config, server.changesRefusal);
      const id = decodeURIComponent(changesOf[1] ?? "");
      const known = server.connections.some((c) => c.id === id) || server.past.some((p) => p.id === id);
      if (!known) return refuse(config, { status: 404, code: "connection_not_found" });
      const record = server.changes.get(id) ?? [];
      let start = 0;
      if (params.cursor !== undefined) {
        const named = cursors.get(params.cursor);
        if (!named || named.connectionId !== id) return refuse(config, { status: 400, code: "invalid_request" });
        // Below the change the cursor names, wherever newer changes have put it since.
        const at = record.findIndex((c) => c.id === named.changeId);
        // The route reads the change back by its id, and refuses a cursor whose change it cannot find.
        if (at < 0) return refuse(config, { status: 400, code: "invalid_request" });
        start = at + 1;
      }
      const shown = record.slice(start, start + server.pageSize);
      const more = start + server.pageSize < record.length;
      let nextCursor: string | null = null;
      if (more) {
        nextCursor = randomBytes(16).toString("base64url");
        cursors.set(nextCursor, { connectionId: id, changeId: shown[shown.length - 1]!.id });
      }
      const page: AssistantChangePage = { changes: shown.map((c) => ({ ...c })), nextCursor };
      return answer(config, 200, page);
    }

    const revoke = /^\/connections\/([^/]+)$/.exec(url);
    if (method === "DELETE" && revoke) {
      const own = server.refuseRevoke?.(req);
      if (own) return refuse(config, own);
      const id = decodeURIComponent(revoke[1] ?? "");
      const at = server.connections.findIndex((c) => c.id === id);
      if (at < 0) return refuse(config, { status: 404, code: "connection_not_found" });
      const [gone] = server.connections.splice(at, 1);
      // A revoked key that made changes is listed under past, newest change first.
      const record = server.changes.get(id) ?? [];
      if (gone && record.length > 0) {
        server.past.push({ id, name: gone.name, changeCount: record.length, lastChangeAt: record[0]!.at });
        server.past.sort((a, b) => b.lastChangeAt.localeCompare(a.lastChangeAt));
      }
      return answer(config, 204, "");
    }

    return refuse(config, { status: 404 });
  };

  api.defaults.adapter = adapter;
  return server;
}
