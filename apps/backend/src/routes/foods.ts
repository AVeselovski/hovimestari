import { FoodListQuerySchema, FoodSearchQuerySchema, OwnFoodBodySchema, PortionBodySchema } from "@hovimestari/types";
import { Router, type Router as IRouter } from "express";
import { parseBody, parseQuery } from "../lib/parseBody.js";
import { contextFor } from "../lib/requestContext.js";
import { authenticate } from "../middleware/authenticate.js";
import { getFood, listFavouriteFoods, listOwnFoods, searchFoods } from "../services/reads/foods.js";
import {
  addPortion,
  createOwnFood,
  deleteOwnFood,
  removePortion,
  setFavourite,
  updateOwnFood,
  updatePortion,
} from "../services/writes/foods.js";

// Thin: parse, build the context, call one service, send. The fixed paths are
// registered before `/:id`.

export const foodsRouter: IRouter = Router();
foodsRouter.use(authenticate);

foodsRouter.get("/search", async (req, res) => {
  const query = parseQuery(FoodSearchQuerySchema, req.query);
  res.status(200).json(await searchFoods(await contextFor(req), query));
});

foodsRouter.get("/favourites", async (req, res) => {
  const query = parseQuery(FoodListQuerySchema, req.query);
  res.status(200).json(await listFavouriteFoods(await contextFor(req), query));
});

foodsRouter.get("/own", async (req, res) => {
  const query = parseQuery(FoodListQuerySchema, req.query);
  res.status(200).json(await listOwnFoods(await contextFor(req), query));
});

foodsRouter.get("/:id", async (req, res) => {
  res.status(200).json(await getFood(await contextFor(req), req.params.id));
});

foodsRouter.post("/", async (req, res) => {
  const body = parseBody(OwnFoodBodySchema, req.body);
  const { value } = await createOwnFood(await contextFor(req), body);
  res.status(201).json(value);
});

foodsRouter.put("/:id", async (req, res) => {
  const body = parseBody(OwnFoodBodySchema, req.body);
  const { value } = await updateOwnFood(await contextFor(req), req.params.id, body);
  res.status(200).json(value);
});

foodsRouter.delete("/:id", async (req, res) => {
  await deleteOwnFood(await contextFor(req), req.params.id);
  res.status(204).send();
});

foodsRouter.post("/:id/portions", async (req, res) => {
  const body = parseBody(PortionBodySchema, req.body);
  const { value } = await addPortion(await contextFor(req), req.params.id, body);
  res.status(201).json(value);
});

foodsRouter.put("/:id/portions/:portionId", async (req, res) => {
  const body = parseBody(PortionBodySchema, req.body);
  const { value } = await updatePortion(await contextFor(req), req.params.id, req.params.portionId, body);
  res.status(200).json(value);
});

foodsRouter.delete("/:id/portions/:portionId", async (req, res) => {
  await removePortion(await contextFor(req), req.params.id, req.params.portionId);
  res.status(204).send();
});

foodsRouter.put("/:id/favourite", async (req, res) => {
  await setFavourite(await contextFor(req), req.params.id, true);
  res.status(204).send();
});

foodsRouter.delete("/:id/favourite", async (req, res) => {
  await setFavourite(await contextFor(req), req.params.id, false);
  res.status(204).send();
});
