import { api, type RequestOptions } from "@/lib/api";
import {
  MAX_LIST_LIMIT,
  type BarcodeFormat,
  type BarcodeLookup,
  type BarcodeLookupBody,
  type FavouriteFoodList,
  type FoodDetail,
  type FoodList,
  type FoodSearchResult,
  type OwnFoodBody,
  type Portion,
  type PortionBody,
} from "@hovimestari/types";

/**
 * `GET /foods/search`: the foods whose names hold every word of `q`, ranked
 * by the server, and in `near` the foods that hold all words but one, which
 * the server lists only when few foods hold them all.
 */
export async function searchFoods(q: string, req?: RequestOptions): Promise<FoodSearchResult> {
  const res = await api.get<FoodSearchResult>("/foods/search", { params: { q }, signal: req?.signal });
  return res.data;
}

/**
 * `POST /foods/lookup`: finds a barcode among the user's own foods, then the
 * products kept from Open Food Facts, then asks Open Food Facts. A write,
 * since it may keep a product and records that this user looked it up.
 * `format` is a scan's, and settles which way an 8-digit code reads. It
 * takes no signal: a lookup is never aborted, since the server may already
 * have stored the product.
 */
export async function lookupBarcode(barcode: string, format?: BarcodeFormat): Promise<BarcodeLookup> {
  const body: BarcodeLookupBody = format === undefined ? { barcode } : { barcode, format };
  const res = await api.post<BarcodeLookup>("/foods/lookup", body);
  return res.data;
}

/** `GET /foods/favourites`: the user's favourites, newest first. */
export async function getFavouriteFoods(req?: RequestOptions): Promise<FavouriteFoodList> {
  const res = await api.get<FavouriteFoodList>("/foods/favourites", { signal: req?.signal });
  return res.data;
}

/** `GET /foods/own`: the user's own foods, in alphabetical order, as many as the route gives (`MAX_LIST_LIMIT`). */
export async function getOwnFoods(req?: RequestOptions): Promise<FoodList> {
  const res = await api.get<FoodList>("/foods/own", { params: { limit: MAX_LIST_LIMIT }, signal: req?.signal });
  return res.data;
}

/** `GET /foods/:id`: one food with its portions. 404 `food_not_found` when it is gone. */
export async function getFood(id: string, req?: RequestOptions): Promise<FoodDetail> {
  const res = await api.get<FoodDetail>(`/foods/${id}`, { signal: req?.signal });
  return res.data;
}

/** `POST /foods`: adds the user's own food. */
export async function createFood(body: OwnFoodBody): Promise<FoodDetail> {
  const res = await api.post<FoodDetail>("/foods", body);
  return res.data;
}

/** `PUT /foods/:id`: changes the user's own food. */
export async function updateFood(id: string, body: OwnFoodBody): Promise<FoodDetail> {
  const res = await api.put<FoodDetail>(`/foods/${id}`, body);
  return res.data;
}

/** `DELETE /foods/:id`: deletes the user's own food. */
export async function deleteFood(id: string): Promise<void> {
  await api.delete(`/foods/${id}`);
}

/** `POST /foods/:id/portions`: adds the user's own portion to a food. */
export async function addPortion(foodId: string, body: PortionBody): Promise<Portion> {
  const res = await api.post<Portion>(`/foods/${foodId}/portions`, body);
  return res.data;
}

/** `PUT /foods/:id/portions/:portionId`: changes the user's own portion. */
export async function updatePortion(foodId: string, portionId: string, body: PortionBody): Promise<Portion> {
  const res = await api.put<Portion>(`/foods/${foodId}/portions/${portionId}`, body);
  return res.data;
}

/** `DELETE /foods/:id/portions/:portionId`: deletes the user's own portion. */
export async function deletePortion(foodId: string, portionId: string): Promise<void> {
  await api.delete(`/foods/${foodId}/portions/${portionId}`);
}

/** `PUT` or `DELETE /foods/:id/favourite`: marks or unmarks a favourite. Both are idempotent. */
export async function setFavourite(id: string, favourite: boolean): Promise<void> {
  if (favourite) await api.put(`/foods/${id}/favourite`);
  else await api.delete(`/foods/${id}/favourite`);
}
