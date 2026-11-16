import {
  AddEntryBodySchema,
  CopyEntriesBodySchema,
  EntryPatchBodySchema,
  EntryStatusBodySchema,
} from "@hovimestari/types";
import { Router, type Router as IRouter } from "express";
import { parseBody } from "../lib/parseBody.js";
import { contextFor } from "../lib/requestContext.js";
import { statusOf } from "../lib/writeStatus.js";
import { authenticate } from "../middleware/authenticate.js";
import {
  addEntry,
  copyEntries,
  removeEntry,
  restoreEntry,
  setEntriesStatus,
  updateEntry,
} from "../services/writes/entries.js";

// Thin: parse, build the context, call one service, send. Every write
// answers the days it changed. The fixed paths are registered before `/:id`.

export const entriesRouter: IRouter = Router();
entriesRouter.use(authenticate);

entriesRouter.post("/", async (req, res) => {
  const body = parseBody(AddEntryBodySchema, req.body);
  const { value, outcome } = await addEntry(await contextFor(req), body);
  res.status(statusOf(outcome)).json(value);
});

entriesRouter.post("/status", async (req, res) => {
  const { entryIds, status } = parseBody(EntryStatusBodySchema, req.body);
  const { value } = await setEntriesStatus(await contextFor(req), entryIds, status);
  res.status(200).json(value);
});

entriesRouter.post("/copy", async (req, res) => {
  const body = parseBody(CopyEntriesBodySchema, req.body);
  const { value, outcome } = await copyEntries(await contextFor(req), body);
  res.status(statusOf(outcome)).json(value);
});

entriesRouter.patch("/:id", async (req, res) => {
  const patch = parseBody(EntryPatchBodySchema, req.body);
  const { value } = await updateEntry(await contextFor(req), req.params.id, patch);
  res.status(200).json(value);
});

entriesRouter.delete("/:id", async (req, res) => {
  const { value } = await removeEntry(await contextFor(req), req.params.id);
  res.status(200).json(value);
});

entriesRouter.post("/:id/restore", async (req, res) => {
  const { value, outcome } = await restoreEntry(await contextFor(req), req.params.id);
  res.status(statusOf(outcome)).json(value);
});
