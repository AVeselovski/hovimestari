"use client";

import { injectAuthHandlers } from "@/lib/api";
import { endAllSessions } from "@/lib/api/auth";
import { AuthRequestError } from "@/lib/errors";
import { markSession } from "@/lib/sessionMarker";
import {
  BrowserSessionSchema,
  type BrowserSession,
  type LoginBody,
  type Me,
  type RegisterBody,
} from "@hovimestari/types";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

// ---------------------------------------------------------------------------
// The browser's session. The access token lives in memory only, never in
// storage. The refresh token lives in an httpOnly cookie that only the app's
// own route handlers (app/api/auth/) read, so no JavaScript here ever holds
// it. Every session call goes to those handlers.
//
// Five states: `loading` until the first renewal answers, `authenticated`,
// `unauthenticated` (no session, or the server ended it), `offline`: the
// server could not be reached, so whether the session still holds is unknown,
// and `error`: the server answered, but with a fault of its own, such as a
// misconfigured deployment. Offline, renewal is retried with backoff and on
// the browser's `online` event. On an error it waits for the person to retry,
// because retrying a misconfiguration on a timer only repeats it. Neither
// state ends the session.
//
// This provider owns renewal. One request at a time within the tab, and,
// where the browser has Web Locks, one at a time across tabs: the refresh
// token rotates on use, so a second tab renewing with the cookie the first
// just spent would be refused and signed out. Under the lock the second tab
// sends the rotated cookie instead.
// ---------------------------------------------------------------------------

export type AuthStatus = "loading" | "authenticated" | "unauthenticated" | "offline" | "error";

export interface AuthContextValue {
  user: Me | null;
  status: AuthStatus;
  /** True after this tab signed out, so the guard sends the person to plain sign-in. */
  signedOut: boolean;
  /** Tries the session again after an `error` or while `offline`. */
  retry: () => void;
  signIn: (body: LoginBody) => Promise<void>;
  signUp: (body: RegisterBody) => Promise<void>;
  /** Signs this device out, and with `everywhere` every other device at its next renewal. */
  signOut: (options?: { everywhere?: boolean }) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

/** Waits between renewal attempts while the server is out of reach. The last one repeats. */
export const RETRY_DELAYS_MS = [2_000, 5_000, 15_000, 60_000] as const;

/** Renews this long before the access token expires. */
const RENEW_AHEAD_MS = 60_000;

/** Milliseconds until a JWT's `exp`, or null when it cannot be read. */
function msUntilExpiry(token: string): number | null {
  try {
    const [, payload] = token.split(".");
    const { exp } = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))) as { exp?: unknown };
    return typeof exp === "number" ? exp * 1000 - Date.now() : null;
  } catch {
    return null;
  }
}

/** The Web Lock every tab of this app renews the session under. */
export const RENEWAL_LOCK = "hovi-session-renewal";

/**
 * How long one renewal may take before this tab treats the server as out of
 * reach. A little above the relay's own 10-second backend timeout, so a slow
 * backend answers through the relay first, and a hung request never holds
 * the cross-tab renewal lock for longer than this.
 */
export const RENEWAL_TIMEOUT_MS = 12_000;

/** Runs `fn` under the cross-tab renewal lock, or directly where the browser has no Web Locks. */
function underRenewalLock<T>(fn: () => Promise<T>): Promise<T> {
  const locks = typeof navigator === "undefined" ? undefined : navigator.locks;
  return locks ? (locks.request(RENEWAL_LOCK, fn) as Promise<T>) : fn();
}

/** The session in a handler's 2xx answer, or null when the body is not one. */
async function sessionOf(res: Response): Promise<BrowserSession | null> {
  try {
    const parsed = BrowserSessionSchema.safeParse(await res.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Whether a refused renewal says the server is out of reach, rather than at fault. */
async function saysUnreachable(res: Response): Promise<boolean> {
  if (res.status !== 503) return false;
  try {
    return ((await res.json()) as { code?: unknown }).code === "server_unreachable";
  } catch {
    return false;
  }
}

async function postSessionHandler(path: string, body?: unknown, signal?: AbortSignal): Promise<Response> {
  return fetch(path, {
    method: "POST",
    credentials: "same-origin",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });
}

/**
 * Asks the refresh handler for a new session, aborting after
 * `RENEWAL_TIMEOUT_MS`. The abort rejects like a failed fetch, so the caller
 * reads it as the server being out of reach. The timer is cleared once the
 * request settles.
 */
async function postRefresh(): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new DOMException("The session renewal timed out.", "TimeoutError")),
    RENEWAL_TIMEOUT_MS,
  );
  try {
    return await postSessionHandler("/api/auth/refresh", undefined, controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

type RenewalOutcome = "renewed" | "ended" | "unreachable" | "failed";

export function AuthProvider({ children }: { children: ReactNode }): React.ReactElement {
  const router = useRouter();
  const [user, setUser] = useState<Me | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [signedOut, setSignedOut] = useState(false);

  const accessTokenRef = useRef<string | null>(null);
  const renewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCountRef = useRef(0);
  const renewRef = useRef<() => Promise<RenewalOutcome>>(async () => "unreachable");

  const clearTimers = useCallback(() => {
    for (const ref of [renewTimerRef, retryTimerRef]) {
      if (ref.current !== null) clearTimeout(ref.current);
      ref.current = null;
    }
  }, []);

  const applySession = useCallback(
    (session: BrowserSession) => {
      clearTimers();
      retryCountRef.current = 0;
      accessTokenRef.current = session.accessToken;
      markSession(true);
      setSignedOut(false);
      setUser(session.user);
      setStatus("authenticated");
      const delay = msUntilExpiry(session.accessToken);
      if (delay !== null && delay > RENEW_AHEAD_MS) {
        renewTimerRef.current = setTimeout(() => void renewRef.current(), delay - RENEW_AHEAD_MS);
      }
    },
    [clearTimers],
  );

  const endLocalSession = useCallback(() => {
    clearTimers();
    accessTokenRef.current = null;
    markSession(false);
    setUser(null);
    setStatus("unauthenticated");
  }, [clearTimers]);

  const scheduleRetry = useCallback(() => {
    if (retryTimerRef.current !== null) return;
    const at = Math.min(retryCountRef.current, RETRY_DELAYS_MS.length - 1);
    retryCountRef.current += 1;
    retryTimerRef.current = setTimeout(() => {
      retryTimerRef.current = null;
      void renewRef.current();
    }, RETRY_DELAYS_MS[at]);
  }, []);

  // One renewal at a time in this tab: the launch, the timer and the API
  // client's 401 path all share it.
  const inFlightRef = useRef<Promise<RenewalOutcome> | null>(null);

  const renewOnce = useCallback(async (): Promise<RenewalOutcome> => {
    const outcome = await underRenewalLock(async (): Promise<RenewalOutcome | BrowserSession> => {
      let res: Response;
      try {
        res = await postRefresh();
      } catch {
        return "unreachable";
      }
      if (res.ok) return (await sessionOf(res)) ?? "failed";
      if (res.status === 401) return "ended";
      return (await saysUnreachable(res)) ? "unreachable" : "failed";
    });
    if (typeof outcome === "object") {
      applySession(outcome);
      return "renewed";
    }
    if (outcome === "ended") endLocalSession();
    else if (outcome === "unreachable") {
      setStatus("offline");
      scheduleRetry();
    } else {
      clearTimers();
      setStatus("error");
    }
    return outcome;
  }, [applySession, clearTimers, endLocalSession, scheduleRetry]);

  const renew = useCallback((): Promise<RenewalOutcome> => {
    inFlightRef.current ??= renewOnce().finally(() => {
      inFlightRef.current = null;
    });
    return inFlightRef.current;
  }, [renewOnce]);

  const retry = useCallback(() => {
    if (retryTimerRef.current !== null) clearTimeout(retryTimerRef.current);
    retryTimerRef.current = null;
    void renewRef.current();
  }, []);

  useEffect(() => {
    renewRef.current = renew;
  }, [renew]);

  const establish = useCallback(
    async (path: string, body: LoginBody | RegisterBody) => {
      const res = await postSessionHandler(path, body);
      if (!res.ok) throw await AuthRequestError.from(res);
      const session = await sessionOf(res);
      if (!session) throw new AuthRequestError(res.status, undefined);
      applySession(session);
    },
    [applySession],
  );

  const signIn = useCallback((body: LoginBody) => establish("/api/auth/sign-in", body), [establish]);
  const signUp = useCallback((body: RegisterBody) => establish("/api/auth/sign-up", body), [establish]);

  const signOut = useCallback(
    async ({ everywhere = false }: { everywhere?: boolean } = {}) => {
      if (everywhere) await endAllSessions();
      try {
        await postSessionHandler("/api/auth/sign-out");
      } catch {
        // The handler always deletes the cookie. Out of reach, the local session still ends.
      }
      setSignedOut(true);
      endLocalSession();
      router.replace("/auth/sign-in");
    },
    [endLocalSession, router],
  );

  useEffect(() => {
    injectAuthHandlers({
      getAccessToken: () => accessTokenRef.current,
      renewSession: async () => (await renewRef.current()) === "renewed",
    });
  }, []);

  // Restores the session once, on launch.
  useEffect(() => {
    void renewRef.current();
    return clearTimers;
  }, [clearTimers]);

  // Back online: retry at once rather than wait out the backoff.
  useEffect(() => {
    if (status !== "offline") return;
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, [status, retry]);

  const value = useMemo<AuthContextValue>(
    () => ({ user, status, signedOut, retry, signIn, signUp, signOut }),
    [user, status, signedOut, retry, signIn, signUp, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
