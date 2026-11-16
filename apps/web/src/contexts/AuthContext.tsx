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
//
// Sign-out takes the same lock, so it never overlaps a renewal in any tab: a
// renewal in flight sets its cookie first, and the sign-out then ends that
// latest session and deletes the cookie last. Each sign-out also starts a new
// generation. A renewal answer from an older generation is discarded, so a
// late answer can never sign the tab back in.
//
// Sign-in and sign-up take the lock and start a new generation too. A
// password change ends every session and then signs this device straight
// back in, and a renewal sent with the old cookie may still be out. Its 401
// is discarded rather than signing the tab out, and the relay's cookie
// delete that comes with it lands before the sign-in's new cookie, never
// after. A renewal in this tab asked for while a sign-in is out waits for it
// and then sends the new cookie, and so does one in any other tab, queued
// behind the lock.
//
// A renewal answered `session_expired` asks for the lock once more and
// renews again before the tab signs out. Another tab may have changed the
// password and signed back in, queued behind it, and this tab then renews
// with that new cookie. On a real end there is no cookie left, and the
// route answers the second request itself.
// ---------------------------------------------------------------------------

export type AuthStatus = "loading" | "authenticated" | "unauthenticated" | "offline" | "error";

export interface SignOutOptions {
  everywhere?: boolean;
  /** The sign-in page, with a note when one applies, such as `?deleted=1`. */
  to?: SignOutPath;
}

/** Where a sign-out may land. */
export type SignOutPath = "/auth/sign-in" | "/auth/sign-in?reset=1" | "/auth/sign-in?deleted=1";

export interface AuthContextValue {
  user: Me | null;
  status: AuthStatus;
  /** True after this tab signed out, so the guard sends the person to `afterSignOut`, not back here. */
  signedOut: boolean;
  /** Where the last sign-out on this tab sent the person: plain sign-in, or sign-in with a note. */
  afterSignOut: SignOutPath;
  /** Tries the session again after an `error` or while `offline`. */
  retry: () => void;
  signIn: (body: LoginBody) => Promise<void>;
  signUp: (body: RegisterBody) => Promise<void>;
  /**
   * Signs this device out and goes to `to` (default `/auth/sign-in`). With
   * `everywhere`, every other device first, at its next renewal: when that
   * call fails it throws and this device stays signed in.
   */
  signOut: (options?: SignOutOptions) => Promise<void>;
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

function webLocks(): LockManager | undefined {
  return typeof navigator === "undefined" ? undefined : navigator.locks;
}

/** Runs `fn` under the cross-tab renewal lock, or directly where the browser has no Web Locks. */
function underRenewalLock<T>(fn: () => Promise<T>): Promise<T> {
  const locks = webLocks();
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

type LockedPath = "/api/auth/refresh" | "/api/auth/sign-out" | "/api/auth/sign-in" | "/api/auth/sign-up";

/**
 * Posts to a session handler, aborting after `RENEWAL_TIMEOUT_MS`, because
 * every caller holds the renewal lock. The abort rejects as a failed fetch
 * does, with a `TypeError`, so every caller reads it as the server being out
 * of reach. The timer is cleared once the request settles.
 */
async function postUnderLock(path: LockedPath, body?: LoginBody | RegisterBody): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new DOMException("The session request timed out.", "TimeoutError")),
    RENEWAL_TIMEOUT_MS,
  );
  try {
    return await postSessionHandler(path, body, controller.signal);
  } catch (err) {
    if (controller.signal.aborted) throw new TypeError("The session request timed out.");
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** `superseded`: a sign-out began after this renewal did, so its answer was discarded. */
type RenewalOutcome = "renewed" | "ended" | "unreachable" | "failed" | "superseded";

export function AuthProvider({ children }: { children: ReactNode }): React.ReactElement {
  const router = useRouter();
  const [user, setUser] = useState<Me | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [signedOut, setSignedOut] = useState(false);
  const [afterSignOut, setAfterSignOut] = useState<SignOutPath>("/auth/sign-in");

  const accessTokenRef = useRef<string | null>(null);
  const renewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCountRef = useRef(0);
  const renewRef = useRef<() => Promise<RenewalOutcome>>(async () => "unreachable");
  // Advanced by every sign-out, sign-in and sign-up. A renewal applies its
  // answer only while the generation it started in is still current.
  const generationRef = useRef(0);
  const signingOutRef = useRef(false);
  // A sign-in or sign-up under way. A renewal asked for meanwhile waits for it.
  const establishingRef = useRef<Promise<BrowserSession> | null>(null);

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
      markSession(true, session.user.email);
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
    // After a sign-in under way, so this renewal sends the cookie it sets.
    // Awaited only when there is one: otherwise the lock is requested at once.
    const establishing = establishingRef.current;
    if (establishing) await establishing.catch(() => undefined);
    const generation = generationRef.current;
    const current = (): boolean => generation === generationRef.current && !signingOutRef.current;
    if (!current()) return "superseded";
    const attempt = async (): Promise<RenewalOutcome | BrowserSession> => {
      // Queued behind a sign-out: its cookie is gone, so there is nothing to renew.
      if (!current()) return "superseded";
      let res: Response;
      try {
        res = await postUnderLock("/api/auth/refresh");
      } catch {
        return "unreachable";
      }
      if (res.ok) return (await sessionOf(res)) ?? "failed";
      if (res.status === 401) return "ended";
      return (await saysUnreachable(res)) ? "unreachable" : "failed";
    };
    let outcome = await underRenewalLock(attempt);
    // Once more, under a fresh hold of the lock, before this tab signs out. A
    // sign-in in another tab (after a password change there) may have been
    // queued behind this renewal, and the cookie it set is then the browser's
    // session. On a real end the first 401 deleted the cookie, so the route
    // answers this one itself without asking the backend. Once only: a second
    // `ended` signs out.
    if (outcome === "ended" && current()) outcome = await underRenewalLock(attempt);
    // A sign-out began while this renewal was out: its answer, whatever it
    // is, belongs to a session that has ended.
    if (!current() || outcome === "superseded") return "superseded";
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
    async (path: "/api/auth/sign-in" | "/api/auth/sign-up", body: LoginBody | RegisterBody) => {
      // A renewal already out belongs to the cookie this replaces: its answer is discarded.
      generationRef.current += 1;
      const before = inFlightRef.current;
      const run = underRenewalLock(async () => {
        // Without Web Locks, this tab's own renewal is the whole wait. With
        // them it is never awaited: a renewal that has asked for the lock is
        // already ahead in its queue, and one that has not (it waits for an
        // earlier sign-in) would queue behind this one, so awaiting it here
        // would hold the lock forever.
        if (!webLocks()) await before?.catch(() => undefined);
        const res = await postUnderLock(path, body);
        if (!res.ok) throw await AuthRequestError.from(res);
        const session = await sessionOf(res);
        if (!session) throw new AuthRequestError(res.status, undefined);
        return session;
      });
      establishingRef.current = run;
      try {
        applySession(await run);
      } catch (err) {
        // The renewal that was out had its answer discarded for this sign-in.
        // The sign-in failed, so the session is what it was: renew it again,
        // or an offline tab would stop its retries until the browser is online.
        if (before) void renewRef.current();
        throw err;
      } finally {
        if (establishingRef.current === run) establishingRef.current = null;
      }
    },
    [applySession],
  );

  const signIn = useCallback((body: LoginBody) => establish("/api/auth/sign-in", body), [establish]);
  const signUp = useCallback((body: RegisterBody) => establish("/api/auth/sign-up", body), [establish]);

  const signOut = useCallback(
    async ({ everywhere = false, to = "/auth/sign-in" }: SignOutOptions = {}) => {
      // Before the new generation: this call may need a renewal on a 401.
      if (everywhere) await endAllSessions();
      generationRef.current += 1;
      signingOutRef.current = true;
      clearTimers();
      try {
        // Under the lock, a renewal in flight in any tab has finished and set
        // its cookie. Without Web Locks, this tab's own renewal is awaited.
        await underRenewalLock(async () => {
          await inFlightRef.current?.catch(() => undefined);
          try {
            await postUnderLock("/api/auth/sign-out");
          } catch {
            // The handler always deletes the cookie. Out of reach, the local session still ends.
          }
        });
      } finally {
        signingOutRef.current = false;
      }
      setSignedOut(true);
      setAfterSignOut(to);
      endLocalSession();
      router.replace(to);
    },
    [clearTimers, endLocalSession, router],
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
    () => ({ user, status, signedOut, afterSignOut, retry, signIn, signUp, signOut }),
    [user, status, signedOut, afterSignOut, retry, signIn, signUp, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
