import { api, type RequestOptions } from "@/lib/api";
import {
  GoogleLinkStartSchema,
  type AuthProviders,
  type ForgotPasswordBody,
  type GoogleLinkStart,
  type LinkPasswordBody,
  type Me,
  type ResetPasswordBody,
} from "@hovimestari/types";

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

/** `GET /auth/providers`: whether this deployment offers Google. */
export async function getProviders(req?: RequestOptions): Promise<AuthProviders> {
  const res = await api.get<AuthProviders>("/auth/providers", { signal: req?.signal });
  return res.data;
}

/** `POST /auth/link/password`: adds a first password to an account that signs in with Google. */
export async function addPassword(body: LinkPasswordBody): Promise<Me> {
  const res = await api.post<Me>("/auth/link/password", body);
  return res.data;
}

/** `DELETE /auth/unlink/:method`: removes Google or the password. The server keeps the last way in. */
export async function removeSignInMethod(method: "google" | "password"): Promise<Me> {
  const res = await api.delete<Me>(`/auth/unlink/${method}`);
  return res.data;
}

/**
 * Starts linking Google to the signed-in account, through the app's own
 * route handler, which binds the flow to this browser with a nonce cookie.
 * Answers Google's consent address, which the page then navigates to. The
 * call carries the bearer like any API call, and renews it on a 401.
 */
export async function startGoogleLink(): Promise<GoogleLinkStart> {
  const res = await api.post<GoogleLinkStart>("/api/auth/google/link/start", undefined, { baseURL: "" });
  const parsed = GoogleLinkStartSchema.safeParse(res.data);
  if (!parsed.success) throw new Error("The link start answer does not parse.");
  return parsed.data;
}
