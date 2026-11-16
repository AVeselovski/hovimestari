import { api } from "@/lib/api";
import type { Me, SettingsBody } from "@hovimestari/types";

/** `PATCH /users/me/settings`: the food-name language, the time zone, or both. Answers the account. */
export async function updateSettings(body: SettingsBody): Promise<Me> {
  const res = await api.patch<Me>("/users/me/settings", body);
  return res.data;
}
