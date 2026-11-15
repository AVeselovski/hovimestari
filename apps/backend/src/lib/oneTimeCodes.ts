import { createHash, randomBytes } from "node:crypto";

// ---------------------------------------------------------------------------
// Navigation tickets. A full-page navigation, such as the start of a Google
// consent, cannot carry an Authorization header. So the page first asks an
// authenticated POST for a ticket, then navigates with it in the query. A
// ticket is opaque, lives a minute, is spent by its first redemption, and is
// bound to the user, the flow and, for the Drive connection, the vault.
//
// The store is in this process's memory, like the membership cache. With more
// than one machine serving the API, a ticket minted on one cannot be redeemed
// on another, so it would need a shared store.
// ---------------------------------------------------------------------------

/** The navigations a ticket can start. */
export type NavigationPurpose = "google-link" | "drive-connect";

/** How long a ticket lives. It is asked for at the press, so a minute is plenty. */
export const NAVIGATION_TICKET_TTL_MS = 60_000;

interface Entry {
  userId: string;
  purpose: NavigationPurpose;
  vaultId: string | null;
  expiresAt: number;
}

/** The most tickets held at once. Past it the oldest goes, so a flood of requests cannot grow the store without end. */
export const MAX_NAVIGATION_TICKETS = 10_000;

/** The most live tickets one user holds. Past it that user's oldest goes, so one account cannot push out everyone else's. */
export const MAX_NAVIGATION_TICKETS_PER_USER = 20;

/**
 * Keyed by the ticket's hash, so the store never holds a ticket that would
 * redeem. Every ticket lives as long, so insertion order is expiry order.
 */
const tickets = new Map<string, Entry>();

/** Each user's ticket keys, oldest first. */
const keysByUser = new Map<string, string[]>();

function forget(key: string): void {
  const entry = tickets.get(key);
  if (!entry) return;
  tickets.delete(key);
  const keys = keysByUser.get(entry.userId) ?? [];
  keys.splice(keys.indexOf(key), 1);
  if (keys.length === 0) keysByUser.delete(entry.userId);
}

const keyOf = (ticket: string) => createHash("sha256").update(ticket).digest("hex");

/** A new ticket for `userId` to start `purpose`, on `vaultId` when the flow is a vault's. */
export function issueNavigationTicket(userId: string, purpose: NavigationPurpose, vaultId?: string): string {
  const now = Date.now();
  // The oldest first: stop at the first one still alive.
  for (const [key, entry] of tickets) {
    if (entry.expiresAt >= now && tickets.size < MAX_NAVIGATION_TICKETS) break;
    forget(key);
  }
  const own = keysByUser.get(userId) ?? [];
  while (own.length >= MAX_NAVIGATION_TICKETS_PER_USER) forget(own[0]);
  const ticket = randomBytes(32).toString("base64url");
  const key = keyOf(ticket);
  tickets.set(key, { userId, purpose, vaultId: vaultId ?? null, expiresAt: now + NAVIGATION_TICKET_TTL_MS });
  keysByUser.set(userId, [...(keysByUser.get(userId) ?? []), key]);
  return ticket;
}

/**
 * The user a ticket was issued to, or null when it is unknown, spent, expired,
 * another flow's or another vault's. Any attempt spends it.
 */
export function redeemNavigationTicket(ticket: string, purpose: NavigationPurpose, vaultId?: string): string | null {
  const key = keyOf(ticket);
  const entry = tickets.get(key);
  if (!entry) return null;
  forget(key);
  if (Date.now() > entry.expiresAt) return null;
  if (entry.purpose !== purpose || entry.vaultId !== (vaultId ?? null)) return null;
  return entry.userId;
}

/** How many tickets the store holds, for tests. */
export function storedNavigationTickets(): number {
  return tickets.size;
}
