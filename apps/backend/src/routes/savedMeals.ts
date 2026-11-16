import {
  SaveAndLogBodySchema,
  SavedMealBodySchema,
  SavedMealEditBodySchema,
  SavedMealsQuerySchema,
} from "@hovimestari/types";
import { Router, type Router as IRouter } from "express";
import { parseBody, parseQuery } from "../lib/parseBody.js";
import { contextFor } from "../lib/requestContext.js";
import { statusOf } from "../lib/writeStatus.js";
import { authenticate } from "../middleware/authenticate.js";
import { getSavedMeal, listSavedMeals } from "../services/reads/savedMeals.js";
import {
  createSavedMeal,
  deleteSavedMeal,
  saveAndLog,
  setSavedMealArchived,
  updateSavedMeal,
} from "../services/writes/savedMeals.js";

// Thin: parse, build the context, call one service, send. `/log` is
// registered before `/:id`.

export const savedMealsRouter: IRouter = Router();
savedMealsRouter.use(authenticate);

savedMealsRouter.get("/", async (req, res) => {
  const query = parseQuery(SavedMealsQuerySchema, req.query);
  res.status(200).json({ meals: await listSavedMeals(await contextFor(req), query) });
});

savedMealsRouter.post("/", async (req, res) => {
  const body = parseBody(SavedMealBodySchema, req.body);
  const { value, outcome } = await createSavedMeal(await contextFor(req), body);
  res.status(statusOf(outcome)).json(value);
});

savedMealsRouter.post("/log", async (req, res) => {
  const body = parseBody(SaveAndLogBodySchema, req.body);
  const { value, outcome } = await saveAndLog(await contextFor(req), body);
  res.status(statusOf(outcome)).json(value);
});

savedMealsRouter.get("/:id", async (req, res) => {
  res.status(200).json(await getSavedMeal(await contextFor(req), req.params.id));
});

savedMealsRouter.put("/:id", async (req, res) => {
  const body = parseBody(SavedMealEditBodySchema, req.body);
  const { value } = await updateSavedMeal(await contextFor(req), req.params.id, body);
  res.status(200).json(value);
});

savedMealsRouter.put("/:id/archived", async (req, res) => {
  await setSavedMealArchived(await contextFor(req), req.params.id, true);
  res.status(204).send();
});

savedMealsRouter.delete("/:id/archived", async (req, res) => {
  await setSavedMealArchived(await contextFor(req), req.params.id, false);
  res.status(204).send();
});

savedMealsRouter.delete("/:id", async (req, res) => {
  await deleteSavedMeal(await contextFor(req), req.params.id);
  res.status(204).send();
});
