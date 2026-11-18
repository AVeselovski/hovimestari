import { api, type RequestOptions } from "@/lib/api";
import type { ChangePasswordBody, DeleteAccountBody, Me } from "@hovimestari/types";

/** `GET /users/me`: the signed-in user. */
export async function getMe(req?: RequestOptions): Promise<Me> {
  const res = await api.get<Me>("/users/me", { signal: req?.signal });
  return res.data;
}

/** `PUT /users/me/first-run`: records that the first run is behind the user, who goes on without targets. Idempotent. */
export async function finishFirstRun(): Promise<void> {
  await api.put("/users/me/first-run");
}

/** `PUT /users/me/password`. Ends every session, this device's included. */
export async function changePassword(body: ChangePasswordBody): Promise<void> {
  await api.put("/users/me/password", body);
}

/** `DELETE /users/me`. Deletes the account and everything it owns. */
export async function deleteAccount(body: DeleteAccountBody): Promise<void> {
  await api.delete("/users/me", { data: body });
}
