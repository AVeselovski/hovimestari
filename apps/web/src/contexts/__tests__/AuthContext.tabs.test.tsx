import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { TEST_USER } from "../../__tests__/helpers/auth";
import { AuthProvider, useAuth } from "../AuthContext";

// Two tabs of one browser share one cookie jar. The server rotates the
// refresh token on every use and refuses a spent one. This models exactly
// that, and the browser's Web Locks: one holder per name, in request order.

jest.mock("next/navigation", () => ({ useRouter: () => ({ replace: jest.fn() }) }));
jest.mock("@/lib/api/auth", () => ({ endAllSessions: jest.fn() }));

let jar: string;
let generation: number;

function accessToken(): string {
  return `h.${btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 900 }))}.s`;
}

/** The refresh route handler as the server runs it: the cookie is read when the request is sent. */
const fetchSpy = jest.fn(async (url: string): Promise<Response> => {
  expect(url).toBe("/api/auth/refresh");
  const sent = jar;
  await new Promise((r) => setTimeout(r, 5));
  if (sent !== `token-${generation}`) {
    jar = "";
    return new Response(JSON.stringify({ code: "session_expired" }), { status: 401 });
  }
  generation += 1;
  jar = `token-${generation}`;
  return new Response(JSON.stringify({ accessToken: accessToken(), user: TEST_USER }), { status: 200 });
});

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

const tab = ({ children }: { children: ReactNode }): ReactNode => <AuthProvider>{children}</AuthProvider>;

beforeEach(() => {
  jar = "token-0";
  generation = 0;
  fetchSpy.mockClear();
  global.fetch = fetchSpy as unknown as typeof fetch;
});
afterEach(removeLocks);

describe("two tabs restoring the session at once", () => {
  it("both stay signed in, because the second renews with the rotated cookie", async () => {
    installLocks();
    const first = renderHook(() => useAuth(), { wrapper: tab });
    const second = renderHook(() => useAuth(), { wrapper: tab });
    await waitFor(() => expect(first.result.current.status).toBe("authenticated"));
    await waitFor(() => expect(second.result.current.status).toBe("authenticated"));
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(jar).toBe("token-2");
  });

  it("still renews in one tab where the browser has no Web Locks", async () => {
    removeLocks();
    const only = renderHook(() => useAuth(), { wrapper: tab });
    await waitFor(() => expect(only.result.current.status).toBe("authenticated"));
  });
});
