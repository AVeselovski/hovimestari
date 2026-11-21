import { describe, expect, it } from "@jest/globals";
import { requestHashOf } from "../changeRecord.js";

// The request hash (design d.4): what makes a retry the same call. The
// database suites check what a hash decides, a replay or a refusal.

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("requestHashOf", () => {
  it("is the same for the same call whatever order its fields came in", () => {
    const one = requestHashOf("log_food", { requestKey: "k1", foodId: A, amount: { grams: 120 }, date: "2026-11-19" });
    const two = requestHashOf("log_food", { date: "2026-11-19", amount: { grams: 120 }, foodId: A, requestKey: "k1" });
    expect(one).toBe(two);
    expect(one).toMatch(/^[0-9a-f]{64}$/);
  });

  it("leaves the request key out, and a field left out hashes as absent", () => {
    const base = { foodId: A, amount: { grams: 120 } };
    expect(requestHashOf("log_food", { ...base, requestKey: "k1" })).toBe(
      requestHashOf("log_food", { ...base, requestKey: "k2", note: undefined }),
    );
  });

  it("differs when any argument differs", () => {
    const base = { requestKey: "k1", foodId: A, amount: { grams: 120 } };
    expect(requestHashOf("log_food", base)).not.toBe(requestHashOf("log_food", { ...base, amount: { grams: 121 } }));
  });

  it("names the tool, so the same arguments sent to another tool are another call", () => {
    const args = { requestKey: "k1", entryIds: [A] };
    expect(requestHashOf("remove_entries", args)).not.toBe(requestHashOf("set_entries_status", args));
  });

  it("reads entryIds as a set: order, repeats and letter case do not matter", () => {
    const one = requestHashOf("remove_entries", { requestKey: "k1", entryIds: [A, B] });
    expect(requestHashOf("remove_entries", { requestKey: "k1", entryIds: [B, A] })).toBe(one);
    expect(requestHashOf("remove_entries", { requestKey: "k1", entryIds: [B, A, B] })).toBe(one);
    expect(requestHashOf("remove_entries", { requestKey: "k1", entryIds: [B.toUpperCase(), A] })).toBe(one);
    expect(requestHashOf("remove_entries", { requestKey: "k1", entryIds: [A] })).not.toBe(one);
  });

  it("reads log_cook's attach as a set, and its attachStatus in any order", () => {
    const batch = { requestKey: "k1", recipeId: A, servings: 3, lines: [], add: [] };
    const one = requestHashOf("log_cook", {
      ...batch,
      attach: [A, B],
      attachStatus: [
        { id: A, status: "eaten" },
        { id: B, status: "planned" },
      ],
    });
    const reordered = {
      ...batch,
      attach: [B.toUpperCase(), A],
      attachStatus: [
        { id: B, status: "planned" },
        { id: A.toUpperCase(), status: "eaten" },
      ],
    };
    expect(requestHashOf("log_cook", reordered)).toBe(one);
    const otherStatus = {
      ...reordered,
      attachStatus: [
        { id: B, status: "eaten" },
        { id: A, status: "eaten" },
      ],
    };
    expect(requestHashOf("log_cook", otherStatus)).not.toBe(one);
    expect(requestHashOf("log_cook", { ...reordered, attach: [A] })).not.toBe(one);
  });

  it("leaves the caller's own list in its order", () => {
    const entryIds = [B, A];
    requestHashOf("copy_entries", { requestKey: "k1", entryIds, toDate: "2026-11-20" });
    expect(entryIds).toEqual([B, A]);
  });
});
