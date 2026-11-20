import { randomUUID } from "node:crypto";
import type { ApiUser } from "./apiUser.js";
import type { daysApi } from "./daysApi.js";

// The recipe routes as the real-database suites drive them, and the lines a
// recipe body is built from.

type Days = ReturnType<typeof daysApi>;

/** A counted line: a food with its amount, `{ grams }` or `{ portionId, count }`. */
export const counted = (foodId: string, amount: object, extra: object = {}) => ({
  id: randomUUID(),
  counted: true,
  foodId,
  amount,
  ...extra,
});

/** A line not counted, such as salt. */
export const notCounted = (name = "Salt", extra: object = {}) => ({ id: randomUUID(), counted: false, name, ...extra });

/** A recipe body serving 2 with `lines`. */
export const recipeBody = <L extends { id: string }>(lines: L[], extra: object = {}) => ({
  id: randomUUID(),
  name: "Shakshuka",
  servings: 2,
  lines,
  ...extra,
});

/** A recipe entry body: one serving, planned on `date`. */
export const recipeEntryBody = (
  recipeId: string,
  date: string,
  opts: { servings?: number; status?: "planned" | "eaten"; id?: string } = {},
) => ({
  kind: "recipe",
  id: opts.id ?? randomUUID(),
  recipeId,
  servings: opts.servings ?? 1,
  date,
  status: opts.status ?? "planned",
});

/** A UUID whose first eight hex digits are `prefix`, so a test can choose which of two ids sorts first. */
export const idStarting = (prefix: string) => `${prefix}${randomUUID().slice(prefix.length)}`;

/** A create body as an edit takes it: the whole recipe without its id. */
export const editOf = <B extends { id: string }>({ id: _id, ...rest }: B): Omit<B, "id"> => rest;

export function recipesApi(d: Days) {
  const create = (user: ApiUser, body: object) => d.api().post(d.v1("/recipes")).set(user.auth).send(body);
  const put = (user: ApiUser, id: string, body: object) =>
    d
      .api()
      .put(d.v1(`/recipes/${id}`))
      .set(user.auth)
      .send(body);
  const get = (user: ApiUser, id: string, query: object = {}) =>
    d
      .api()
      .get(d.v1(`/recipes/${id}`))
      .query(query)
      .set(user.auth);
  const list = (user: ApiUser, query: object = {}) => d.api().get(d.v1("/recipes")).query(query).set(user.auth);
  const preview = (user: ApiUser, body: object) => d.api().post(d.v1("/recipes/preview")).set(user.auth).send(body);
  const flag = (user: ApiUser, id: string, path: "archived" | "favourite", on: boolean) =>
    (on ? d.api().put(d.v1(`/recipes/${id}/${path}`)) : d.api().delete(d.v1(`/recipes/${id}/${path}`))).set(user.auth);
  const remove = (user: ApiUser, id: string) =>
    d
      .api()
      .delete(d.v1(`/recipes/${id}`))
      .set(user.auth);

  /** Creates a recipe and answers it, failing loudly on anything but 201. */
  async function created(user: ApiUser, body: object) {
    const res = await create(user, body);
    if (res.status !== 201) throw new Error(`recipe create answered ${res.status} ${JSON.stringify(res.body)}`);
    return res.body;
  }

  return { create, put, get, list, preview, flag, remove, created };
}
