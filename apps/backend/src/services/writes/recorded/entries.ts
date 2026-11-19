import {
  AddEntryBodySchema,
  CopyEntriesBodySchema,
  EntryPatchBodySchema,
  EntryRemoveManyBodySchema,
  EntryStatusBodySchema,
  type AssistantChangeSummary,
  type AssistantEntryLine,
  type AssistantFieldChange,
  type Day,
  type Entry,
  type EntryPatchBody,
  type EntryStatus,
  type FoodAmount,
  type TypedFigures,
} from "@hovimestari/types";
import { and, asc, eq, inArray } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { entries } from "../../../db/schema/index.js";
import type { Tx } from "../../../db/types.js";
import { entryOf, selectEntries } from "../../entryRows.js";
import type { ReadContext } from "../../reads/context.js";
import { getDays, getEntry } from "../../reads/days.js";
import { recordedWrite, type AssistantActor, type ChangeRecord, type Replay } from "../changeRecord.js";
import type { WriteContext } from "../context.js";
import { addEntry, copyEntries, removeEntries, restoreEntry, setEntriesStatus, updateEntry } from "../entries.js";

// ---------------------------------------------------------------------------
// The entry writes an assistant makes (design d.4), one function per tool.
// Each calls exactly one of the screen's entry services through
// `recordedWrite`, so an assistant's write is the screen's write, plus its
// record row in the same transaction. Here live the parts the record needs:
// the before-read under a lock, the summary, the ids, and the replay reader,
// which calls read services only. Nothing here writes a row of its own
// (screenPath.test.ts pins it).
//
// The server makes each new entry's id with randomUUID: the request key does
// for an assistant what a client-chosen id does for the web app.
// ---------------------------------------------------------------------------

export interface LogFoodArgs {
  foodId: string;
  amount: FoodAmount;
  date: string;
  status: EntryStatus;
}
export interface LogSavedMealArgs {
  savedMealId: string;
  count: number;
  date: string;
  status: EntryStatus;
}
export interface LogEstimateArgs {
  name: string;
  figures: TypedFigures;
  note?: string | null;
  date: string;
  status: EntryStatus;
}

/** An entry as a line of the record: the values the answer had. */
export function lineOf(entry: Entry): AssistantEntryLine {
  return {
    name: entry.name,
    date: entry.date,
    status: entry.status,
    kind: entry.kind,
    amount: amountOf(entry),
    figures: entry.figures,
  };
}

/** A food's grams or portion count, a saved meal's count. An estimate has no amount. */
function amountOf(entry: Entry): AssistantEntryLine["amount"] {
  if (entry.kind === "saved_meal") return entry.count === null ? null : { count: entry.count };
  if (entry.kind !== "food" || entry.grams === null) return null;
  if (!entry.portion) return { grams: entry.grams };
  const portionLabel = entry.portion.name ?? entry.portion.unit ?? "";
  return { portionLabel, count: entry.portion.count, grams: entry.grams };
}

/** What an edit changed, field by field, from the entry before to the entry after. Empty when nothing did. */
function changesOf(before: Entry, after: Entry): AssistantFieldChange[] {
  const changes: AssistantFieldChange[] = [];
  const compare = (field: AssistantFieldChange["field"], from: unknown, to: unknown) => {
    if (JSON.stringify(from) !== JSON.stringify(to)) changes.push({ field, from, to });
  };
  compare("date", before.date, after.date);
  compare("status", before.status, after.status);
  compare("amount", amountOf(before), amountOf(after));
  compare("name", before.name, after.name);
  compare("figures", before.figures, after.figures);
  compare("note", before.note, after.note);
  return changes;
}

/**
 * The user's entries among `ids`, locked FOR NO KEY UPDATE in id order, as
 * the batch services lock them, so the before-read and the write see one row.
 */
async function lockedEntries(tx: Tx, ctx: WriteContext, ids: string[]): Promise<Map<string, Entry>> {
  const locked = await tx
    .select({ id: entries.id })
    .from(entries)
    .where(and(eq(entries.userId, ctx.userId), inArray(entries.id, ids)))
    .orderBy(asc(entries.id))
    .for("no key update");
  if (locked.length === 0) return new Map();
  const rows = await selectEntries(
    tx,
    ctx.userId,
    inArray(
      entries.id,
      locked.map((r) => r.id),
    ),
  );
  return new Map(rows.map((row) => [row.entry.id, entryOf(row)]));
}

const none = async () => null;

/** The days of `ids` in `days`, as lines, in the order of `ids`. */
function linesIn(days: Day[], ids: string[]): AssistantEntryLine[] {
  const byId = new Map(days.flatMap((day) => day.entries).map((entry) => [entry.id, entry]));
  return ids.flatMap((id) => {
    const entry = byId.get(id);
    return entry ? [lineOf(entry)] : [];
  });
}

/** The record of an added entry, or null when the add wrote nothing. */
function addedRecord(result: { outcome: string; value: { entry: Entry | null } }): ChangeRecord | null {
  const { entry } = result.value;
  if (result.outcome !== "created" || !entry) return null;
  return {
    action: "entry.added",
    entityIds: [entry.id],
    summary: { entity: "entry", entry: lineOf(entry), changes: [] },
  };
}

export async function recordedLogFood(ctx: WriteContext, via: AssistantActor, args: LogFoodArgs) {
  const body = AddEntryBodySchema.parse({ kind: "food", id: randomUUID(), ...args });
  return recordedWrite(ctx, via, {
    userLock: "key share",
    before: none,
    run: (tx) => addEntry(tx, body),
    record: (_before, result) => addedRecord(result),
  });
}

export async function recordedLogSavedMeal(ctx: WriteContext, via: AssistantActor, args: LogSavedMealArgs) {
  const body = AddEntryBodySchema.parse({ kind: "saved_meal", id: randomUUID(), ...args });
  return recordedWrite(ctx, via, {
    userLock: "key share",
    before: none,
    run: (tx) => addEntry(tx, body),
    record: (_before, result) => addedRecord(result),
  });
}

export async function recordedLogEstimate(ctx: WriteContext, via: AssistantActor, args: LogEstimateArgs) {
  const body = AddEntryBodySchema.parse({ kind: "estimate", id: randomUUID(), ...args });
  return recordedWrite(ctx, via, {
    userLock: "key share",
    before: none,
    run: (tx) => addEntry(tx, body),
    record: (_before, result) => addedRecord(result),
  });
}

export async function recordedUpdateEntry(
  ctx: WriteContext,
  via: AssistantActor,
  entryId: string,
  patch: EntryPatchBody,
) {
  const body = EntryPatchBodySchema.parse(patch);
  return recordedWrite(ctx, via, {
    userLock: "key share",
    before: async (tx, c) => (await lockedEntries(tx, c, [entryId])).get(entryId) ?? null,
    run: (tx) => updateEntry(tx, entryId, body),
    record: (before, result): ChangeRecord | null => {
      const after = result.value.entry;
      if (!before || !after) return null;
      const changes = changesOf(before, after);
      if (changes.length === 0) return null;
      return {
        action: "entry.changed",
        entityIds: [after.id],
        summary: { entity: "entry", entry: lineOf(after), changes },
      };
    },
  });
}

export async function recordedSetEntriesStatus(
  ctx: WriteContext,
  via: AssistantActor,
  args: { entryIds: string[]; status: EntryStatus },
) {
  const { entryIds, status } = EntryStatusBodySchema.parse(args);
  return recordedWrite(ctx, via, {
    userLock: "key share",
    before: none,
    run: (tx) => setEntriesStatus(tx, entryIds, status),
    record: (_before, { value }): ChangeRecord | null => {
      if (value.changedIds.length === 0) return null;
      const lines = linesIn(value.days, value.changedIds);
      return {
        action: "entries.marked",
        entityIds: value.changedIds,
        summary: { entity: "entries", entries: lines, toDate: null },
      };
    },
  });
}

export async function recordedCopyEntries(
  ctx: WriteContext,
  via: AssistantActor,
  args: { entryIds: string[]; toDate: string },
) {
  const body = CopyEntriesBodySchema.parse({
    toDate: args.toDate,
    entries: args.entryIds.map((sourceId) => ({ sourceId, id: randomUUID() })),
  });
  return recordedWrite(ctx, via, {
    userLock: "key share",
    before: none,
    run: (tx) => copyEntries(tx, body),
    record: (_before, result): ChangeRecord | null => {
      // A copy that inserted nothing answers `replayed` from its own ids: nothing to record.
      if (result.outcome !== "created") return null;
      const copies = result.value.entries;
      return {
        action: "entries.copied",
        entityIds: copies.map((copy) => copy.id),
        summary: { entity: "entries", entries: copies.map(lineOf), toDate: body.toDate },
      };
    },
  });
}

export async function recordedRemoveEntries(ctx: WriteContext, via: AssistantActor, args: { entryIds: string[] }) {
  const { entryIds } = EntryRemoveManyBodySchema.parse(args);
  return recordedWrite(ctx, via, {
    userLock: "key share",
    // The rows go with the write, so the record's lines are read before it.
    before: (tx, c) => lockedEntries(tx, c, entryIds),
    run: (tx) => removeEntries(tx, entryIds),
    record: (before, { value }): ChangeRecord | null => {
      if (value.removedIds.length === 0) return null;
      const lines = value.removedIds.flatMap((id) => {
        const entry = before.get(id);
        return entry ? [lineOf(entry)] : [];
      });
      return {
        action: "entries.removed",
        entityIds: value.removedIds,
        summary: { entity: "entries", entries: lines, toDate: null },
      };
    },
  });
}

export async function recordedRestoreEntry(ctx: WriteContext, via: AssistantActor, entryId: string) {
  return recordedWrite(ctx, via, {
    userLock: "key share",
    before: none,
    run: (tx) => restoreEntry(tx, entryId),
    record: (_before, result): ChangeRecord | null => {
      // An entry already back answers `replayed` from the service: nothing changed.
      const { entry } = result.value;
      if (result.outcome !== "created" || !entry) return null;
      return {
        action: "entry.restored",
        entityIds: [entry.id],
        summary: { entity: "entry", entry: lineOf(entry), changes: [] },
      };
    },
  });
}

// ---------------------------------------------------------------------------
// Replays: what a retry with the same request key answers, read now by the
// record's ids through read services. A row gone since reads as null or is
// left out, never refused.
// ---------------------------------------------------------------------------

type EntrySummary = Extract<AssistantChangeSummary, { entity: "entry" }>;
type EntriesSummary = Extract<AssistantChangeSummary, { entity: "entries" }>;

function entrySummaryOf(replay: Replay): EntrySummary {
  if (replay.summary.entity !== "entry") throw new Error(`A ${replay.action} record without an entry summary.`);
  return replay.summary;
}

function entriesSummaryOf(replay: Replay): EntriesSummary {
  if (replay.summary.entity !== "entries") throw new Error(`A ${replay.action} record without an entries summary.`);
  return replay.summary;
}

/** A logged or restored entry now, null when it is gone, and its day: the day it is on now, or the recorded one. */
export async function replayEntry(ctx: ReadContext, replay: Replay): Promise<{ entry: Entry | null; days: Day[] }> {
  const recorded = entrySummaryOf(replay);
  const entry = await getEntry(ctx, replay.entityIds[0]);
  return { entry, days: await getDays(ctx, [entry?.date ?? recorded.entry.date]) };
}

/** A changed entry now, and the days the change recorded: both of a move. */
export async function replayEntryChange(
  ctx: ReadContext,
  replay: Replay,
): Promise<{ entry: Entry | null; days: Day[] }> {
  const recorded = entrySummaryOf(replay);
  const moved = recorded.changes.find((change) => change.field === "date");
  const dates = [recorded.entry.date, ...(moved ? [String(moved.from)] : [])];
  return { entry: await getEntry(ctx, replay.entityIds[0]), days: await getDays(ctx, dates) };
}

/** The ids a batch changed, as recorded, and their recorded days now. */
export async function replayEntryBatch(ctx: ReadContext, replay: Replay): Promise<{ ids: string[]; days: Day[] }> {
  const recorded = entriesSummaryOf(replay);
  return {
    ids: replay.entityIds,
    days: await getDays(
      ctx,
      recorded.entries.map((line) => line.date),
    ),
  };
}

/** Each copy that is still there, in the record's order, and the day copied to. */
export async function replayCopies(ctx: ReadContext, replay: Replay): Promise<{ entries: Entry[]; days: Day[] }> {
  const recorded = entriesSummaryOf(replay);
  const copies = await Promise.all(replay.entityIds.map((id) => getEntry(ctx, id)));
  const toDate = recorded.toDate ?? recorded.entries[0]?.date;
  return {
    entries: copies.filter((copy): copy is Entry => copy !== null),
    days: await getDays(ctx, toDate ? [toDate] : []),
  };
}
