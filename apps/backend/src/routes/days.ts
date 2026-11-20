import { DayParamSchema, DayRangeQuerySchema } from "@hovimestari/types";
import { Router, type Router as IRouter } from "express";
import { parseBody, parseQuery } from "../lib/parseBody.js";
import { contextFor } from "../lib/requestContext.js";
import { authenticate } from "../middleware/authenticate.js";
import { getDay, getDayRange } from "../services/reads/days.js";

// Thin: parse, build the context, call one service, send. The MCP tools call
// the same services.

export const daysRouter: IRouter = Router();
daysRouter.use(authenticate);

// GET /days?from=&to=. Every day of the range, without entries, and their average day.
daysRouter.get("/", async (req, res) => {
  const range = parseQuery(DayRangeQuerySchema, req.query);
  res.status(200).json(await getDayRange(await contextFor(req), range));
});

// GET /days/:date. A date, or `today` for the user's today.
daysRouter.get("/:date", async (req, res) => {
  const param = parseBody(DayParamSchema, req.params.date);
  const ctx = await contextFor(req);
  res.status(200).json(await getDay(ctx, param === "today" ? ctx.today : param));
});
