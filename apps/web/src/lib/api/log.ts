import { api, type RequestOptions } from "@/lib/api";
import type { RecentList } from "@hovimestari/types";

/** `GET /log/recents`: the foods, saved meals and recipes eaten most recently, newest first, each with its last amount. */
export async function getRecents(req?: RequestOptions): Promise<RecentList> {
  const res = await api.get<RecentList>("/log/recents", { signal: req?.signal });
  return res.data;
}
