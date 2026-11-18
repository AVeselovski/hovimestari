import { IsoDateSchema, SetTargetsBodySchema, TargetsQuerySchema } from "@hovimestari/types";
import { Router, type Router as IRouter } from "express";
import { parseBody, parseQuery } from "../lib/parseBody.js";
import { contextFor } from "../lib/requestContext.js";
import { authenticate } from "../middleware/authenticate.js";
import { targetsOverview } from "../services/reads/targets.js";
import { removeTargetChange, setTargets } from "../services/writes/targets.js";

// Thin: parse, build the context, call one service, send. The MCP tools call
// the same services.

export const targetsRouter: IRouter = Router();
targetsRouter.use(authenticate);

// GET /targets?date=YYYY-MM-DD. Without a date, the user's today.
targetsRouter.get("/", async (req, res) => {
  const { date } = parseQuery(TargetsQuerySchema, req.query);
  const ctx = await contextFor(req);
  res.status(200).json(await targetsOverview(ctx, date));
});

// PUT /targets/:effectiveFrom. Creates the change, or overwrites the one on that date.
targetsRouter.put("/:effectiveFrom", async (req, res) => {
  const effectiveFrom = parseBody(IsoDateSchema, req.params.effectiveFrom);
  const { ranges } = parseBody(SetTargetsBodySchema, req.body);
  const ctx = await contextFor(req);
  const { value } = await setTargets(ctx, effectiveFrom, ranges);
  res.status(200).json(value);
});

// DELETE /targets/:effectiveFrom. Any change, the only one included. Marks the first run passed.
targetsRouter.delete("/:effectiveFrom", async (req, res) => {
  const effectiveFrom = parseBody(IsoDateSchema, req.params.effectiveFrom);
  const ctx = await contextFor(req);
  await removeTargetChange(ctx, effectiveFrom);
  res.status(204).send();
});
