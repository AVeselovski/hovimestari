import { useCallback, useEffect, useRef, useState } from "react";
import type { State } from "@hovi/shared";
import { getState, putState } from "./api.js";

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

  const sync = useCallback(async () => {
    if (inFlightRef.current) return;
    if (!dirtyRef.current) return;
    const snap = stateRef.current;
    const ua = updatedAtRef.current;
    if (!snap || !ua) return;

    inFlightRef.current = true;
    dirtyRef.current = false;
    setStatus("saving");

    const res = await putState(snap, ua);
    inFlightRef.current = false;

    if (res.ok) {
      updatedAtRef.current = res.updatedAt;
      setUpdatedAt(res.updatedAt);
      if (dirtyRef.current) {
        // A mutation happened while in flight — fire again.
        setStatus("idle");
        void sync();
      } else {
        setStatus("idle");
      }
    } else if (res.conflict) {
      // Drop local in-flight + queued edits; adopt server.
      dirtyRef.current = false;
      stateRef.current = res.state;
      updatedAtRef.current = res.updatedAt;
      setState(res.state);
      setUpdatedAt(res.updatedAt);
      setStatus("conflict");
    } else {
      setStatus("error");
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

  return { state, status, mutate, reload, dismissConflict };
}
