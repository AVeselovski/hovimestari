import { api, type RequestOptions } from "@/lib/api";
import type { Me } from "@hovimestari/types";

/** `GET /users/me`: the signed-in user. */
export async function getMe(req?: RequestOptions): Promise<Me> {
  const res = await api.get<Me>("/users/me", { signal: req?.signal });
  return res.data;
}
