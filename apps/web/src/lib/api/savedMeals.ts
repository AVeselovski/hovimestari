import { api, type RequestOptions } from "@/lib/api";
import type {
  SaveAndLogBody,
  SaveAndLogResult,
  SavedMeal,
  SavedMealBody,
  SavedMealEditBody,
  SavedMealList,
} from "@hovimestari/types";

/** `GET /saved-meals`: the user's active meals, or with `archived` the archived ones, by name. */
export async function getSavedMeals(archived: boolean, req?: RequestOptions): Promise<SavedMealList> {
  const res = await api.get<SavedMealList>("/saved-meals", {
    params: archived ? { archived: "true" } : undefined,
    signal: req?.signal,
  });
  return res.data;
}

/**
 * `POST /saved-meals`: saves a meal with the id the app chose. Sent again with
 * the same id, it answers the meal it saved the first time.
 */
export async function createSavedMeal(body: SavedMealBody): Promise<SavedMeal> {
  const res = await api.post<SavedMeal>("/saved-meals", body);
  return res.data;
}

/**
 * `POST /saved-meals/log`: saves a meal and logs it in one request. Sent again
 * with the same ids, it adds nothing and answers `outcome: "replayed"`, with
 * no entry when that one was removed since.
 */
export async function saveAndLog(body: SaveAndLogBody): Promise<SaveAndLogResult> {
  const res = await api.post<SaveAndLogResult>("/saved-meals/log", body);
  return res.data;
}

/** `PUT /saved-meals/:id`: changes a meal. Its planned entries from today on take the new figures. */
export async function updateSavedMeal(id: string, body: SavedMealEditBody): Promise<SavedMeal> {
  const res = await api.put<SavedMeal>(`/saved-meals/${id}`, body);
  return res.data;
}

/** `PUT` or `DELETE /saved-meals/:id/archived`: archives or restores a meal, also when it already is. */
export async function setSavedMealArchived(id: string, archived: boolean): Promise<void> {
  if (archived) await api.put(`/saved-meals/${id}/archived`);
  else await api.delete(`/saved-meals/${id}/archived`);
}

/** `DELETE /saved-meals/:id`: deletes a meal. Days it was logged on keep their figures. */
export async function deleteSavedMeal(id: string): Promise<void> {
  await api.delete(`/saved-meals/${id}`);
}
