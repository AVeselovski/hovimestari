"use client";

import { FullPageSpinner } from "@/components/FullPageSpinner";
import { useAuth } from "@/contexts/AuthContext";
import { syncDeviceTimeZone } from "@/lib/deviceTimeZone";
import { targetsQuery } from "@/lib/queryOptions";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type ReactElement, type ReactNode } from "react";
import { FirstRunTargets } from "./FirstRunTargets";
import { TodayProvider } from "./TodayProvider";

// ---------------------------------------------------------------------------
// The first-run gate, between the query cache and the shell. It decides on
// one fact: whether the account has any targets change.
//
// - No answer yet, and the read is running: the spinner, and only on the
//   first decision. Once the gate has shown the tabs, a read that starts
//   later (the server came back) never takes them away for a spinner.
// - An answer with no change: the first-run page, in place of the tabs.
// - An answer with a change: the tabs, whatever a later read is doing, so a
//   refetch (at midnight, after a save) never unmounts a sheet with typed
//   input in it.
// - No answer because the device is offline (the read is paused) or the
//   server failed: the tabs, with the shell's offline line. Only a definite
//   "no targets" shows the first-run page, so a person with targets is never
//   asked again because a request failed. A real offline cold start goes
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

export function TargetsGate({ children }: { children: ReactNode }): ReactElement {
  const { status, user } = useAuth();
  const client = useQueryClient();
  const signedIn = status === "authenticated";
  const { data, fetchStatus } = useQuery({ ...targetsQuery(), enabled: signedIn });
  // Set during render (React's "storing information from previous renders"),
  // so the render that first shows something other than the spinner already
  // counts.
  const [decided, setDecided] = useState(false);

  useEffect(() => {
    if (signedIn && user) void syncDeviceTimeZone(client, user);
  }, [signedIn, user, client]);

  const waiting = data === undefined && fetchStatus === "fetching" && !decided;
  if (!waiting && !decided) setDecided(true);

  if (waiting) return <FullPageSpinner />;
  if (data && data.changes.length === 0) return <FirstRunTargets today={data.today} />;
  return <TodayProvider>{children}</TodayProvider>;
}
