import { CookAsRecipeBodySchema, CookBodySchema } from "@hovimestari/types";
import { Router, type Router as IRouter } from "express";
import { parseBody } from "../lib/parseBody.js";
import { contextFor } from "../lib/requestContext.js";
import { statusOf } from "../lib/writeStatus.js";
import { authenticate } from "../middleware/authenticate.js";
import { getCook } from "../services/reads/cooks.js";
import { createCook, saveCookAsRecipe } from "../services/writes/cooks.js";

// Thin: parse, build the context, call one service, send.

export const cooksRouter: IRouter = Router();
cooksRouter.use(authenticate);

cooksRouter.post("/", async (req, res) => {
  const body = parseBody(CookBodySchema, req.body);
  const { value, outcome } = await createCook(await contextFor(req), body);
  res.status(statusOf(outcome)).json(value);
});

cooksRouter.get("/:id", async (req, res) => {
  res.status(200).json(await getCook(await contextFor(req), req.params.id));
});

cooksRouter.post("/:id/recipe", async (req, res) => {
  const body = parseBody(CookAsRecipeBodySchema, req.body);
  const { value, outcome } = await saveCookAsRecipe(await contextFor(req), req.params.id, body);
  res.status(statusOf(outcome)).json(value);
});
