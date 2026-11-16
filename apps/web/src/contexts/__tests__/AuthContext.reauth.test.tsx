import type { AuthHandlers } from "@/lib/api";
import { SESSION_MARKER_KEY } from "@/lib/sessionMarker";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { TEST_USER, testPassword } from "../../__tests__/helpers/auth";
import { AuthProvider, useAuth, type AuthContextValue, type AuthStatus } from "../AuthContext";

// Changing the password ends every session on the server, and the sheet then
// signs this device straight back in. A renewal sent with the old cookie may
// still be out at that moment, in this tab or another one. Its 401 must not
// sign this tab out, and the relay's cookie delete that comes with it must
// not land after the sign-in's new cookie.
//
// The server here works as the real one does: one cookie jar for the browser,
// read when a request is sent and written when its answer arrives, a refresh
// token that rotates on use, and a 401 to a dead one that deletes the cookie.
// A refresh with no cookie is answered 401, as the route answers it itself.
//
// One simplification: the real backend keeps a spent refresh token usable
// until one of its successors is used, so a renewal whose answer was lost can
// try again. This fake kills a token on first use. No case here depends on
// the grace: each token is sent once, or after the password change has ended
// every session, when the real backend refuses it too.

jest.mock("next/navigation", () => ({ useRouter: () => ({ replace: jest.fn() }) }));
jest.mock("@/lib/api/auth", () => ({ endAllSessions: jest.fn() }));
const mockInject = jest.fn<void, [AuthHandlers]>();
jest.mock("@/lib/api", () => ({ injectAuthHandlers: (h: AuthHandlers) => mockInject(h) }));

let jar: string;
let issued: number;
const live = new Set<string>();
/** Answers the test is holding, in the order their requests were sent. */
let holds: Array<() => void>;
let holdNext: boolean;
const sent: Array<{ url: string; cookie: string }> = [];
/** One-off answers by path, in place of the server's own, given when the request is released. */
const overrides = new Map<string, () => Response>();

function accessToken(): string {
  return `h.${btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 900 }))}.s`;
}

function newToken(): string {
  issued += 1;
  const token = `token-${issued}`;
  live.add(token);
  return token;
}

/** The server's side of a password change: every session ends. */
function endEverySession(): void {
  live.clear();
}

const fetchSpy = jest.fn(async (url: string): Promise<Response> => {
  const cookie = jar;
  sent.push({ url, cookie });
  if (holdNext) {
    holdNext = false;
    await new Promise<void>((release) => holds.push(release));
  } else {
    await new Promise((r) => setTimeout(r, 1));
  }
  const override = overrides.get(url);
  if (override) {
    overrides.delete(url);
    return override();
  }
  if (url === "/api/auth/sign-out") {
    if (cookie) live.delete(cookie);
    jar = "";
    return new Response(null, { status: 204 });
  }
  if (url === "/api/auth/sign-in") {
    jar = newToken();
    return new Response(JSON.stringify({ accessToken: accessToken(), user: TEST_USER }), { status: 200 });
  }
  expect(url).toBe("/api/auth/refresh");
  if (!live.has(cookie)) {
    // The relay's answer to session_expired deletes the cookie.
    jar = "";
    return new Response(JSON.stringify({ code: "session_expired" }), { status: 401 });
  }
  live.delete(cookie);
  jar = newToken();
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

const wrapper = ({ children }: { children: ReactNode }): ReactNode => <AuthProvider>{children}</AuthProvider>;

interface Tab {
  auth: () => AuthContextValue;
  /** Every status the tab rendered, in order. */
  seen: AuthStatus[];
  /** The API client's 401 path: a renewal. */
  renew: () => Promise<boolean>;
}

/** Opens a tab and waits until its launch renewal has signed it in. */
async function openTab(): Promise<Tab> {
  const seen: AuthStatus[] = [];
  const before = mockInject.mock.calls.length;
  const { result } = renderHook(
    () => {
      const auth = useAuth();
      seen.push(auth.status);
      return auth;
    },
    { wrapper },
  );
  await waitFor(() => expect(result.current.status).toBe("authenticated"));
  const handlers = mockInject.mock.calls[before][0];
  return { auth: () => result.current, seen, renew: () => handlers.renewSession() };
}

/** Starts a renewal whose answer the test releases, once its request has gone out with the cookie of the time. */
async function renewalHeldOpen(tab: Tab): Promise<{ release: () => Promise<void>; renewed: Promise<boolean> }> {
  holdNext = true;
  const count = sent.length;
  let renewed!: Promise<boolean>;
  act(() => {
    renewed = tab.renew();
  });
  await waitFor(() => expect(sent).toHaveLength(count + 1));
  const release = holds.at(-1)!;
  return { release: async () => act(async () => release()), renewed };
}

const pause = (ms = 20): Promise<void> => act(async () => new Promise((r) => setTimeout(r, ms)));

/**
 * Every state the tab rendered since it was last loading. A tab that drops
 * to `unauthenticated` and comes back has already sent the person to the
 * sign-in page, so the last state alone says nothing.
 */
const settled = (tab: Tab): AuthStatus[] => tab.seen.slice(tab.seen.lastIndexOf("loading") + 1);

/**
 * Whether any tab ended its session locally: it clears the session marker at
 * once. A drop and a recovery inside one act() flush render as one state, so
 * `settled` alone can miss a drop that a browser would paint.
 */
let markerCleared: number;

/** The tab never left its session, across every state: none rendered, none written. */
function expectStayedSignedIn(tab: Tab): void {
  expect(settled(tab)).not.toContain("unauthenticated");
  expect(markerCleared).toBe(0);
  expect(tab.auth().status).toBe("authenticated");
}

const refreshes = (): number => sent.filter((r) => r.url === "/api/auth/refresh").length;

const signInAs = (tab: Tab): Promise<void> => tab.auth().signIn({ email: TEST_USER.email, password: testPassword() });

/** Starts a call inside act and hands back its promise, unawaited. */
function start<T>(call: () => Promise<T>): Promise<T> {
  let promise!: Promise<T>;
  act(() => {
    promise = call();
  });
  return promise;
}

beforeEach(() => {
  issued = 0;
  live.clear();
  jar = newToken();
  holds = [];
  holdNext = false;
  sent.length = 0;
  overrides.clear();
  fetchSpy.mockClear();
  mockInject.mockReset();
  localStorage.clear();
  global.fetch = fetchSpy as unknown as typeof fetch;
  markerCleared = 0;
  const removeItem = Storage.prototype.removeItem;
  jest.spyOn(Storage.prototype, "removeItem").mockImplementation(function (this: Storage, key: string) {
    if (key === SESSION_MARKER_KEY) markerCleared += 1;
    removeItem.call(this, key);
  });
});
afterEach(() => {
  removeLocks();
  jest.restoreAllMocks();
});

describe.each([
  ["with Web Locks", installLocks],
  ["without Web Locks", removeLocks],
])("signing back in after the password change, %s", (_case, setUpLocks) => {
  beforeEach(setUpLocks);

  it("a renewal in this tab that answers 401 after the sign-in leaves the tab signed in", async () => {
    const tab = await openTab();
    const old = await renewalHeldOpen(tab);
    endEverySession();

    const signingIn = start(() => signInAs(tab));
    // Every chance for a sign-in that does not wait to finish first.
    await pause();
    await old.release();
    await act(() => signingIn);
    await pause();

    expect(await old.renewed).toBe(false);
    // Across every state since the tab opened, not only the last one.
    expectStayedSignedIn(tab);
    expect(live.has(jar)).toBe(true);

    // The next renewal sends the new cookie and keeps the tab signed in.
    expect(await act(() => tab.renew())).toBe(true);
    expectStayedSignedIn(tab);
  });

  it("a renewal asked for while the sign-in is out waits for it and sends the new cookie", async () => {
    const tab = await openTab();
    endEverySession();

    holdNext = true;
    const signingIn = start(() => signInAs(tab));
    await waitFor(() => expect(sent.at(-1)?.url).toBe("/api/auth/sign-in"));
    const renewed = start(() => tab.renew());
    await pause();
    // Nothing went out with the cookie the password change ended.
    expect(sent.at(-1)?.url).toBe("/api/auth/sign-in");

    await act(async () => holds.at(-1)!());
    await act(() => signingIn);
    expect(await act(() => renewed)).toBe(true);
    const refresh = sent.at(-1)!;
    expect(refresh.url).toBe("/api/auth/refresh");
    expect(refresh.cookie).not.toBe(sent.at(-2)!.cookie);
    expectStayedSignedIn(tab);
    expect(live.has(jar)).toBe(true);
  });

  // A second sign-in while a renewal waits for the first: the renewal must
  // not wait on the lock the second sign-in holds while that one waits on it.
  it("a second sign-in while a renewal waits for the first finishes, and so does the renewal", async () => {
    const tab = await openTab();
    holdNext = true;
    const first = start(() => signInAs(tab));
    await waitFor(() => expect(sent.at(-1)?.url).toBe("/api/auth/sign-in"));
    const renewed = start(() => tab.renew());
    const second = start(() => signInAs(tab));
    await act(async () => holds.at(-1)!());

    const finished = await act(() =>
      Promise.race([
        Promise.all([first, second, renewed]).then(() => "finished"),
        new Promise((r) => setTimeout(() => r("stuck"), 1_000)),
      ]),
    );
    expect(finished).toBe("finished");
    expectStayedSignedIn(tab);
  });

  // Offline: the renewal that was out answers "unreachable", but the sign-in
  // discarded it, so nothing scheduled the next try. The failed sign-in renews.
  it("after a failed sign-in, renews again in place of the renewal it discarded", async () => {
    const tab = await openTab();
    const old = await renewalHeldOpen(tab);
    overrides.set(
      "/api/auth/refresh",
      () => new Response(JSON.stringify({ code: "server_unreachable" }), { status: 503 }),
    );
    overrides.set(
      "/api/auth/sign-in",
      () => new Response(JSON.stringify({ code: "invalid_credentials" }), { status: 401 }),
    );
    const signingIn = start(() => signInAs(tab));
    await pause();
    await old.release();
    await act(() => signingIn.catch(() => undefined));
    expect(await old.renewed).toBe(false);

    // Well before the first backoff step (2 seconds).
    await waitFor(() => expect(refreshes()).toBe(3), { timeout: 500 });
    await pause();
    expectStayedSignedIn(tab);
  });
});

describe("another tab during the password change", () => {
  beforeEach(installLocks);

  it("its renewal with the old cookie never deletes the cookie the sign-in set", async () => {
    const changing = await openTab();
    const other = await openTab();
    // The other tab's renewal goes out with the cookie of the moment, which the change then ends.
    const old = await renewalHeldOpen(other);
    endEverySession();

    const signingIn = start(() => signInAs(changing));
    await pause();
    // Its 401 arrives with the relay's cookie delete.
    await old.release();
    await act(() => signingIn);
    await pause();

    // The cookie in the jar is the sign-in's, so this tab's next renewal works.
    expect(live.has(jar)).toBe(true);
    expect(await act(() => changing.renew())).toBe(true);
    expectStayedSignedIn(changing);
  });

  it("its renewal sent between the change and the sign-in keeps it signed in, renewing again with the new cookie", async () => {
    const changing = await openTab();
    const other = await openTab();
    endEverySession();
    // Sent after the change, before this tab's sign-in asks for the lock.
    const old = await renewalHeldOpen(other);

    const signingIn = start(() => signInAs(changing));
    await pause();
    await old.release();
    await act(() => signingIn);
    expect(await act(() => old.renewed)).toBe(true);
    await pause();

    expectStayedSignedIn(other);
    expectStayedSignedIn(changing);
    expect(live.has(jar)).toBe(true);
  });
});

describe("the one retry after session_expired", () => {
  beforeEach(installLocks);

  it("on a real end, retries once with no cookie and then signs out", async () => {
    const tab = await openTab();
    endEverySession();
    const before = refreshes();
    expect(await act(() => tab.renew())).toBe(false);
    await pause(50);
    expect(refreshes() - before).toBe(2);
    // The retry went out after the first 401 had deleted the cookie.
    expect(sent.at(-1)).toEqual({ url: "/api/auth/refresh", cookie: "" });
    expect(tab.auth().status).toBe("unauthenticated");
  });

  it("does not retry for a tab that signed out while the renewal was out", async () => {
    const tab = await openTab();
    endEverySession();
    const old = await renewalHeldOpen(tab);
    const signingOut = start(() => tab.auth().signOut());
    await pause();
    await old.release();
    await act(() => signingOut);
    await pause(50);
    expect(sent.filter((r) => r.url === "/api/auth/refresh")).toHaveLength(2);
    expect(sent.at(-1)?.url).toBe("/api/auth/sign-out");
  });
});
