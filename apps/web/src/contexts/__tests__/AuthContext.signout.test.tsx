import type { AuthHandlers } from "@/lib/api";
import { dayTabHref, rememberShownDay, useShownDay } from "@/lib/shownDay";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { TEST_USER, testPassword } from "../../__tests__/helpers/auth";
import { AuthProvider, RENEWAL_TIMEOUT_MS, useAuth, type AuthStatus } from "../AuthContext";

// A sign-out must never be undone by a renewal that was already out when the
// person tapped Sign out. Each test holds a renewal open across the sign-out.

jest.mock("next/navigation", () => ({ useRouter: () => ({ replace: jest.fn() }) }));
jest.mock("@/lib/api/auth", () => ({ endAllSessions: jest.fn().mockResolvedValue(undefined) }));
const mockInject = jest.fn<void, [AuthHandlers]>();
jest.mock("@/lib/api", () => ({ injectAuthHandlers: (h: AuthHandlers) => mockInject(h) }));

const fetchSpy = jest.fn<Promise<Response>, Parameters<typeof fetch>>();
const calls = (): string[] => fetchSpy.mock.calls.map(([url]) => String(url));

function session(): Response {
  const payload = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 900 }));
  return new Response(JSON.stringify({ accessToken: `h.${payload}.s`, user: TEST_USER }), { status: 200 });
}

/** The browser's lock manager: an exclusive lock per name, granted in request order. */
function installLocks(): void {
  const queues = new Map<string, Promise<unknown>>();
  Object.defineProperty(navigator, "locks", {
    configurable: true,
    value: {
      request<T>(name: string, callback: () => Promise<T>): Promise<T> {
        const before = queues.get(name) ?? Promise.resolve();
        const run = before.then(callback, callback);
        queues.set(
          name,
          run.catch(() => undefined),
        );
        return run;
      },
    },
  });
}

function removeLocks(): void {
  Object.defineProperty(navigator, "locks", { configurable: true, value: undefined });
}

function wrapper({ children }: { children: ReactNode }): ReactNode {
  return <AuthProvider>{children}</AuthProvider>;
}

/** Every status the hook rendered, in order. */
let seen: AuthStatus[];

/** Renders a signed-in tab, then starts a renewal (the API client's 401 path) whose answer the test holds. */
async function signedInWithRenewalOut() {
  fetchSpy.mockResolvedValueOnce(session());
  const hook = renderHook(
    () => {
      const auth = useAuth();
      seen.push(auth.status);
      return auth;
    },
    { wrapper },
  );
  await waitFor(() => expect(hook.result.current.status).toBe("authenticated"));
  let answer!: (res: Response) => void;
  fetchSpy.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)));
  const renewed = mockInject.mock.calls.at(-1)![0].renewSession();
  await waitFor(() => expect(calls()).toEqual(["/api/auth/refresh", "/api/auth/refresh"]));
  fetchSpy.mockResolvedValueOnce(new Response(null, { status: 204 }));
  return { hook, renewed, answer: (res: Response) => answer(res) };
}

beforeEach(() => {
  seen = [];
  fetchSpy.mockReset();
  mockInject.mockReset();
  localStorage.clear();
  global.fetch = fetchSpy as unknown as typeof fetch;
});
afterEach(removeLocks);

describe.each([
  ["with Web Locks", installLocks],
  ["without Web Locks", removeLocks],
])("signing out during a renewal, %s", (_case, setUpLocks) => {
  beforeEach(setUpLocks);

  it("posts the sign-out only after the renewal has answered", async () => {
    const { hook, answer } = await signedInWithRenewalOut();
    let done = false;
    let signingOut!: Promise<void>;
    act(() => {
      signingOut = hook.result.current.signOut().then(() => {
        done = true;
      });
    });
    // Give a sign-out that does not wait every chance to post.
    await act(async () => new Promise((r) => setTimeout(r, 20)));
    expect(calls()).toEqual(["/api/auth/refresh", "/api/auth/refresh"]);
    expect(done).toBe(false);

    await act(async () => answer(session()));
    await act(() => signingOut);
    expect(calls()).toEqual(["/api/auth/refresh", "/api/auth/refresh", "/api/auth/sign-out"]);
  });

  it("discards the renewal's session, so the tab never signs back in", async () => {
    const { hook, renewed, answer } = await signedInWithRenewalOut();
    let signingOut!: Promise<void>;
    act(() => {
      signingOut = hook.result.current.signOut();
    });
    const from = seen.length;
    const setItem = jest.spyOn(Storage.prototype, "setItem");
    try {
      await act(async () => answer(session()));
      await act(() => signingOut);
      expect(await renewed).toBe(false);
      // Across every state after the tap, not only the last one.
      expect(seen.slice(from)).not.toContain("authenticated");
      expect(setItem).not.toHaveBeenCalledWith("hovi-signed-in", "1");
    } finally {
      setItem.mockRestore();
    }
    expect(hook.result.current.status).toBe("unauthenticated");
    expect(hook.result.current.signedOut).toBe(true);
    expect(localStorage.getItem("hovi-signed-in")).toBeNull();

    // Signing in again starts a fresh generation that renews normally.
    fetchSpy.mockResolvedValueOnce(session());
    await act(() => hook.result.current.signIn({ email: TEST_USER.email, password: testPassword() }));
    expect(hook.result.current.status).toBe("authenticated");
  });
});

it("completes a sign-out tapped during a renewal that then times out", async () => {
  installLocks();
  jest.useFakeTimers();
  try {
    fetchSpy.mockResolvedValueOnce(session());
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("authenticated"));
    // A renewal that never answers, as a hung request does, until its signal aborts.
    fetchSpy.mockImplementationOnce(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        }),
    );
    void mockInject.mock.calls.at(-1)![0].renewSession();
    await waitFor(() => expect(calls()).toHaveLength(2));
    fetchSpy.mockResolvedValueOnce(new Response(null, { status: 204 }));

    let signingOut!: Promise<void>;
    act(() => {
      signingOut = result.current.signOut();
    });
    await act(async () => jest.advanceTimersByTime(RENEWAL_TIMEOUT_MS));
    await act(() => signingOut);
    expect(calls()).toEqual(["/api/auth/refresh", "/api/auth/refresh", "/api/auth/sign-out"]);
    // The timed-out renewal does not leave the tab offline and retrying.
    expect(result.current.status).toBe("unauthenticated");
    await act(async () => jest.advanceTimersByTime(120_000));
    expect(calls()).toHaveLength(3);
  } finally {
    jest.useRealTimers();
  }
});

describe("signing out", () => {
  it("forgets the day the Day tab showed, so the next account's Day link leads to today", async () => {
    fetchSpy.mockResolvedValueOnce(session());
    const hook = renderHook(() => ({ auth: useAuth(), shown: useShownDay() }), { wrapper });
    await waitFor(() => expect(hook.result.current.auth.status).toBe("authenticated"));
    act(() => rememberShownDay("2026-11-15"));
    expect(dayTabHref(hook.result.current.shown)).toBe("/?date=2026-11-15");

    fetchSpy.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await act(() => hook.result.current.auth.signOut());
    expect(hook.result.current.auth.status).toBe("unauthenticated");
    expect(hook.result.current.shown).toBeNull();
    expect(dayTabHref(hook.result.current.shown)).toBe("/");
  });
});
