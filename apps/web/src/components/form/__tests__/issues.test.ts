import { firstIssues, passwordFieldError } from "../issues";

describe("passwordFieldError", () => {
  it.each(["password_too_short", "password_too_long"] as const)("puts %s under the new-password field", (code) => {
    expect(passwordFieldError(code)).toBe(code);
  });

  it.each([undefined, "current_password_wrong", "server_unreachable"] as const)(
    "leaves %s to another place",
    (code) => {
      expect(passwordFieldError(code)).toBeUndefined();
    },
  );
});

describe("firstIssues", () => {
  it("keeps the first issue of each field", () => {
    expect(
      firstIssues({
        issues: [
          { path: ["password"], message: "password_too_short" },
          { path: ["password"], message: "other" },
          { path: ["email"], message: "invalid_email" },
        ],
      }),
    ).toEqual({ password: "password_too_short", email: "invalid_email" });
  });
});
