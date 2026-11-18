"use client";

import { FullPageSpinner } from "@/components/FullPageSpinner";
import { useAuth } from "@/contexts/AuthContext";
import { syncDeviceTimeZone } from "@/lib/deviceTimeZone";
import { queryKeys } from "@/lib/queryKeys";
import { targetsQuery } from "@/lib/queryOptions";
import type { TargetsOverview } from "@hovimestari/types";
import { onlineManager, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { FirstRunTargets } from "./FirstRunTargets";
import { TodayProvider } from "./TodayProvider";

// ---------------------------------------------------------------------------
// The first-run gate, between the query cache and the shell. It shows the
// first-run page in place of the tabs in two cases.
//
// By itself, while the targets read answers `firstRunDue`: a new account
// that has neither saved a change nor gone on without targets. The page
// leaves when the read answers again, by a save or by "Continue without
// targets", and never by going Back, which would leave the app.
//
// On request, for a user with no targets: `useFirstRun().open()` (the Day
// tab's Set targets) pushes one history entry on the same address, marked
// `firstRun` in its state, next to the router's own. Whether the page is
// open is that mark, read as the gate mounts and on every popstate, so a
// reload while it is open shows it again, Back closes it and Forward opens
// it again. Every way out of it goes Back, to the day it was opened on.
//
// `open()` opens the page at the press, from the cache's word: the Day tab
// offers Set targets only while the cache holds no change. Behind it, while
// the device is online, one read asks the server again, since another device
// or an assistant may have saved targets. When that read answers a change
// and the page is still the one it opened, the page goes Back as Continue
// does, and the day shows its targets: the days held are dropped first,
// since they answered the old ones. Offline, nothing is sent, so nothing
// can open or close the page later. An entry marked open for a user with a
// change is ignored, unless the page is already on screen (its own save, or
// that read, is on its way out), and loses its mark, so a later read that
// finds no change (removed on another device) never opens the page by
// itself there.
//
// Arriving on the tabs from the first-run page, by leaving the page opened
// again or by passing the self-shown one, arms a one-shot return for that
// address (`takeReturned`): the Day tab's next mount on it puts focus on the
// date button. Any other address, or any later history move, drops it.
//
// Every other rule:
//
// - No answer yet, and the read is running: the spinner, and only on the
//   first decision. Once the gate has shown the tabs, a read that starts
//   later (the server came back) never takes them away for a spinner.
// - An answer with no first run due: the tabs, whatever a later read is
//   doing, so a refetch (at midnight, after a save, after removing the only
//   change) never unmounts a sheet with typed input in it.
// - No answer because the device is offline (the read is paused) or the
//   server failed: the tabs, with the shell's offline line. Only a definite
//   answer shows the first-run page by itself. A real offline cold start goes
//   through the session's `offline` status, not a paused read: the read is
//   disabled until the session is signed in, then starts with no data, and
//   `decided` keeps the shell (and any open sheet) through it.
//
// No route and no redirect: the address stays what it was, so a deep link
// survives the gate. The key holds no date (lib/queryKeys.ts).
//
// The gate also stores this device's time zone on the account once per app
// start, when the two differ (lib/deviceTimeZone.ts), and renders the app's
// one TodayProvider around the shell, so every tab reads the same today.
// ---------------------------------------------------------------------------

/** What the shell can ask of the first-run page. */
export interface FirstRun {
  /** Opens the first-run page again, for a user with no targets. Nothing while it is open or the user has a change. */
  open: () => Promise<void>;
  /** True once on the address the tabs arrived at from the first-run page, for the Day tab's next mount to put focus there. */
  takeReturned: () => boolean;
}

const FirstRunContext = createContext<FirstRun>({ open: async () => {}, takeReturned: () => false });

/** The first-run page, as the shell may ask for it. Outside the gate: nothing opens. */
export function useFirstRun(): FirstRun {
  return useContext(FirstRunContext);
}

/** Whether the current history entry is the first-run page opened again. */
function entryAsks(): boolean {
  return (window.history.state as { firstRun?: unknown } | null)?.firstRun === true;
}

export function TargetsGate({ children }: { children: ReactNode }): ReactElement {
  const { status, user } = useAuth();
  const client = useQueryClient();
  const signedIn = status === "authenticated";
  const { data, fetchStatus } = useQuery({ ...targetsQuery(), enabled: signedIn });
  // Set during render (React's "storing information from previous renders"),
  // so the render that first shows something other than the spinner already
  // counts.
  const [decided, setDecided] = useState(false);
  /** The current history entry is the page opened again. */
  const [asked, setAsked] = useState(false);
  /** The page opened again is on screen: kept through its own save, until the entry closes it. */
  const [reopened, setReopened] = useState(false);
  const reopenedRef = useRef(false);
  const opening = useRef(false);
  /** The address the tabs arrived at from the first-run page, until the Day tab takes it. */
  const returned = useRef<string | null>(null);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (signedIn && user) void syncDeviceTimeZone(client, user);
  }, [signedIn, user, client]);

  // The one way the gate goes Back from the page opened again: Continue, a
  // save, and the read behind the press all call it. Back is asynchronous,
  // so until its popstate the entry still reads as marked: the latch keeps a
  // second caller from going Back again, past the day, and a Back the person
  // took first leaves nothing marked to go Back from.
  const leaving = useRef(false);
  const leave = useCallback((): void => {
    if (leaving.current || !entryAsks()) return;
    leaving.current = true;
    window.history.back();
  }, []);

  useEffect(() => {
    const read = () => {
      leaving.current = false;
      const now = entryAsks();
      // Armed only by leaving the page opened again, for the day it goes back to.
      returned.current = !now && reopenedRef.current ? window.location.href : null;
      setAsked(now);
    };
    read();
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, []);

  // Passing the self-shown page (Continue or Save) arrives on the tabs too.
  const due = data?.firstRunDue === true;
  const wasDue = useRef(false);
  // A layout effect, so it runs before the Day tab's own effects take the return.
  useLayoutEffect(() => {
    if (wasDue.current && !due) returned.current = window.location.href;
    wasDue.current = due;
  }, [due]);

  const showReopened = asked && data !== undefined && (reopened || data.changes.length === 0);
  if (showReopened !== reopened) setReopened(showReopened);
  useEffect(() => {
    reopenedRef.current = reopened;
  }, [reopened]);

  // An entry marked open for a user who has a change: the mark goes, and
  // Next's own fields in the entry's state stay.
  const staleMark = asked && data !== undefined && !showReopened;
  useEffect(() => {
    if (!staleMark || !entryAsks()) return;
    const state = { ...(window.history.state as Record<string, unknown>) };
    delete state.firstRun;
    window.history.replaceState(state, "", window.location.href);
    setAsked(false);
  }, [staleMark]);

  const open = useCallback(async (): Promise<void> => {
    if (reopenedRef.current || opening.current || entryAsks()) return;
    const cached = client.getQueryData<TargetsOverview>(targetsQuery().queryKey);
    if (cached && cached.changes.length > 0) return;
    window.history.pushState({ ...(window.history.state as object | null), firstRun: true }, "", window.location.href);
    const href = window.location.href;
    // On screen from this render on, whatever the read below answers.
    reopenedRef.current = true;
    setReopened(true);
    setAsked(true);
    // Offline, the read would wait for the connection and close the page
    // long after: the cache's word stands.
    if (!onlineManager.isOnline()) return;
    opening.current = true;
    try {
      const fresh = await client.fetchQuery({ ...targetsQuery(), staleTime: 0, retry: false }).catch(() => null);
      // Still the page this press opened: nobody has left it, saved on it or moved on.
      const still = mounted.current && entryAsks() && window.location.href === href;
      if (fresh && fresh.changes.length > 0 && still) {
        // The days held answered the old targets. Dropped, so the day opens
        // on its frame laid out from the new ones, then reads its answer.
        await client.resetQueries({ queryKey: queryKeys.days(), type: "inactive" });
        leave();
      }
    } finally {
      opening.current = false;
    }
  }, [client, leave]);

  const takeReturned = useCallback((): boolean => {
    const was = returned.current;
    returned.current = null;
    return was !== null && was === window.location.href;
  }, []);

  const firstRun = useMemo(() => ({ open, takeReturned }), [open, takeReturned]);

  const waiting = data === undefined && fetchStatus === "fetching" && !decided;
  if (!waiting && !decided) setDecided(true);

  if (waiting) return <FullPageSpinner />;
  if (data?.firstRunDue) return <FirstRunTargets today={data.today} />;
  if (showReopened && data) return <FirstRunTargets today={data.today} onLeave={leave} />;
  return (
    <FirstRunContext.Provider value={firstRun}>
      <TodayProvider>{children}</TodayProvider>
    </FirstRunContext.Provider>
  );
}
