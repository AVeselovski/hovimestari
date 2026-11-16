import { updateSettings } from "@/lib/api/settings";
import { afterTimeZoneChange } from "@/lib/invalidation";
import type { Me } from "@hovimestari/types";
import type { QueryClient } from "@tanstack/react-query";

// ---------------------------------------------------------------------------
// The user's "today" is read on the server in the time zone stored on the
// account. This device writes its own zone there when the two differ, once
// per app start, so "today" follows the device the app last ran on.
//
// Nobody asked for this write, so nobody hears about it: a refusal, such as
// a zone the server's runtime does not know (400 `invalid_time_zone`), or a
// failed request is dropped quietly, and the next app start tries again.
// ---------------------------------------------------------------------------

/** The IANA zone this device runs in, or null where the runtime does not say. */
export function deviceTimeZone(): string | null {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return typeof zone === "string" && zone !== "" ? zone : null;
  } catch {
    return null;
  }
}

/**
 * One app start is one query client: `QueryProvider` makes one per signed-in
 * user and keeps it until sign-out. A re-render, a remount of the caller or a
 * refetch of the account sends nothing again.
 */
const sentFor = new WeakSet<QueryClient>();

/**
 * Stores this device's zone on the account when it differs from `me.timeZone`.
 * At most once per query client. Never throws.
 */
export async function syncDeviceTimeZone(client: QueryClient, me: Pick<Me, "timeZone">): Promise<void> {
  if (sentFor.has(client)) return;
  sentFor.add(client);
  const zone = deviceTimeZone();
  if (zone === null || zone === me.timeZone) return;
  try {
    const next = await updateSettings({ timeZone: zone });
    await afterTimeZoneChange(client, next);
  } catch {
    // Dropped quietly (see the top of this file).
  }
}
