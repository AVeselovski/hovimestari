import type { AuthContextValue, AuthStatus } from "@/contexts/AuthContext";
import type { Me } from "@hovimestari/types";

export const TEST_USER: Me = {
  id: "0b1e6a7e-4b6f-4f0e-9a2e-6f1d2c3b4a59",
  email: "ada@example.com",
  hasPassword: true,
  hasGoogle: false,
  foodNameLanguage: "en",
  timeZone: "Europe/Helsinki",
};

/** An auth context value for a component test that mocks `useAuth`. */
export function fakeAuth(status: AuthStatus, overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  return {
    user: status === "authenticated" ? TEST_USER : null,
    status,
    signedOut: false,
    retry: jest.fn(),
    signIn: jest.fn(),
    signUp: jest.fn(),
    signOut: jest.fn(),
    ...overrides,
  };
}

/** A password made at run time, so no test holds a literal one. */
export function testPassword(): string {
  return `pw-${crypto.randomUUID()}`;
}
