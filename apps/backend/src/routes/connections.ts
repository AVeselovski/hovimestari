import { AssistantChangePageQuerySchema, CreateConnectionBodySchema } from "@hovimestari/types";
import { Router, type Router as IRouter } from "express";
import { parseBody, parseQuery } from "../lib/parseBody.js";
import { contextFor } from "../lib/requestContext.js";
import { authenticate } from "../middleware/authenticate.js";
import { listChanges } from "../services/reads/changeRecord.js";
import { listConnections } from "../services/reads/connections.js";
import { createConnection, revokeConnection } from "../services/writes/connections.js";

// The user's connection keys. JWT only: `authenticate` verifies access tokens
// and nothing else, so a connection key presented here answers 401 and can
// never make, list or revoke keys, nor read the record of changes. Thin:
// parse, build the context, call one service, send.

export const connectionsRouter: IRouter = Router();
connectionsRouter.use(authenticate);

connectionsRouter.get("/", async (req, res) => {
  res.status(200).json(await listConnections(await contextFor(req)));
});

// The one answer that holds the key. `no-store`, so no browser or proxy keeps it.
connectionsRouter.post("/", async (req, res) => {
  const body = parseBody(CreateConnectionBodySchema, req.body);
  const { value } = await createConnection(await contextFor(req), body, req.user!.sessionFamily);
  res.status(201).set("Cache-Control", "no-store").json(value);
});

connectionsRouter.delete("/:id", async (req, res) => {
  await revokeConnection(await contextFor(req), req.params.id);
  res.status(204).send();
});

// One connection's record of changes, a page at a time, newest first. Its
// owner reads it, revoked or not. Another person's connection answers 404.
connectionsRouter.get("/:id/changes", async (req, res) => {
  const page = parseQuery(AssistantChangePageQuerySchema, req.query);
  res.status(200).json(await listChanges(await contextFor(req), req.params.id, page));
});
