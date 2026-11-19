import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { OAuthError, OAuthErrorCode } from "@modelcontextprotocol/server";
import type { ConnectionLookup, ResolvedConnection } from "../../lib/connectionKeys.js";
import { CONNECTION_ID, freshKey, TIME_ZONE, USER_ID } from "./harness.js";

// The verifier wraps lib/connectionKeys.ts. That module's own tests pin how
// the lookup tells a live key from a revoked, an expired and an unknown one.
// Here each state maps to its refusal, a known but dead key is reported to
// the caller, and a live key becomes AuthInfo pinned to its user.

const lookupConnectionKey = jest.fn<(key: string) => Promise<ConnectionLookup>>();
jest.unstable_mockModule("../../lib/connectionKeys.js", () => ({ lookupConnectionKey, touchLastUsed: jest.fn() }));

const { verifyConnectionKey, connectionAuthOf } = await import("../auth.js");

const KEY = freshKey();
const EXPIRES = new Date("2026-12-19T10:00:00.000Z");

function live(access: ResolvedConnection["access"] = "read", touchDue = false): ResolvedConnection {
  return {
    id: CONNECTION_ID,
    userId: USER_ID,
    name: "Claude on my laptop",
    access,
    expiresAt: EXPIRES,
    timeZone: TIME_ZONE,
    touchDue,
  };
}

describe("verifyConnectionKey", () => {
  beforeEach(() => {
    lookupConnectionKey.mockReset();
  });

  it("turns a live key into AuthInfo pinned to its user", async () => {
    lookupConnectionKey.mockResolvedValue({ state: "active", connection: live() });
    const info = await verifyConnectionKey(KEY);
    expect(lookupConnectionKey).toHaveBeenCalledWith(KEY);
    expect(info).toEqual({
      token: CONNECTION_ID,
      clientId: CONNECTION_ID,
      scopes: ["data:read"],
      expiresAt: EXPIRES.getTime() / 1000,
      extra: {
        connectionId: CONNECTION_ID,
        connectionName: "Claude on my laptop",
        userId: USER_ID,
        access: "read",
        expiresAt: EXPIRES.toISOString(),
        timeZone: TIME_ZONE,
      },
    });
  });

  it("carries the plaintext key nowhere in what it returns", async () => {
    lookupConnectionKey.mockResolvedValue({ state: "active", connection: live("read_write", true) });
    const info = await verifyConnectionKey(KEY);
    expect(JSON.stringify(info)).not.toContain(KEY);
    expect(info.token).not.toBe(KEY);
  });

  it("gives expiresAt in whole epoch seconds", async () => {
    lookupConnectionKey.mockResolvedValue({
      state: "active",
      connection: { ...live(), expiresAt: new Date("2026-12-19T10:00:00.900Z") },
    });
    expect((await verifyConnectionKey(KEY)).expiresAt).toBe(Date.parse("2026-12-19T10:00:00.000Z") / 1000);
  });

  it("adds the write scope only for a read_write key", async () => {
    lookupConnectionKey.mockResolvedValue({ state: "active", connection: live("read_write") });
    expect((await verifyConnectionKey(KEY)).scopes).toEqual(["data:read", "data:write"]);
  });

  it.each<[Exclude<ConnectionLookup["state"], "active">, string]>([
    ["unknown", "Invalid or expired token."],
    ["expired", "This key has expired. Create a new one in Settings."],
    ["revoked", "This key was revoked."],
  ])("refuses an %s key as invalid_token saying why, without echoing it", async (state, message) => {
    lookupConnectionKey.mockResolvedValue({ state });
    const error = await verifyConnectionKey(KEY).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(OAuthError);
    expect((error as OAuthError).code).toBe(OAuthErrorCode.InvalidToken);
    expect((error as OAuthError).message).toBe(message);
    expect(JSON.stringify((error as OAuthError).toResponseObject())).not.toContain(KEY);
  });

  it.each(["expired", "revoked"] as const)("reports an %s key to the caller before refusing it", async (state) => {
    lookupConnectionKey.mockResolvedValue({ state });
    const onDeadKey = jest.fn();
    await expect(verifyConnectionKey(KEY, { onDeadKey })).rejects.toBeInstanceOf(OAuthError);
    expect(onDeadKey).toHaveBeenCalledWith(state);
  });

  it("reports neither an unknown key nor a live one as dead", async () => {
    const onDeadKey = jest.fn();
    lookupConnectionKey.mockResolvedValue({ state: "unknown" });
    await expect(verifyConnectionKey(KEY, { onDeadKey })).rejects.toBeInstanceOf(OAuthError);
    lookupConnectionKey.mockResolvedValue({ state: "active", connection: live() });
    await verifyConnectionKey(KEY, { onDeadKey });
    expect(onDeadKey).not.toHaveBeenCalled();
  });

  it("logs a failed lookup without the key, rethrows it, and reports no dead key", async () => {
    const logged = jest.spyOn(console, "error").mockImplementation(() => undefined);
    const failure = Object.assign(new Error("canceling statement due to statement timeout"), { code: "57014" });
    lookupConnectionKey.mockRejectedValue(failure);
    const onDeadKey = jest.fn();
    const onTouchDue = jest.fn();
    await expect(verifyConnectionKey(KEY, { onDeadKey, onTouchDue })).rejects.toBe(failure);
    expect(logged).toHaveBeenCalledTimes(1);
    expect(logged).toHaveBeenCalledWith("[mcp] key lookup failed:", expect.stringContaining("code=57014"));
    expect(JSON.stringify(logged.mock.calls)).not.toContain(KEY);
    expect(onDeadKey).not.toHaveBeenCalled();
    expect(onTouchDue).not.toHaveBeenCalled();
    logged.mockRestore();
  });

  it("reports a use due to be recorded only when the lookup says so", async () => {
    const onTouchDue = jest.fn();
    lookupConnectionKey.mockResolvedValue({ state: "active", connection: live("read", false) });
    await verifyConnectionKey(KEY, { onTouchDue });
    expect(onTouchDue).not.toHaveBeenCalled();
    lookupConnectionKey.mockResolvedValue({ state: "active", connection: live("read", true) });
    await verifyConnectionKey(KEY, { onTouchDue });
    expect(onTouchDue).toHaveBeenCalledTimes(1);
  });
});

describe("connectionAuthOf", () => {
  it("reads the connection back from AuthInfo", async () => {
    lookupConnectionKey.mockResolvedValue({ state: "active", connection: live() });
    const extra = connectionAuthOf(await verifyConnectionKey(KEY));
    expect(extra).toMatchObject({ connectionId: CONNECTION_ID, userId: USER_ID, timeZone: TIME_ZONE });
  });

  it("refuses a request that never went through the verifier", () => {
    expect(() => connectionAuthOf(undefined)).toThrow();
    expect(() => connectionAuthOf({ token: "x", clientId: "y", scopes: [] })).toThrow();
  });
});
