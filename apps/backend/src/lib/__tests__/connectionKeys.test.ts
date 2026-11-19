import { CONNECTION_KEY_PREFIX } from "@hovimestari/types";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { createHash } from "crypto";
import { is, SQL, sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

// lib/connectionKeys: the key's format and hash, the lookup's four states and
// the last-use throttle. Lifted from finanssiappisV2's accessTokens test.
//
// The guarantees that matter (looked up by hash only, expiry on the database
// clock, at most one last-use write per 5 minutes) live in SQL a mocked db
// never runs. Feeding pre-filtered rows into the mock would pass with and
// without those predicates, so these tests render the query the helper built
// with drizzle's own dialect and assert on that. The lookup's states also run
// on a real database in routes/__tests__/connections.db.test.ts.

const mockDbSelect = jest.fn();
const mockDbUpdate = jest.fn();

jest.unstable_mockModule("../../db/index.js", () => ({
  db: { select: mockDbSelect, insert: jest.fn(), update: mockDbUpdate, delete: jest.fn() },
}));

const { generateConnectionKey, hashConnectionKey, lookupConnectionKey, touchLastUsed } =
  await import("../connectionKeys.js");
const { assistantConnections, users } = await import("../../db/schema/index.js");

const dialect = new PgDialect();
const render = (node: unknown) => dialect.sqlToQuery(is(node, SQL) ? node : sql`${node}`);
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/** A select chain awaitable at any step, recording every call. */
function queueSelect(result: unknown[]) {
  const chain = {
    from: jest.fn(),
    innerJoin: jest.fn(),
    where: jest.fn(),
    limit: jest.fn(),
    then: (onFulfilled: (v: unknown) => unknown) => Promise.resolve(result).then(onFulfilled),
  };
  for (const key of ["from", "innerJoin", "where", "limit"] as const) chain[key].mockReturnValue(chain);
  mockDbSelect.mockReturnValueOnce(chain);
  return chain;
}

/** update().set().where() */
function queueUpdate() {
  const chain = {
    set: jest.fn(),
    where: jest.fn(),
    then: (onFulfilled: (v: unknown) => unknown) => Promise.resolve(undefined).then(onFulfilled),
  };
  chain.set.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  mockDbUpdate.mockReturnValueOnce(chain);
  return chain;
}

beforeEach(() => {
  mockDbSelect.mockReset();
  mockDbUpdate.mockReset();
});

const CONNECTION_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "33333333-3333-4333-8333-333333333333";

describe("generateConnectionKey", () => {
  it("makes a hovi_mcp_ key of 32 random bytes in base64url, 52 characters", () => {
    const { key } = generateConnectionKey();
    expect(key).toMatch(/^hovi_mcp_[A-Za-z0-9_-]{43}$/);
    expect(key).toHaveLength(52);
    expect(CONNECTION_KEY_PREFIX).toBe("hovi_mcp_");
  });

  it("stores the SHA-256 hex of the key, never the key", () => {
    const { key, hash } = generateConnectionKey();
    expect(hash).toBe(sha256(key));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain(key.slice(CONNECTION_KEY_PREFIX.length));
  });

  it("never repeats a key", () => {
    const keys = new Set(Array.from({ length: 50 }, () => generateConnectionKey().key));
    expect(keys.size).toBe(50);
  });
});

describe("hashConnectionKey", () => {
  it("is SHA-256 hex, the same scheme as refresh tokens", () => {
    const { key } = generateConnectionKey();
    expect(hashConnectionKey(key)).toBe(sha256(key));
    expect(hashConnectionKey(key)).not.toBe(hashConnectionKey(`${key}x`));
  });
});

describe("lookupConnectionKey", () => {
  const HIT = {
    id: CONNECTION_ID,
    userId: USER_ID,
    name: "Claude on my laptop",
    access: "read",
    expiresAt: new Date("2026-12-01T00:00:00.000Z"),
    revokedAt: null,
    expired: false,
    timeZone: "Europe/Helsinki",
    touchDue: true,
  };

  it("looks the key up by the hash of the presented key, and by nothing else", async () => {
    const { key, hash } = generateConnectionKey();
    const chain = queueSelect([HIT]);

    await lookupConnectionKey(key);

    const where = render(chain.where.mock.calls[0][0]);
    expect(where.sql).toBe('"assistant_connections"."key_hash" = $1');
    expect(where.params).toEqual([hash]);
    expect(where.params).not.toContain(key);
  });

  it("reads revocation back, and expiry by the database clock", async () => {
    queueSelect([HIT]);

    await lookupConnectionKey(generateConnectionKey().key);

    const fields = mockDbSelect.mock.calls[0][0] as Record<string, unknown>;
    expect(fields.revokedAt).toBe(assistantConnections.revokedAt);
    expect(render(fields.expired).sql).toBe('"assistant_connections"."expires_at" <= now()');
    expect(render(fields.touchDue).sql).toBe(
      '("assistant_connections"."last_used_at" is null or "assistant_connections"."last_used_at" < now() - interval \'5 minutes\')',
    );
  });

  it("joins the key's user for the time zone", async () => {
    const chain = queueSelect([HIT]);

    await lookupConnectionKey(generateConnectionKey().key);

    expect(chain.innerJoin).toHaveBeenCalledTimes(1);
    const [table, on] = chain.innerJoin.mock.calls[0];
    expect(table).toBe(users);
    expect(render(on).sql).toBe('"users"."id" = "assistant_connections"."user_id"');
    const fields = mockDbSelect.mock.calls[0][0] as Record<string, unknown>;
    expect(fields.timeZone).toBe(users.timeZone);
  });

  it("resolves a live key to its connection, user, access, expiry and time zone", async () => {
    queueSelect([HIT]);

    expect(await lookupConnectionKey(generateConnectionKey().key)).toEqual({
      state: "active",
      connection: {
        id: CONNECTION_ID,
        userId: USER_ID,
        name: "Claude on my laptop",
        access: "read",
        expiresAt: HIT.expiresAt,
        timeZone: "Europe/Helsinki",
        touchDue: true,
      },
    });
  });

  it("reports a revoked key as revoked, and nothing more about it", async () => {
    queueSelect([{ ...HIT, revokedAt: new Date("2026-10-01T00:00:00.000Z") }]);
    expect(await lookupConnectionKey(generateConnectionKey().key)).toEqual({ state: "revoked" });
  });

  it("reports an expired key as expired, and nothing more about it", async () => {
    queueSelect([{ ...HIT, expired: true }]);
    expect(await lookupConnectionKey(generateConnectionKey().key)).toEqual({ state: "expired" });
  });

  it("calls a key that is both revoked and expired revoked", async () => {
    queueSelect([{ ...HIT, revokedAt: new Date("2026-10-01T00:00:00.000Z"), expired: true }]);
    expect(await lookupConnectionKey(generateConnectionKey().key)).toEqual({ state: "revoked" });
  });

  it("reports unknown when nothing matches", async () => {
    queueSelect([]);
    expect(await lookupConnectionKey(generateConnectionKey().key)).toEqual({ state: "unknown" });
  });

  it("reports unknown without a query for anything that is not a connection key", async () => {
    expect(await lookupConnectionKey("eyJhbGciOiJIUzI1NiJ9.e30.sig")).toEqual({ state: "unknown" });
    expect(await lookupConnectionKey("")).toEqual({ state: "unknown" });
    expect(mockDbSelect).not.toHaveBeenCalled();
  });
});

describe("touchLastUsed", () => {
  it("writes last_used_at only on a key not revoked, when it is empty or older than 5 minutes", async () => {
    const chain = queueUpdate();

    await touchLastUsed(CONNECTION_ID);

    expect(mockDbUpdate).toHaveBeenCalledWith(assistantConnections);
    expect(Object.keys(chain.set.mock.calls[0][0] as object)).toEqual(["lastUsedAt"]);
    const where = render(chain.where.mock.calls[0][0]);
    expect(where.sql).toBe(
      '("assistant_connections"."id" = $1 and "assistant_connections"."revoked_at" is null and ("assistant_connections"."last_used_at" is null or "assistant_connections"."last_used_at" < now() - interval \'5 minutes\'))',
    );
    expect(where.params).toEqual([CONNECTION_ID]);
  });

  it("logs and swallows a failed write, so the call that used the key still succeeds", async () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
    mockDbUpdate.mockImplementationOnce(() => {
      throw new Error("connection lost");
    });

    await expect(touchLastUsed(CONNECTION_ID)).resolves.toBeUndefined();
    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(String(consoleError.mock.calls[0][0])).toContain(CONNECTION_ID);
    consoleError.mockRestore();
  });
});
