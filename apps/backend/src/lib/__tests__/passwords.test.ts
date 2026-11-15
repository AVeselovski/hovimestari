import { describe, expect, it, jest } from "@jest/globals";

// The dummy hash a sign-in without a stored hash is compared against. A
// failure making it must not stay cached, or every such sign-in would fail.

const mockHash = jest.fn<(value: string, cost: number) => Promise<string>>();
const mockCompare = jest.fn(async () => false);
jest.unstable_mockModule("bcrypt", () => ({ default: { hash: mockHash, compare: mockCompare } }));

mockHash.mockRejectedValueOnce(new Error("out of memory"));
const { passwordMatches } = await import("../passwords.js");

describe("passwordMatches without a stored hash", () => {
  it("retries the dummy hash after it failed, instead of failing every later sign-in", async () => {
    mockHash.mockRejectedValueOnce(new Error("still failing"));
    await expect(passwordMatches("anything", null)).rejects.toThrow("still failing");

    mockHash.mockResolvedValue("dummy-hash-value");
    await expect(passwordMatches("anything", null)).resolves.toBe(false);
    await expect(passwordMatches("anything", undefined)).resolves.toBe(false);
    expect(mockCompare).toHaveBeenCalledWith("anything", "dummy-hash-value");
    // One failed try and one that worked. The hash is then cached.
    expect(mockHash).toHaveBeenCalledTimes(2);
  });
});
