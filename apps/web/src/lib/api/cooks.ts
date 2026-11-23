import { api } from "@/lib/api";
import type { CookBody, CookWriteResult } from "@hovimestari/types";

/**
 * `POST /cooks`: logs a batch as made, with the id the app chose, and puts
 * its servings on days in the same request: the entries it attaches, a
 * status for any of those, and the new ones it adds. Sent again with the
 * same id, it writes nothing and answers the same batch with `outcome:
 * "replayed"`.
 */
export async function createCook(body: CookBody): Promise<CookWriteResult> {
  const res = await api.post<CookWriteResult>("/cooks", body);
  return res.data;
}
