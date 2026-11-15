import { afterEach, describe, expect, it, jest } from "@jest/globals";
import {
  issueNavigationTicket,
  MAX_NAVIGATION_TICKETS,
  MAX_NAVIGATION_TICKETS_PER_USER,
  NAVIGATION_TICKET_TTL_MS,
  redeemNavigationTicket,
  storedNavigationTickets,
} from "../navigationTickets.js";

const USER = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
const VAULT = "c3d4e5f6-a7b8-9012-cdef-123456789012";
const OTHER_VAULT = "d4e5f6a7-b8c9-0123-def0-234567890123";

afterEach(() => {
  jest.restoreAllMocks();
});

/** Moves the clock past every ticket an earlier test left, so the next issue clears them. */
function expireEarlierTickets() {
  jest.spyOn(Date, "now").mockReturnValue(Date.now() + 10 * NAVIGATION_TICKET_TTL_MS);
}

describe("navigation tickets", () => {
  it("lives about a minute", () => {
    expect(NAVIGATION_TICKET_TTL_MS).toBe(60_000);
  });

  it("redeems to the user it was issued for", () => {
    const ticket = issueNavigationTicket(USER, "google-link");
    expect(redeemNavigationTicket(ticket, "google-link")).toBe(USER);
  });

  it("is opaque and unique", () => {
    const a = issueNavigationTicket(USER, "google-link");
    const b = issueNavigationTicket(USER, "google-link");
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a).not.toContain(USER);
  });

  it("redeems once", () => {
    const ticket = issueNavigationTicket(USER, "google-link");
    expect(redeemNavigationTicket(ticket, "google-link")).toBe(USER);
    expect(redeemNavigationTicket(ticket, "google-link")).toBeNull();
  });

  it("expires after its minute", () => {
    const now = Date.now();
    const clock = jest.spyOn(Date, "now").mockReturnValue(now);
    const ticket = issueNavigationTicket(USER, "google-link");
    clock.mockReturnValue(now + NAVIGATION_TICKET_TTL_MS + 1);
    expect(redeemNavigationTicket(ticket, "google-link")).toBeNull();
  });

  it("still redeems just inside its minute", () => {
    const now = Date.now();
    const clock = jest.spyOn(Date, "now").mockReturnValue(now);
    const ticket = issueNavigationTicket(USER, "google-link");
    clock.mockReturnValue(now + NAVIGATION_TICKET_TTL_MS);
    expect(redeemNavigationTicket(ticket, "google-link")).toBe(USER);
  });

  it("is refused for another purpose, and is spent by the attempt", () => {
    const ticket = issueNavigationTicket(USER, "google-link");
    expect(redeemNavigationTicket(ticket, "drive-connect", VAULT)).toBeNull();
    expect(redeemNavigationTicket(ticket, "google-link")).toBeNull();
  });

  it("is bound to its vault", () => {
    const ticket = issueNavigationTicket(USER, "drive-connect", VAULT);
    expect(redeemNavigationTicket(ticket, "drive-connect", OTHER_VAULT)).toBeNull();

    const again = issueNavigationTicket(USER, "drive-connect", VAULT);
    expect(redeemNavigationTicket(again, "drive-connect")).toBeNull();

    const right = issueNavigationTicket(USER, "drive-connect", VAULT);
    expect(redeemNavigationTicket(right, "drive-connect", VAULT)).toBe(USER);
  });

  it("refuses a vault on a ticket issued without one", () => {
    const ticket = issueNavigationTicket(USER, "google-link");
    expect(redeemNavigationTicket(ticket, "google-link", VAULT)).toBeNull();
  });

  it.each([
    ["an unknown ticket", "nope"],
    ["an empty ticket", ""],
  ])("refuses %s", (_label, ticket) => {
    expect(redeemNavigationTicket(ticket, "google-link")).toBeNull();
  });

  it("drops expired tickets when it issues a new one", () => {
    const now = Date.now();
    const clock = jest.spyOn(Date, "now").mockReturnValue(now);
    issueNavigationTicket(USER, "google-link");
    issueNavigationTicket(USER, "google-link");
    expect(storedNavigationTickets()).toBeGreaterThanOrEqual(2);
    clock.mockReturnValue(now + NAVIGATION_TICKET_TTL_MS + 1);
    issueNavigationTicket(USER, "google-link");
    expect(storedNavigationTickets()).toBe(1);
  });

  it("holds at most its cap, dropping the oldest", () => {
    const first = issueNavigationTicket(USER, "google-link");
    for (let i = 0; i < MAX_NAVIGATION_TICKETS; i++) issueNavigationTicket(`user-${i}`, "google-link");
    expect(storedNavigationTickets()).toBe(MAX_NAVIGATION_TICKETS);
    expect(redeemNavigationTicket(first, "google-link")).toBeNull();
    const last = issueNavigationTicket(USER, "google-link");
    expect(redeemNavigationTicket(last, "google-link")).toBe(USER);
  });

  it("holds at most twenty live tickets per user, so one account cannot push out another's", () => {
    expect(MAX_NAVIGATION_TICKETS_PER_USER).toBe(20);
    expireEarlierTickets();
    const other = issueNavigationTicket("other-user", "google-link");
    expect(storedNavigationTickets()).toBe(1);
    const before = 1;
    const minted = Array.from({ length: MAX_NAVIGATION_TICKETS_PER_USER + 1 }, () =>
      issueNavigationTicket(USER, "google-link"),
    );
    // The 21st evicted this user's oldest, and nobody else's.
    expect(storedNavigationTickets() - before).toBe(MAX_NAVIGATION_TICKETS_PER_USER);
    expect(redeemNavigationTicket(minted[0], "google-link")).toBeNull();
    expect(redeemNavigationTicket(minted[1], "google-link")).toBe(USER);
    expect(redeemNavigationTicket(minted[MAX_NAVIGATION_TICKETS_PER_USER], "google-link")).toBe(USER);
    expect(redeemNavigationTicket(other, "google-link")).toBe("other-user");
  });

  it("frees a user's place when a ticket is redeemed", () => {
    expireEarlierTickets();
    const minted = Array.from({ length: MAX_NAVIGATION_TICKETS_PER_USER }, () =>
      issueNavigationTicket(USER, "google-link"),
    );
    expect(redeemNavigationTicket(minted[5], "google-link")).toBe(USER);
    issueNavigationTicket(USER, "google-link");
    // Twenty live again, so nothing was evicted: the oldest still redeems.
    expect(redeemNavigationTicket(minted[0], "google-link")).toBe(USER);
  });
});
