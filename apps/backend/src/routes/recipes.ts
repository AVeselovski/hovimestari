import {
  RecipeBodySchema,
  RecipeEditBodySchema,
  RecipePreviewBodySchema,
  RecipeQuerySchema,
  RecipeReadQuerySchema,
} from "@hovimestari/types";
import { Router, type Router as IRouter } from "express";
import { parseBody, parseQuery } from "../lib/parseBody.js";
import { contextFor } from "../lib/requestContext.js";
import { statusOf } from "../lib/writeStatus.js";
import { authenticate } from "../middleware/authenticate.js";
import { getRecipe, listRecipes, previewRecipe } from "../services/reads/recipes.js";
import {
  createRecipe,
  deleteRecipe,
  setRecipeArchived,
  setRecipeFavourite,
  updateRecipe,
} from "../services/writes/recipes.js";

// Thin: parse, build the context, call one service, send. `/preview` is
// registered before `/:id`.

export const recipesRouter: IRouter = Router();
recipesRouter.use(authenticate);

recipesRouter.get("/", async (req, res) => {
  const query = parseQuery(RecipeQuerySchema, req.query);
  res.status(200).json({ recipes: await listRecipes(await contextFor(req), query) });
});

recipesRouter.post("/", async (req, res) => {
  const body = parseBody(RecipeBodySchema, req.body);
  const { value, outcome } = await createRecipe(await contextFor(req), body);
  res.status(statusOf(outcome)).json(value);
});

recipesRouter.post("/preview", async (req, res) => {
  const body = parseBody(RecipePreviewBodySchema, req.body);
  res.status(200).json(await previewRecipe(await contextFor(req), body));
});

recipesRouter.get("/:id", async (req, res) => {
  const query = parseQuery(RecipeReadQuerySchema, req.query);
  res.status(200).json(await getRecipe(await contextFor(req), req.params.id, query));
});

recipesRouter.put("/:id", async (req, res) => {
  const body = parseBody(RecipeEditBodySchema, req.body);
  const { value } = await updateRecipe(await contextFor(req), req.params.id, body);
  res.status(200).json(value);
});

for (const [path, set] of [
  ["archived", setRecipeArchived],
  ["favourite", setRecipeFavourite],
] as const) {
  recipesRouter.put(`/:id/${path}`, async (req, res) => {
    await set(await contextFor(req), req.params.id, true);
    res.status(204).send();
  });
  recipesRouter.delete(`/:id/${path}`, async (req, res) => {
    await set(await contextFor(req), req.params.id, false);
    res.status(204).send();
  });
}

recipesRouter.delete("/:id", async (req, res) => {
  await deleteRecipe(await contextFor(req), req.params.id);
  res.status(204).send();
});
