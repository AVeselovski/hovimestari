import { describe, expect, it } from "@jest/globals";
import {
  AddEntryBodySchema,
  AssistantEntryLineSchema,
  EntryPatchBodySchema,
  EntryRemoveManyBodySchema,
  EntryRemoveManyResultSchema,
  MAX_ENTRY_BATCH,
} from "../index.js";

// The batch remove's body and answer: 1 to 100 unique entry ids in, the ids
// removed and their days out.

function firstMessage(result: { success: boolean; error?: { issues: { message: string }[] } }): string | undefined {
  return result.success ? undefined : result.error?.issues[0]?.message;
}

const uuid = (n: number) => `7d0b5c9e-2f0a-4c1e-9b8a-${n.toString(16).padStart(12, "0")}`;

describe("EntryRemoveManyBodySchema", () => {
  it("takes one to a hundred distinct entry ids", () => {
    expect(EntryRemoveManyBodySchema.parse({ entryIds: [uuid(1)] })).toEqual({ entryIds: [uuid(1)] });
    const full = Array.from({ length: MAX_ENTRY_BATCH }, (_, i) => uuid(i));
    expect(EntryRemoveManyBodySchema.parse({ entryIds: full }).entryIds).toHaveLength(100);
  });

  it("refuses an empty list, a list over the cap, a repeated id in any case and a malformed id", () => {
    const over = Array.from({ length: MAX_ENTRY_BATCH + 1 }, (_, i) => uuid(i));
    for (const entryIds of [[], over, ["not-a-uuid"]]) {
      expect(EntryRemoveManyBodySchema.safeParse({ entryIds }).success).toBe(false);
    }
    for (const entryIds of [
      [uuid(1), uuid(1)],
      [uuid(10), uuid(10).toUpperCase()],
    ]) {
      expect(firstMessage(EntryRemoveManyBodySchema.safeParse({ entryIds }))).toBe("invalid_request");
    }
    expect(EntryRemoveManyBodySchema.safeParse({}).success).toBe(false);
    expect(EntryRemoveManyBodySchema.safeParse({ entryIds: uuid(1) }).success).toBe(false);
  });
});

describe("EntryRemoveManyResultSchema", () => {
  it("reads an answer with nothing removed, as a repeat answers", () => {
    expect(EntryRemoveManyResultSchema.parse({ removedIds: [], days: [] })).toEqual({ removedIds: [], days: [] });
  });

  it("refuses an answer without its days", () => {
    expect(EntryRemoveManyResultSchema.safeParse({ removedIds: [uuid(1)] }).success).toBe(false);
  });
});

describe("a recipe entry", () => {
  const body = (servings: unknown) => ({
    kind: "recipe",
    id: uuid(1),
    recipeId: uuid(2),
    servings,
    date: "2026-11-21",
    status: "planned",
  });

  it("is added by its servings, with up to two decimals, above zero and up to 100", () => {
    for (const servings of [1, 1.5, 0.25, 100]) expect(AddEntryBodySchema.safeParse(body(servings)).success).toBe(true);
    for (const servings of [0, -1, 100.01, 1.255]) {
      expect(firstMessage(AddEntryBodySchema.safeParse(body(servings)))).toBe("entry_count_invalid");
    }
  });

  it("changes its servings by a patch", () => {
    expect(EntryPatchBodySchema.parse({ servings: 2.5 })).toEqual({ servings: 2.5 });
    expect(firstMessage(EntryPatchBodySchema.safeParse({ servings: 100.01 }))).toBe("entry_count_invalid");
  });

  it("is a line of the record with its servings, never read as a count", () => {
    const line = {
      name: "Shakshuka",
      date: "2026-11-21",
      status: "planned",
      kind: "recipe",
      amount: { servings: 1.5 },
      figures: { energyKcal: 548, proteinG: 32.7, carbsG: 14.8, fatG: 38.5 },
    };
    expect(AssistantEntryLineSchema.parse(line).amount).toEqual({ servings: 1.5 });
  });
});
