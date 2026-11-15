import { AxiosError, CanceledError } from "axios";
import { makeQueryClient, shouldRetry } from "../queryClient";

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
