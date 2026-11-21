import { AxiosError, CanceledError } from "axios";
import { isFreshRead, makeQueryClient, shouldRetry, STALE } from "../queryClient";

describe("shouldRetry", () => {
  const networkError = new AxiosError("Network Error", "ERR_NETWORK");

  it("retries once a request that never got an answer", () => {
    expect(shouldRetry(0, networkError)).toBe(true);
    expect(shouldRetry(1, networkError)).toBe(false);
  });

  it("never retries an answer, a timeout or a cancel", () => {
    const answered = new AxiosError("Server Error", "ERR_BAD_RESPONSE", undefined, undefined, {
      status: 503,
    } as never);
    expect(shouldRetry(0, answered)).toBe(false);
    expect(shouldRetry(0, new AxiosError("timeout of 10000ms exceeded", "ECONNABORTED"))).toBe(false);
    expect(shouldRetry(0, new CanceledError())).toBe(false);
    expect(shouldRetry(0, new Error("boom"))).toBe(false);
  });
});

describe("makeQueryClient", () => {
  it("refetches neither on window focus nor on reconnect, and keeps unused data ten minutes", () => {
    const queries = makeQueryClient().getDefaultOptions().queries!;
    expect(queries.refetchOnWindowFocus).toBe(false);
    expect(queries.refetchOnReconnect).toBe(false);
    expect(queries.gcTime).toBe(10 * 60_000);
    expect(queries.staleTime).toBe(30_000);
  });
});

describe("isFreshRead", () => {
  const NOW = Date.parse("2026-11-16T12:00:00Z");
  beforeEach(() => jest.spyOn(Date, "now").mockReturnValue(NOW));
  afterEach(() => jest.restoreAllMocks());
  const read = { data: {}, isInvalidated: false, fetchStatus: "idle" as const, dataUpdatedAt: NOW - 1_000 };

  it("takes an answer read within the stale time, not marked stale and not being read again", () => {
    expect(isFreshRead(read)).toBe(true);
    expect(isFreshRead({ ...read, dataUpdatedAt: NOW - STALE.live + 1 })).toBe(true);
  });

  it("takes no other read: none, one with no answer, an old one, one marked stale, one being read again", () => {
    expect(isFreshRead(undefined)).toBe(false);
    expect(isFreshRead({ ...read, data: undefined })).toBe(false);
    expect(isFreshRead({ ...read, dataUpdatedAt: NOW - STALE.live })).toBe(false);
    expect(isFreshRead({ ...read, isInvalidated: true })).toBe(false);
    expect(isFreshRead({ ...read, fetchStatus: "fetching" })).toBe(false);
    expect(isFreshRead({ ...read, fetchStatus: "paused" })).toBe(false);
  });
});
