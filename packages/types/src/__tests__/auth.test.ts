import { describe, expect, it } from "@jest/globals";
import { randomUUID } from "node:crypto";
import {
  ChangePasswordBodySchema,
  DeleteAccountBodySchema,
  ERROR_CODES,
  ForgotPasswordBodySchema,
  GoogleExchangeBodySchema,
  GoogleLinkStartBodySchema,
  isErrorCode,
  LinkPasswordBodySchema,
  LoginBodySchema,
  MeSchema,
  RefreshBodySchema,
  RegisterBodySchema,
  ResetPasswordBodySchema,
} from "../index.js";

/** A password made at run time, so no literal password is committed. */
const pw = () => `pw-${randomUUID()}`;

/** The first issue's message, which the backend turns into the response's code. */
function firstMessage(result: { success: boolean; error?: { issues: { message: string }[] } }): string | undefined {
  return result.success ? undefined : result.error?.issues[0]?.message;
}

describe("RegisterBodySchema", () => {
  it("accepts an email and a password", () => {
    expect(RegisterBodySchema.safeParse({ email: "user@example.com", password: pw() }).success).toBe(true);
  });

  it("trims and lower-cases the email", () => {
    const parsed = RegisterBodySchema.parse({ email: "  User@Example.COM ", password: pw() });
    expect(parsed.email).toBe("user@example.com");
  });

  it("names invalid_email for an address that is not one", () => {
    expect(firstMessage(RegisterBodySchema.safeParse({ email: "not-an-email", password: pw() }))).toBe("invalid_email");
  });

  it("names password_too_short under 8 characters", () => {
    expect(firstMessage(RegisterBodySchema.safeParse({ email: "user@example.com", password: "x".repeat(7) }))).toBe(
      "password_too_short",
    );
  });

  it("accepts exactly 72 bytes and names password_too_long at 73", () => {
    expect(RegisterBodySchema.safeParse({ email: "user@example.com", password: "x".repeat(72) }).success).toBe(true);
    expect(firstMessage(RegisterBodySchema.safeParse({ email: "user@example.com", password: "x".repeat(73) }))).toBe(
      "password_too_long",
    );
  });

  it("counts bytes, not characters: 25 three-byte characters are 75 bytes", () => {
    expect(firstMessage(RegisterBodySchema.safeParse({ email: "user@example.com", password: "€".repeat(25) }))).toBe(
      "password_too_long",
    );
  });

  it("refuses a body without a password", () => {
    expect(RegisterBodySchema.safeParse({ email: "user@example.com" }).success).toBe(false);
  });

  it("drops a display name: accounts have none", () => {
    const parsed = RegisterBodySchema.parse({ email: "user@example.com", password: pw(), displayName: "Someone" });
    expect(parsed).not.toHaveProperty("displayName");
  });
});

describe("LoginBodySchema", () => {
  it("accepts any non-empty password", () => {
    expect(LoginBodySchema.safeParse({ email: "user@example.com", password: "x" }).success).toBe(true);
  });

  it("refuses an empty password", () => {
    expect(LoginBodySchema.safeParse({ email: "user@example.com", password: "" }).success).toBe(false);
  });

  it("names password_too_long for a 73-byte password, so bcrypt never compares a truncation", () => {
    expect(firstMessage(LoginBodySchema.safeParse({ email: "user@example.com", password: "x".repeat(73) }))).toBe(
      "password_too_long",
    );
  });

  it("lower-cases the email, so sign-in is case insensitive", () => {
    expect(LoginBodySchema.parse({ email: "USER@example.com", password: "x" }).email).toBe("user@example.com");
  });
});

describe("token bodies", () => {
  it("RefreshBodySchema needs a non-empty token", () => {
    expect(RefreshBodySchema.safeParse({ refreshToken: "abc" }).success).toBe(true);
    expect(RefreshBodySchema.safeParse({ refreshToken: "" }).success).toBe(false);
  });

  it("GoogleExchangeBodySchema needs a code and a nonce", () => {
    expect(GoogleExchangeBodySchema.safeParse({ code: "c", nonce: "n" }).success).toBe(true);
    expect(GoogleExchangeBodySchema.safeParse({ code: "c" }).success).toBe(false);
  });

  it("GoogleLinkStartBodySchema needs a SHA-256 in lower-case hex", () => {
    expect(GoogleLinkStartBodySchema.safeParse({ bind: "a".repeat(64) }).success).toBe(true);
    expect(GoogleLinkStartBodySchema.safeParse({ bind: "A".repeat(64) }).success).toBe(false);
    expect(GoogleLinkStartBodySchema.safeParse({ bind: "a".repeat(63) }).success).toBe(false);
  });
});

describe("password bodies", () => {
  it("ForgotPasswordBodySchema needs a valid email", () => {
    expect(ForgotPasswordBodySchema.safeParse({ email: "user@example.com" }).success).toBe(true);
    expect(firstMessage(ForgotPasswordBodySchema.safeParse({ email: "bad" }))).toBe("invalid_email");
  });

  it("ResetPasswordBodySchema needs a token and a valid new password", () => {
    expect(ResetPasswordBodySchema.safeParse({ token: "t", newPassword: pw() }).success).toBe(true);
    expect(ResetPasswordBodySchema.safeParse({ token: "", newPassword: pw() }).success).toBe(false);
    expect(firstMessage(ResetPasswordBodySchema.safeParse({ token: "t", newPassword: "x" }))).toBe(
      "password_too_short",
    );
  });

  it("LinkPasswordBodySchema applies the password rules", () => {
    expect(LinkPasswordBodySchema.safeParse({ password: pw() }).success).toBe(true);
    expect(firstMessage(LinkPasswordBodySchema.safeParse({ password: "x".repeat(73) }))).toBe("password_too_long");
  });

  it("ChangePasswordBodySchema needs the current password and a valid new one", () => {
    expect(ChangePasswordBodySchema.safeParse({ currentPassword: pw(), newPassword: pw() }).success).toBe(true);
    expect(ChangePasswordBodySchema.safeParse({ newPassword: pw() }).success).toBe(false);
  });
});

describe("DeleteAccountBodySchema", () => {
  it("accepts a password or an email", () => {
    expect(DeleteAccountBodySchema.safeParse({ password: pw() }).success).toBe(true);
    expect(DeleteAccountBodySchema.parse({ email: " User@Example.com" })).toEqual({ email: "user@example.com" });
  });

  it("refuses an empty body", () => {
    expect(DeleteAccountBodySchema.safeParse({}).success).toBe(false);
  });
});

describe("MeSchema", () => {
  it("has no display name", () => {
    const me = {
      id: randomUUID(),
      email: "user@example.com",
      hasPassword: true,
      hasGoogle: false,
      foodNameLanguage: "fi",
      timeZone: "Europe/Helsinki",
    };
    expect(MeSchema.parse({ ...me, displayName: "x" })).toEqual(me);
  });
});

describe("error codes", () => {
  it("every code the schemas emit is a listed error code", () => {
    for (const code of ["invalid_email", "password_too_short", "password_too_long"]) {
      expect(isErrorCode(code)).toBe(true);
    }
  });

  it("isErrorCode refuses anything else", () => {
    expect(isErrorCode("Invalid input")).toBe(false);
    expect(isErrorCode(undefined)).toBe(false);
  });

  it("lists each code once", () => {
    expect(new Set(ERROR_CODES).size).toBe(ERROR_CODES.length);
  });
});
