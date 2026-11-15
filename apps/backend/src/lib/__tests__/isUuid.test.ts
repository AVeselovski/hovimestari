import { describe, expect, it } from "@jest/globals";
import { isUuid } from "../isUuid.js";

describe("isUuid", () => {
  it("takes a UUID in either letter case", () => {
    expect(isUuid("00000000-0000-4000-8000-000000000030")).toBe(true);
    expect(isUuid("ABCDEF00-0000-4000-8000-00000000000A")).toBe(true);
  });

  it.each([
    "",
    "not-a-uuid",
    "00000000-0000-4000-8000-00000000003",
    "00000000-0000-4000-8000-0000000000300",
    "{00000000-0000-4000-8000-000000000030}",
  ])("refuses %j", (value) => {
    expect(isUuid(value)).toBe(false);
  });
});
