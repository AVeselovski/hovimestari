import { RecentsQuerySchema } from "@hovimestari/types";
import { Router, type Router as IRouter } from "express";
import { parseQuery } from "../lib/parseBody.js";
import { contextFor } from "../lib/requestContext.js";
import { authenticate } from "../middleware/authenticate.js";
import { listRecents } from "../services/reads/log.js";

// Thin: parse, build the context, call one service, send.

export const logRouter: IRouter = Router();
logRouter.use(authenticate);

logRouter.get("/recents", async (req, res) => {
  const query = parseQuery(RecentsQuerySchema, req.query);
  res.status(200).json({ items: await listRecents(await contextFor(req), query) });
});
