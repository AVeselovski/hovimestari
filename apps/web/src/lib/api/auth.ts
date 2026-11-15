import { api } from "@/lib/api";
import type { ForgotPasswordBody, ResetPasswordBody } from "@hovimestari/types";

// The auth calls that go straight to the backend. Signing in, signing up,
// renewing and signing out go through the app's own route handlers instead
// (contexts/AuthContext.tsx), because those answers carry a refresh token.

/** `POST /auth/forgot-password`. Answers the same for every address. */
export async function requestPasswordReset(body: ForgotPasswordBody): Promise<void> {
  await api.post("/auth/forgot-password", body);
}

/** `POST /auth/reset-password`. Sets the password and ends every session. */
export async function resetPassword(body: ResetPasswordBody): Promise<void> {
  await api.post("/auth/reset-password", body);
}

/** `POST /auth/logout-all`. Ends every session of the signed-in user. */
export async function endAllSessions(): Promise<void> {
  await api.post("/auth/logout-all");
}
