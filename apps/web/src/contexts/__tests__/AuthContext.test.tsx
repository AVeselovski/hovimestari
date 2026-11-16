import type { AuthHandlers } from "@/lib/api";
import { endAllSessions } from "@/lib/api/auth";
import { act, render, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { TEST_USER, testPassword } from "../../__tests__/helpers/auth";
import { AuthProvider, RENEWAL_TIMEOUT_MS, RETRY_DELAYS_MS, SESSION_START_TIMEOUT_MS, useAuth } from "../AuthContext";

const mockReplace = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ replace: mockReplace }) }));
jest.mock("@/lib/api/auth", () => ({ endAllSessions: jest.fn().mockResolvedValue(undefined) }));
const mockInject = jest.fn<void, [AuthHandlers]>();
jest.mock("@/lib/api", () => ({ injectAuthHandlers: (h: AuthHandlers) => mockInject(h) }));

const fetchSpy = jest.fn<Promise<Response>, Parameters<typeof fetch>>();

/** An access token whose `exp` is `inSeconds` from now. Only its payload is read. */
function accessToken(inSeconds = 900): string {
  const payload = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + inSeconds }));
  return `h.${payload}.s`;
}

function session(status = 200): Response {
  return new Response(JSON.stringify({ accessToken: accessToken(), user: TEST_USER }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const status = (code: number, body: unknown = {}): Response =>
  new Response(JSON.stringify(body), { status: code, headers: { "Content-Type": "application/json" } });

function wrapper({ children }: { children: ReactNode }): ReactNode {
  return <AuthProvider>{children}</AuthProvider>;
}

/**
 * A session the server has ended: the backend's 401, then the route's own
 * 401 to the one retry, sent with no cookie left.
 */
function endedSession(): void {
  fetchSpy
    .mockResolvedValueOnce(status(401, { code: "session_expired" }))
    .mockResolvedValueOnce(status(401, { code: "session_expired" }));
}

/** The paths the provider has called, in order. */
const calls = (): string[] => fetchSpy.mock.calls.map(([url]) => String(url));

beforeEach(() => {
  fetchSpy.mockReset();
  mockReplace.mockReset();
  global.fetch = fetchSpy as unknown as typeof fetch;
});

describe("restoring the session on launch", () => {
  it("is authenticated when the refresh handler answers a session", async () => {
    fetchSpy.mockResolvedValueOnce(session());
    const { result } = renderHook(() => useAuth(), { wrapper });
    expect(result.current.status).toBe("loading");
    await waitFor(() => expect(result.current.status).toBe("authenticated"));
    expect(result.current.user).toEqual(TEST_USER);
    expect(calls()).toEqual(["/api/auth/refresh"]);
  });

  it("is unauthenticated on a 401, after one retry under the lock", async () => {
    endedSession();
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("unauthenticated"));
    expect(calls()).toEqual(["/api/auth/refresh", "/api/auth/refresh"]);
  });

  it.each([
    ["a 503 from the handler", () => Promise.resolve(status(503, { code: "server_unreachable" }))],
    ["a failed fetch", () => Promise.reject(new TypeError("Failed to fetch"))],
  ])("is offline, not signed out, on %s, and retries with backoff", async (_case, failure) => {
    jest.useFakeTimers();
    try {
      fetchSpy.mockImplementationOnce(failure).mockImplementationOnce(failure).mockResolvedValueOnce(session());
      const { result } = renderHook(() => useAuth(), { wrapper });
      await waitFor(() => expect(result.current.status).toBe("offline"));
      expect(calls()).toHaveLength(1);

      await act(async () => jest.advanceTimersByTime(RETRY_DELAYS_MS[0]));
      await waitFor(() => expect(calls()).toHaveLength(2));
      expect(result.current.status).toBe("offline");

      await act(async () => jest.advanceTimersByTime(RETRY_DELAYS_MS[1] - 1));
      expect(calls()).toHaveLength(2);
      await act(async () => jest.advanceTimersByTime(1));
      await waitFor(() => expect(result.current.status).toBe("authenticated"));
    } finally {
      jest.useRealTimers();
    }
  });

  it("retries at once when the browser comes back online", async () => {
    fetchSpy.mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValueOnce(session());
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("offline"));
    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    await waitFor(() => expect(result.current.status).toBe("authenticated"));
  });

  it("gives up on a renewal that hangs and is offline, which frees the renewal lock", async () => {
    // Only the clock is faked. The fetch behaves as a real one does: it never
    // answers, and settles only when its signal aborts.
    jest.useFakeTimers();
    try {
      fetchSpy.mockImplementationOnce(
        (_url, init) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
          }),
      );
      const { result } = renderHook(() => useAuth(), { wrapper });
      await waitFor(() => expect(calls()).toEqual(["/api/auth/refresh"]));
      expect(RENEWAL_TIMEOUT_MS).toBeGreaterThan(10_000);

      await act(async () => jest.advanceTimersByTime(RENEWAL_TIMEOUT_MS - 1));
      expect(result.current.status).toBe("loading");
      await act(async () => jest.advanceTimersByTime(1));
      await waitFor(() => expect(result.current.status).toBe("offline"));
    } finally {
      jest.useRealTimers();
    }
  });

  it("shares one refresh between the launch and a request that hit a 401 meanwhile", async () => {
    // The refresh token rotates on use, so a second refresh with the same
    // cookie would be refused and sign the user out.
    let answer!: (res: Response) => void;
    fetchSpy.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)));
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(mockInject).toHaveBeenCalled());
    const { renewSession } = mockInject.mock.calls.at(-1)![0];

    const fromInterceptor = renewSession();
    await act(async () => answer(session()));
    expect(await fromInterceptor).toBe(true);
    expect(calls()).toEqual(["/api/auth/refresh"]);
    expect(result.current.status).toBe("authenticated");
  });
});

describe("a server fault is not the network", () => {
  it.each([
    ["a 500 from a misconfigured relay", () => status(500, { message: "Something went wrong." })],
    ["a 502 for a malformed grant", () => status(502, { message: "Something went wrong." })],
    ["a 503 that is not server_unreachable", () => status(503, { message: "busy" })],
    ["a 200 whose body is not JSON", () => new Response("<html>", { status: 200 })],
    ["a 200 whose body is not a session", () => status(200, { hello: "world" })],
  ])("reports an error, not offline, on %s, and retries only when asked", async (_case, answer) => {
    jest.useFakeTimers();
    try {
      fetchSpy.mockResolvedValueOnce(answer()).mockResolvedValueOnce(session());
      const { result } = renderHook(() => useAuth(), { wrapper });
      await waitFor(() => expect(result.current.status).toBe("error"));
      await act(async () => jest.advanceTimersByTime(120_000));
      expect(calls()).toHaveLength(1);
      act(() => result.current.retry());
      await waitFor(() => expect(result.current.status).toBe("authenticated"));
    } finally {
      jest.useRealTimers();
    }
  });

  it("refuses a sign-in whose 200 is not a session, without hanging", async () => {
    endedSession();
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("unauthenticated"));
    fetchSpy.mockResolvedValueOnce(new Response("not json", { status: 200 }));
    await expect(
      act(() => result.current.signIn({ email: TEST_USER.email, password: testPassword() })),
    ).rejects.toBeInstanceOf(Error);
    expect(result.current.status).toBe("unauthenticated");
  });
});

describe("the known-session marker", () => {
  beforeEach(() => localStorage.clear());

  it("is set by a session and cleared when the server ends it", async () => {
    fetchSpy.mockResolvedValueOnce(session());
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("authenticated"));
    expect(localStorage.getItem("hovi-signed-in")).toBe("1");

    endedSession();
    await act(async () => result.current.retry());
    await waitFor(() => expect(result.current.status).toBe("unauthenticated"));
    expect(localStorage.getItem("hovi-signed-in")).toBeNull();
  });

  it("survives the server being out of reach", async () => {
    localStorage.setItem("hovi-signed-in", "1");
    fetchSpy.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("offline"));
    expect(localStorage.getItem("hovi-signed-in")).toBe("1");
  });
});

describe("signing in, up and out", () => {
  async function signedOut() {
    endedSession();
    const hook = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(hook.result.current.status).toBe("unauthenticated"));
    fetchSpy.mockReset();
    return hook;
  }

  it("signs in through the same-origin handler with a JSON body", async () => {
    const { result } = await signedOut();
    const password = testPassword();
    fetchSpy.mockResolvedValueOnce(session());
    await act(() => result.current.signIn({ email: TEST_USER.email, password }));
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("/api/auth/sign-in");
    expect(new Headers(init?.headers).get("Content-Type")).toBe("application/json");
    expect(JSON.parse(String(init?.body))).toEqual({ email: TEST_USER.email, password });
    expect(result.current.status).toBe("authenticated");
  });

  // A sign-up cut short at the renewal's 12 seconds could create the account
  // and then answer email_taken to the retry, so sign-in and sign-up wait
  // longer. Only the clock is faked: the fetch never answers, and settles
  // only when its signal aborts, as a real one does.
  it.each([
    ["sign-in", "signIn"],
    ["sign-up", "signUp"],
  ] as const)("waits %s out past the renewal's limit, and gives up at its own", async (path, method) => {
    const { result } = await signedOut();
    let signal: AbortSignal | undefined;
    fetchSpy.mockImplementationOnce(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          signal = init?.signal ?? undefined;
          signal?.addEventListener("abort", () => reject(signal?.reason));
        }),
    );
    expect(SESSION_START_TIMEOUT_MS).toBeGreaterThan(RENEWAL_TIMEOUT_MS);
    jest.useFakeTimers();
    try {
      let settled: unknown = "pending";
      void result.current[method]({ email: TEST_USER.email, password: testPassword() }).then(
        () => (settled = "resolved"),
        (err: unknown) => (settled = err),
      );
      await act(async () => jest.advanceTimersByTime(0));
      expect(calls()).toEqual([`/api/auth/${path}`]);

      await act(async () => jest.advanceTimersByTime(RENEWAL_TIMEOUT_MS));
      expect(signal?.aborted).toBe(false);
      await act(async () => jest.advanceTimersByTime(SESSION_START_TIMEOUT_MS - RENEWAL_TIMEOUT_MS - 1));
      expect(signal?.aborted).toBe(false);
      expect(settled).toBe("pending");

      await act(async () => jest.advanceTimersByTime(1));
      expect(signal?.aborted).toBe(true);
      expect(settled).toBeInstanceOf(TypeError);
      expect(result.current.status).toBe("unauthenticated");
    } finally {
      jest.useRealTimers();
    }
  });

  it("throws the handler's code on a refused sign-up and stays signed out", async () => {
    const { result } = await signedOut();
    fetchSpy.mockResolvedValueOnce(status(409, { code: "email_taken" }));
    await expect(
      act(() => result.current.signUp({ email: TEST_USER.email, password: testPassword() })),
    ).rejects.toMatchObject({ code: "email_taken", status: 409 });
    expect(calls()).toEqual(["/api/auth/sign-up"]);
    expect(result.current.status).toBe("unauthenticated");
  });

  it("signs out through the handler and goes to sign-in", async () => {
    fetchSpy.mockResolvedValueOnce(session());
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("authenticated"));
    fetchSpy.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await act(() => result.current.signOut());
    expect(calls()).toEqual(["/api/auth/refresh", "/api/auth/sign-out"]);
    expect(result.current.status).toBe("unauthenticated");
    expect(result.current.user).toBeNull();
    expect(result.current.signedOut).toBe(true);
    expect(localStorage.getItem("hovi-signed-in")).toBeNull();
    expect(mockReplace).toHaveBeenCalledWith("/auth/sign-in");
  });

  it("signs out to the sign-in page the caller names, and keeps it for the guard", async () => {
    fetchSpy.mockResolvedValueOnce(session());
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("authenticated"));
    fetchSpy.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await act(() => result.current.signOut({ to: "/auth/sign-in?deleted=1" }));
    expect(mockReplace).toHaveBeenCalledWith("/auth/sign-in?deleted=1");
    expect(result.current.afterSignOut).toBe("/auth/sign-in?deleted=1");
    expect(result.current.status).toBe("unauthenticated");
  });

  it("remembers the session's address on the device while it lasts, and forgets it on sign-out", async () => {
    fetchSpy.mockResolvedValueOnce(session());
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("authenticated"));
    expect(localStorage.getItem("hovi-last-email")).toBe(TEST_USER.email);
    fetchSpy.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await act(() => result.current.signOut());
    expect(localStorage.getItem("hovi-last-email")).toBeNull();
  });

  it("when signing out everywhere cannot reach the server, throws and leaves this device signed in", async () => {
    fetchSpy.mockResolvedValueOnce(session());
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("authenticated"));
    jest.mocked(endAllSessions).mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(act(() => result.current.signOut({ everywhere: true }))).rejects.toBeInstanceOf(TypeError);
    expect(calls()).toEqual(["/api/auth/refresh"]);
    expect(result.current.status).toBe("authenticated");
    expect(result.current.signedOut).toBe(false);
    expect(localStorage.getItem("hovi-signed-in")).toBe("1");
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("still ends the local session when the sign-out handler cannot be reached", async () => {
    fetchSpy.mockResolvedValueOnce(session());
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("authenticated"));
    fetchSpy.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await act(() => result.current.signOut());
    expect(result.current.status).toBe("unauthenticated");
  });
});

it("useAuth outside the provider throws", () => {
  jest.spyOn(console, "error").mockImplementation(() => {});
  expect(() => render(<Probe />)).toThrow("useAuth must be used within AuthProvider");
});

function Probe(): ReactNode {
  return <span>{useAuth().status}</span>;
}
