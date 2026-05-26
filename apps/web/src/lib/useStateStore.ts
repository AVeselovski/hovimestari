import { useCallback, useEffect, useRef, useState } from "react";
import type { State } from "@hovi/shared";
import { API_BASE, getState, putState } from "./api.js";

export type StoreStatus =
  | "loading"
  | "idle"
  | "saving"
  | "error"
  | "conflict";

export type StateStore = {
  state: State | null;
  status: StoreStatus;
  mutate: (updater: (s: State) => State) => void;
  reload: () => Promise<void>;
  dismissConflict: () => void;
};

const DEBOUNCE_MS = 500;

export function useStateStore(): StateStore {
  const [state, setState] = useState<State | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [status, setStatus] = useState<StoreStatus>("loading");

  // Latest known state + updatedAt for the writer loop. Refs because the
  // debounced send fires outside React's render cycle.
  const stateRef = useRef<State | null>(null);
  const updatedAtRef = useRef<string | null>(null);
  const dirtyRef = useRef(false);
  const inFlightRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // No auto-retry on error: the next user mutation triggers schedule() → sync().
  // Backoff/automatic retries are intentionally deferred (see review #1).
  const sync = useCallback(async () => {
    if (inFlightRef.current) return;
    if (!dirtyRef.current) return;
    const snap = stateRef.current;
    const ua = updatedAtRef.current;
    if (!snap || !ua) return;

    inFlightRef.current = true;
    dirtyRef.current = false;
    setStatus("saving");

    try {
      const res = await putState(snap, ua);

      if (res.ok) {
        updatedAtRef.current = res.updatedAt;
        setUpdatedAt(res.updatedAt);
        if (dirtyRef.current) {
          // A mutation happened while in flight — fire again.
          setStatus("saving");
          inFlightRef.current = false;
          void sync();
          return;
        }
        setStatus("idle");
      } else if (res.conflict) {
        // Drop local in-flight + queued edits; adopt server.
        dirtyRef.current = false;
        stateRef.current = res.state;
        updatedAtRef.current = res.updatedAt;
        setState(res.state);
        setUpdatedAt(res.updatedAt);
        setStatus("conflict");
      } else {
        // Re-mark dirty so the next schedule() or mutate() will retry.
        dirtyRef.current = true;
        setStatus("error");
      }
    } catch {
      // Network/exception: keep the unsaved snapshot dirty so a future
      // mutate() retries it. Banner surfaces the error.
      dirtyRef.current = true;
      setStatus("error");
    } finally {
      inFlightRef.current = false;
    }
  }, []);

  const schedule = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void sync();
    }, DEBOUNCE_MS);
  }, [sync]);

  const mutate = useCallback(
    (updater: (s: State) => State) => {
      setState((prev) => {
        if (!prev) return prev;
        const next = updater(prev);
        stateRef.current = next;
        return next;
      });
      dirtyRef.current = true;
      schedule();
    },
    [schedule],
  );

  const reload = useCallback(async () => {
    setStatus("loading");
    try {
      const res = await getState();
      stateRef.current = res.state;
      updatedAtRef.current = res.updatedAt;
      setState(res.state);
      setUpdatedAt(res.updatedAt);
      setStatus("idle");
    } catch {
      setStatus("error");
    }
  }, []);

  const dismissConflict = useCallback(() => {
    setStatus((s) => (s === "conflict" ? "idle" : s));
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Keep `updatedAt` in the ref synced with state (covers reload paths).
  useEffect(() => {
    updatedAtRef.current = updatedAt;
  }, [updatedAt]);

  // On tab hide / page unload, best-effort flush via sendBeacon. We skip
  // when a PUT is in flight (it delivers the same payload).
  useEffect(() => {
    const flushSync = (): void => {
      if (!dirtyRef.current) return;
      if (inFlightRef.current) return;
      const snap = stateRef.current;
      const ua = updatedAtRef.current;
      if (!snap || !ua) return;
      if (typeof navigator === "undefined" || !navigator.sendBeacon) return;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      const blob = new Blob(
        [JSON.stringify({ state: snap, updatedAt: ua })],
        { type: "application/json" },
      );
      const queued = navigator.sendBeacon(`${API_BASE}/state`, blob);
      if (queued) {
        // We can't observe the server's new updatedAt; next reload() wins.
        dirtyRef.current = false;
      }
    };

    const onVisibility = (): void => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        flushSync();
      }
    };
    const onPageHide = (): void => flushSync();

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibility);
    }
    if (typeof window !== "undefined") {
      window.addEventListener("pagehide", onPageHide);
    }
    return () => {
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibility);
      }
      if (typeof window !== "undefined") {
        window.removeEventListener("pagehide", onPageHide);
      }
    };
  }, []);

  return { state, status, mutate, reload, dismissConflict };
}
