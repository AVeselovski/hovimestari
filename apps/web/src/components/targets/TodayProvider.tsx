"use client";

import { useAuth } from "@/contexts/AuthContext";
import { TodayContext, type TodayConfirm, type TodayState } from "@/hooks/useToday";
import { afterDayChange } from "@/lib/invalidation";
import { todayIn } from "@/lib/localDate";
import { queryKeys } from "@/lib/queryKeys";
import { targetsQuery } from "@/lib/queryOptions";
import { DEFAULT_TIME_ZONE, type Me } from "@hovimestari/types";
import { onlineManager, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from "react";

// ---------------------------------------------------------------------------
// TodayProvider: the one place the app's today lives. Rendered once, by
// TargetsGate, around the shell, so the Day tab and Settings read the same
// date (`useToday`).
//
// The rule: the date the app treats as today is the server's. The device's
// clock never decides a date, it only says when to ask the server again.
//
// - Every server answer that carries a `today` (the targets reads, every day
//   read, every write answer, which puts its days in the cache) is seen here
//   through the query cache. A newer today moves the app to it, and every
//   day and targets read is read again once for that date (`afterDayChange`).
//   This is the path that usually fires: a read or a write after the
//   server's midnight carries the new date.
// - Today moves forward only, so an answer that left before midnight and
//   lands after it cannot take the app back a day. The one exception is a
//   change of the account's time zone: today was read in the old zone, and
//   the first targets answer after the change is taken as it is, earlier or
//   not. `afterTimeZoneChange` cancels the reads in flight before it stores
//   the new zone, so that answer comes from after the change. An entry write
//   still out across the change answers in the old zone: `afterEntryWrite`
//   leaves its days out of the cache and reads them again, so its later
//   today never reaches this provider.
// - The device check, on `pageshow`, on becoming visible, on reconnect and on
//   a 60 second tick while visible: when the device's date in the account's
//   zone is past the server's today, it asks the targets read again, at most
//   once every 5 minutes while the device stays ahead. An ask answered with
//   the same date leaves the server's date standing. A device clock that runs
//   ahead therefore costs one read per 5 minutes until the server's midnight.
// - `holding` is true only while an ask is in flight, and an ask always
//   settles: it is sent once, never retried, and the device going offline
//   while it is out ends it as paused. A failed or paused ask holds nothing:
//   it leaves the last today in place, and is asked again on reconnect at
//   once, or after 5 minutes.
// - `unconfirmed` is true only once an ask failed or paused while the device
//   is ahead. While an ask is out, the day on screen stays: writes wait on
//   `holding`, and the answer moves the screen straight to the right day.
//
// The provider renders its children unconditionally, so nothing under it
// unmounts while it asks: an open sheet with typed values survives midnight.
// ---------------------------------------------------------------------------

/** The shortest time between two asks while the device's date stays ahead. */
export const ASK_INTERVAL_MS = 5 * 60_000;
/** How often the device's date is compared while the page is visible. The tick sends nothing by itself. */
export const TICK_MS = 60_000;

type Trigger = "mount" | "show" | "reconnect" | "tick" | "note";

/** The `today` a cached answer carries, when it is a targets or day answer. */
function todayOf(data: unknown): string | null {
  if (typeof data !== "object" || data === null) return null;
  const today = (data as { today?: unknown }).today;
  return typeof today === "string" && /^\d{4}-\d{2}-\d{2}$/.test(today) ? today : null;
}

export function TodayProvider({ children }: { children: ReactNode }): ReactElement {
  const client = useQueryClient();
  const { user } = useAuth();
  const userZone = useRef(user?.timeZone);
  userZone.current = user?.timeZone;

  const zone = useCallback(
    (): string => client.getQueryData<Me>(queryKeys.me())?.timeZone ?? userZone.current ?? DEFAULT_TIME_ZONE,
    [client],
  );

  const [today, setToday] = useState<string | null>(() => todayOf(client.getQueryData(queryKeys.targets())));
  const todayRef = useRef(today);
  /** The account's time zone when today was last read. */
  const zoneOfToday = useRef<string | null>(null);
  const [holding, setHolding] = useState(false);
  const [confirm, setConfirm] = useState<TodayConfirm>("fresh");
  /** The device's date in the account's zone, at the last check. */
  const [deviceDate, setDeviceDate] = useState<string | null>(null);

  /** The ask in flight, by number, so an ask ended as paused ignores its own late settling. */
  const inFlight = useRef<number | null>(null);
  const askCount = useRef(0);
  /** When the last ask that did not move today settled, for the 5 minute bound. Null: ask at the next trigger. */
  const settledAt = useRef<number | null>(null);
  const lastOutcome = useRef<"fresh" | "failed" | "paused">("fresh");

  /**
   * A server answer carried `next`. Today moves forward to it, never back,
   * except from a targets answer after the account's zone changed, which is
   * taken as it is.
   */
  const note = useCallback(
    (next: string, source: "targets" | "days") => {
      const prev = todayRef.current;
      const now = zone();
      zoneOfToday.current ??= now;
      const zoneChanged = prev !== null && zoneOfToday.current !== now;
      if (zoneChanged && source === "targets") {
        zoneOfToday.current = now;
        if (next === prev) return;
        todayRef.current = next;
        setToday(next);
        settledAt.current = null;
        // afterTimeZoneChange already reads every day and targets again.
        return;
      }
      if (prev !== null && next <= prev) return;
      todayRef.current = next;
      setToday(next);
      // The device check's bound starts over for the new date.
      settledAt.current = null;
      if (prev !== null) queueMicrotask(() => void afterDayChange(client));
    },
    [client, zone],
  );

  /** Ends the ask `n` as it settled, unless it was already ended as paused. */
  const endAsk = useCallback((n: number, outcome: "fresh" | "failed" | "paused") => {
    if (inFlight.current !== n) return;
    inFlight.current = null;
    lastOutcome.current = outcome;
    setConfirm(outcome);
    setHolding(false);
  }, []);

  const ask = useCallback(async (): Promise<void> => {
    if (inFlight.current !== null) return;
    if (!onlineManager.isOnline()) {
      lastOutcome.current = "paused";
      setConfirm("paused");
      return;
    }
    askCount.current += 1;
    const n = askCount.current;
    inFlight.current = n;
    setHolding(true);
    setConfirm("checking");
    const before = todayRef.current;
    try {
      // Sent once: a retry would pause while the device is offline and hold writes for as long.
      const answer = await client.fetchQuery({ ...targetsQuery(), staleTime: 0, retry: false });
      note(answer.today, "targets");
      if (inFlight.current === n) settledAt.current = before !== null && answer.today > before ? null : Date.now();
      endAsk(n, "fresh");
    } catch {
      if (inFlight.current === n) settledAt.current = Date.now();
      endAsk(n, "failed");
    }
  }, [client, endAsk, note]);

  // The device going offline while an ask is out ends it as paused, so nothing stays held.
  useEffect(
    () =>
      onlineManager.subscribe((online) => {
        const n = inFlight.current;
        if (online || n === null) return;
        settledAt.current = Date.now();
        endAsk(n, "paused");
      }),
    [endAsk],
  );

  const check = useCallback(
    (trigger: Trigger) => {
      const server = todayRef.current;
      const device = todayIn(zone(), Date.now());
      setDeviceDate(device);
      const ahead = server !== null && device > server;
      if (!ahead || inFlight.current !== null) return;
      const missed = lastOutcome.current !== "fresh";
      const due = settledAt.current === null || Date.now() - settledAt.current >= ASK_INTERVAL_MS;
      if (due || (trigger === "reconnect" && missed)) void ask();
    },
    [ask, zone],
  );

  // Every answer in the cache that carries a today: targets reads, day reads
  // and the days a write answered.
  useEffect(() => {
    const seen = client.getQueryData(queryKeys.targets());
    const first = todayOf(seen);
    if (first) note(first, "targets");
    return client.getQueryCache().subscribe((event) => {
      if (event.type !== "updated" || event.action.type !== "success") return;
      const head = event.query.queryKey[0];
      if (head !== "targets" && head !== "days") return;
      const next = todayOf(event.query.state.data);
      if (next) note(next, head);
    });
  }, [client, note]);

  // The device check's triggers.
  useEffect(() => {
    check("mount");
    const onShow = () => check("show");
    const onVisible = () => {
      if (document.visibilityState === "visible") check("show");
    };
    const onOnline = () => check("reconnect");
    const tick = window.setInterval(() => {
      if (document.visibilityState === "visible") check("tick");
    }, TICK_MS);
    window.addEventListener("pageshow", onShow);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    return () => {
      window.clearInterval(tick);
      window.removeEventListener("pageshow", onShow);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
    };
  }, [check]);

  // A new today from any answer: compare the device again.
  useEffect(() => {
    if (today !== null) check("note");
  }, [today, check]);

  const retry = useCallback(() => void ask(), [ask]);
  // Derived in the same render as today, so a new today never shows a moment of "ahead".
  const deviceAhead = today !== null && deviceDate !== null && deviceDate > today;
  const value = useMemo<TodayState>(
    () => ({
      today,
      holding,
      confirm,
      unconfirmed: deviceAhead && (confirm === "failed" || confirm === "paused"),
      retry,
    }),
    [today, holding, confirm, deviceAhead, retry],
  );
  return <TodayContext.Provider value={value}>{children}</TodayContext.Provider>;
}
