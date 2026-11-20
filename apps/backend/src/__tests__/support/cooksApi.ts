import { randomUUID } from "node:crypto";
import type { ApiUser } from "./apiUser.js";
import type { daysApi } from "./daysApi.js";

// The cook routes as the real-database suites drive them, and the body a
// batch logged as made is built from.

type Days = ReturnType<typeof daysApi>;

/** A cook body: the batch of `recipeId` made on `date` with `lines`, serving 2, and what it feeds. */
export const cookBody = (
  recipeId: string,
  date: string,
  lines: object[],
  opts: {
    servings?: number;
    attach?: string[];
    attachStatus?: { id: string; status: "planned" | "eaten" }[];
    add?: { id?: string; date: string; status: "planned" | "eaten"; servings?: number }[];
    id?: string;
  } = {},
) => ({
  id: opts.id ?? randomUUID(),
  recipeId,
  date,
  servings: opts.servings ?? 2,
  lines,
  attach: opts.attach ?? [],
  attachStatus: opts.attachStatus ?? [],
  add: (opts.add ?? []).map((a) => ({ id: a.id ?? randomUUID(), servings: a.servings ?? 1, ...a })),
});

/** A recipe's lines as a cook starts from them: each with a new id and its recipe line as `fromLineId`. */
export const asMade = <L extends { id: string }>(lines: L[]) =>
  lines.map((line) => ({ ...line, id: randomUUID(), fromLineId: line.id }));

export function cooksApi(d: Days) {
  const create = (user: ApiUser, body: object) => d.api().post(d.v1("/cooks")).set(user.auth).send(body);
  const get = (user: ApiUser, id: string) =>
    d
      .api()
      .get(d.v1(`/cooks/${id}`))
      .set(user.auth);
  const saveAsRecipe = (user: ApiUser, cookId: string, body: object) =>
    d
      .api()
      .post(d.v1(`/cooks/${cookId}/recipe`))
      .set(user.auth)
      .send(body);

  /** Logs a batch as made and answers the write, failing loudly on anything but 201. */
  async function created(user: ApiUser, body: object) {
    const res = await create(user, body);
    if (res.status !== 201) throw new Error(`cook create answered ${res.status} ${JSON.stringify(res.body)}`);
    return res.body;
  }

  return { create, get, saveAsRecipe, created };
}
