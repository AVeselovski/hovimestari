import { ERROR_CODES } from "@hovimestari/types";
import messages from "../../../messages/en.json";
import { CODES_WITHOUT_COPY, errorCopyKey } from "../errorCopy";

const copy = messages.errors as Record<string, string>;

describe("error copy", () => {
  it("has a catalog line for every error code not listed as going without", () => {
    const without = new Set<string>(CODES_WITHOUT_COPY);
    const missing = ERROR_CODES.filter((code) => !without.has(code) && !copy[code]);
    expect(missing).toEqual([]);
  });

  it("lists no code as going without copy that has copy", () => {
    expect(CODES_WITHOUT_COPY.filter((code) => code in copy)).toEqual([]);
  });

  it("has no catalog line for a code the API does not have", () => {
    const known = new Set<string>([...ERROR_CODES, "fallback"]);
    expect(Object.keys(copy).filter((key) => !known.has(key))).toEqual([]);
  });

  it("maps a code to its own line, and a code without copy or no code to the generic line", () => {
    expect(errorCopyKey("invalid_credentials")).toBe("invalid_credentials");
    expect(errorCopyKey("reset_rate_limited")).toBe("fallback");
    expect(errorCopyKey(undefined)).toBe("fallback");
  });
});
