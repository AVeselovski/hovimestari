import { createTestQueryClient } from "@/__tests__/helpers/queryClient";
import { dayOf, foodEntry } from "@/components/day/__tests__/support";
import { PENDING_ID_LIFE_MS, forgetSeen, pendingIdFor, pendingKey, settlePending } from "../pendingIds";

// The ids of one-tap adds not confirmed yet: kept per key so a press after a
// timeout resends the same id, and let go by the first of an answer, a day
// that holds the entry, or the end of their life.

const key = pendingKey("2026-11-16", "food", "00000000-0000-4000-8000-000000000001");

describe("pendingIds", () => {
  it("answers the same id for a key until it is let go", () => {
    const client = createTestQueryClient();
    const first = pendingIdFor(client, key, 0);
    expect(pendingIdFor(client, key, 1000)).toBe(first);
    expect(
      pendingIdFor(client, pendingKey("2026-11-17", "food", "00000000-0000-4000-8000-000000000001"), 1000),
    ).not.toBe(first);
  });

  it("mints a new id once the add was answered", () => {
    const client = createTestQueryClient();
    const first = pendingIdFor(client, key, 0);
    settlePending(client, first);
    expect(pendingIdFor(client, key, 10)).not.toBe(first);
  });

  it("mints a new id once a day answer holds the entry, and not before", () => {
    const client = createTestQueryClient();
    const first = pendingIdFor(client, key, 0);
    forgetSeen(client, dayOf([foodEntry("Oats", 80)]));
    expect(pendingIdFor(client, key, 10)).toBe(first);
    forgetSeen(client, dayOf([foodEntry("Shake", 300, { id: first })]));
    expect(pendingIdFor(client, key, 20)).not.toBe(first);
  });

  it("mints a new id once the id has lived its time", () => {
    const client = createTestQueryClient();
    const first = pendingIdFor(client, key, 0);
    expect(pendingIdFor(client, key, PENDING_ID_LIFE_MS - 1)).toBe(first);
    expect(pendingIdFor(client, key, PENDING_ID_LIFE_MS)).not.toBe(first);
  });

  it("keeps the ids of each query client apart", () => {
    const a = createTestQueryClient();
    const b = createTestQueryClient();
    expect(pendingIdFor(a, key, 0)).not.toBe(pendingIdFor(b, key, 0));
  });
});
