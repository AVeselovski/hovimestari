import { describe, expect, it } from "@jest/globals";
import {
  CONNECTION_EXPIRY_DAYS,
  CONNECTION_WRITE_EXPIRY_DAYS,
  CreateConnectionBodySchema,
  CreatedConnectionSchema,
  ERROR_CODES,
  MAX_CONNECTION_NAME_LENGTH,
} from "../index.js";

// The create body's refusals, each by the code the web app shows.

function firstMessage(body: unknown): string | undefined {
  const result = CreateConnectionBodySchema.safeParse(body);
  return result.success ? undefined : result.error.issues[0]?.message;
}

describe("CreateConnectionBodySchema", () => {
  it("defaults to a read key for 30 days, with the name trimmed", () => {
    expect(CreateConnectionBodySchema.parse({ name: "  Claude on my laptop " })).toEqual({
      name: "Claude on my laptop",
      access: "read",
      expiresInDays: 30,
    });
  });

  it("takes every lifetime on offer for a read key", () => {
    for (const expiresInDays of CONNECTION_EXPIRY_DAYS) {
      expect(CreateConnectionBodySchema.parse({ name: "a", expiresInDays }).expiresInDays).toBe(expiresInDays);
    }
  });

  it("takes 7, 30 and 90 days for a writing key", () => {
    for (const expiresInDays of CONNECTION_WRITE_EXPIRY_DAYS) {
      expect(CreateConnectionBodySchema.parse({ name: "a", access: "read_write", expiresInDays })).toEqual({
        name: "a",
        access: "read_write",
        expiresInDays,
      });
    }
  });

  it("refuses a year for a writing key", () => {
    expect(firstMessage({ name: "a", access: "read_write", expiresInDays: 365 })).toBe(
      "connection_write_expiry_too_long",
    );
  });

  it("refuses a missing, blank or non-text name as required", () => {
    expect(firstMessage({})).toBe("connection_name_required");
    expect(firstMessage({ name: "   " })).toBe("connection_name_required");
    expect(firstMessage({ name: 12 })).toBe("connection_name_required");
  });

  it.each([
    ["a NUL", "a\u0000b"],
    ["a newline", "a\nb"],
    ["a tab", "a\tb"],
    ["a delete", "a\u007fb"],
    ["a right-to-left override", "a\u202eb"],
    ["a left-to-right isolate", "a\u2066b"],
    ["a zero-width space", "a\u200bb"],
    ["a zero-width space alone", "\u200b"],
    ["a byte order mark inside", "a\ufeffb"],
    ["a soft hyphen inside", "Assis\u00adtant"],
    ["a soft hyphen alone", "\u00ad"],
    ["a word joiner", "a\u2060b"],
    ["only a zero-width joiner", "\u200d"],
    ["only a zero-width non-joiner", "\u200c"],
    ["only a Hangul filler", "\u3164"],
    ["only a braille blank", "\u2800"],
    ["only half-width and Jamo fillers", "\uffa0\u115f\u1160"],
    ["only tag characters", "\u{e0067}\u{e0062}\u{e007f}"],
  ])("refuses a name with %s", (_, name) => {
    expect(firstMessage({ name })).toBe("connection_name_invalid");
  });

  it("takes a name in any script, with joined emoji, flags and punctuation, and trims spaces and line ends around it", () => {
    const persian = "\u0645\u06cc\u200c\u062e\u0648\u0627\u0647\u0645"; // with a zero-width non-joiner, as Persian spells it
    const family = "\u{1f468}\u200d\u{1f469}\u200d\u{1f467}"; // three people joined into one picture
    const scotland = "\u{1f3f4}\u{e0067}\u{e0062}\u{e0073}\u{e0063}\u{e0074}\u{e007f}"; // a flag made with tag characters
    for (const name of ["Claude työkoneella", "Ассистент", "助手 🤖", "<b>&amp;</b>", persian, family, scotland]) {
      expect(CreateConnectionBodySchema.parse({ name }).name).toBe(name);
    }
    expect(CreateConnectionBodySchema.parse({ name: "\n Claude \t" }).name).toBe("Claude");
  });

  it("takes a name of 64 characters and refuses 65", () => {
    expect(CreateConnectionBodySchema.parse({ name: "x".repeat(MAX_CONNECTION_NAME_LENGTH) }).name).toHaveLength(64);
    expect(firstMessage({ name: "x".repeat(MAX_CONNECTION_NAME_LENGTH + 1) })).toBe("connection_name_too_long");
  });

  it("refuses a lifetime not on offer", () => {
    for (const expiresInDays of [0, 1, 31, 366, "30", 30.5, null]) {
      expect(firstMessage({ name: "a", expiresInDays })).toBe("connection_expiry_invalid");
    }
  });

  it("refuses an access level that does not exist", () => {
    expect(CreateConnectionBodySchema.safeParse({ name: "a", access: "admin" }).success).toBe(false);
  });

  it("names only codes the API knows", () => {
    const codes = new Set<string>(ERROR_CODES);
    for (const body of [{}, { name: "x".repeat(65) }, { name: "a\u0000" }, { name: "a", expiresInDays: 1 }]) {
      expect(codes.has(firstMessage(body)!)).toBe(true);
    }
  });
});

describe("CreatedConnectionSchema", () => {
  it("reads only a key with the app's prefix", () => {
    const connection = {
      id: "7d0b5c9e-2f0a-4c1e-9b8a-000000000001",
      name: "a",
      access: "read",
      status: "active",
      createdAt: "2026-11-19T10:00:00.000Z",
      expiresAt: "2026-12-19T10:00:00.000Z",
      lastUsedAt: null,
    };
    expect(CreatedConnectionSchema.safeParse({ connection, key: "hovi_mcp_x" }).success).toBe(true);
    expect(CreatedConnectionSchema.safeParse({ connection, key: "other_x" }).success).toBe(false);
  });
});
