import type {
  AddEntryBody,
  CopyEntriesBody,
  CopyEntriesResult,
  Entry,
  EntryPatchBody,
  EntryRemoveManyResult,
  EntryRemoveResult,
  EntryStatus,
  EntryStatusResult,
  EntryWriteResult,
} from "@hovimestari/types";
import { and, asc, eq, inArray, lt, lte, ne, sql } from "drizzle-orm";
import { entries, removedEntries } from "../../db/schema/index.js";
import type { Db, Tx } from "../../db/types.js";
import { appError } from "../../lib/errors.js";
import { isUuid } from "../../lib/isUuid.js";
import { isForeignKeyViolation, isUniqueViolation, pgCodeOf } from "../../lib/pgErrors.js";
import { basisColumnsOf, entryOf, selectEntries } from "../entryRows.js";
import { getDay, getDays } from "../reads/days.js";
import { gramsOf, lockUserForWrite, readFoodForEntry, readMealForEntry, restoreCutoff } from "../sourceValues.js";
import type { WriteContext, WriteOutcome } from "./context.js";

// Every entry write runs in one transaction that first takes the user's row
// (lockUserForWrite), then answers the days it changed, read through getDay
// after the write. An entry's basis is written once, by addEntry from its
// source. Nothing else here writes it, except an estimate's own figures.
// Adds and copies take a client-chosen id, so a repeated request applies once.

type EntryInsert = typeof entries.$inferInsert;

/** The user's entry `id` as the API shows it, or null. */
async function readEntry(ctx: WriteContext, id: string): Promise<Entry | null> {
  const [row] = await selectEntries(ctx.db, ctx.userId, eq(entries.id, id));
  return row ? entryOf(row) : null;
}

/** 400 `entry_eaten_in_future` for an eaten entry dated after the user's today. */
function refuseEatenInFuture(ctx: WriteContext, date: string, status: EntryStatus | undefined): void {
  if (status === "eaten" && date > ctx.today) throw appError("entry_eaten_in_future", 400);
}

/** Whose removed entry `id` is, if it is one. */
async function removedOwnerOf(db: Db, id: string): Promise<string | undefined> {
  const [row] = await db
    .select({ userId: removedEntries.userId })
    .from(removedEntries)
    .where(eq(removedEntries.id, id));
  return row?.userId;
}

/**
 * A foreign-key failure on an entry insert as what it names, never a 500.
 * The user lock comes first, so the user's key failing is a second line of defence.
 */
function sourceRefused(err: unknown): never {
  if (isForeignKeyViolation(err, "entries_user_id_users_id_fk")) throw appError("user_not_found", 404);
  if (isForeignKeyViolation(err, "entries_food_id_foods_id_fk")) throw appError("food_not_found", 404);
  if (isForeignKeyViolation(err, "entries_saved_meal_user_fk")) throw appError("saved_meal_not_found", 404);
  throw err;
}

/** The row to insert for `body`, with its basis read from its source. */
async function valuesFor(tx: Tx, ctx: WriteContext, body: AddEntryBody): Promise<EntryInsert> {
  const common = {
    id: body.id,
    userId: ctx.userId,
    date: body.date,
    status: body.status,
    eatenAt: body.status === "eaten" ? ctx.now : null,
    kind: body.kind,
    createdAt: ctx.now,
    updatedAt: ctx.now,
  };
  switch (body.kind) {
    case "food": {
      const basis = await readFoodForEntry(tx, ctx, body.foodId);
      const amount = await gramsOf(tx, ctx, body.foodId, body.amount);
      return { ...common, foodId: body.foodId, ...amount, ...basisColumnsOf(basis) };
    }
    case "saved_meal": {
      const basis = await readMealForEntry(tx, ctx, body.savedMealId);
      return { ...common, savedMealId: body.savedMealId, mealCount: body.count, ...basisColumnsOf(basis) };
    }
    case "estimate":
      return { ...common, name: body.name, note: body.note, ...basisColumnsOf(body.figures) };
  }
}

/**
 * Adds an entry of any kind, planned or eaten. Its basis is taken from its
 * source now and never re-taken. A repeated id answers the first entry with
 * `replayed`. An id the user removed answers `replayed` with no entry and
 * adds nothing, so a late retry cannot bring back an entry they undid.
 * Another user's id answers 409 `entry_id_taken`.
 */
export async function addEntry(ctx: WriteContext, body: AddEntryBody): Promise<WriteOutcome<EntryWriteResult>> {
  const replayed = async (entry: Entry | null): Promise<WriteOutcome<EntryWriteResult>> => ({
    value: { entry, days: [await getDay(ctx, entry?.date ?? body.date)], outcome: "replayed" },
    outcome: "replayed",
  });
  const existing = await readEntry(ctx, body.id);
  if (existing) return replayed(existing);
  refuseEatenInFuture(ctx, body.date, body.status);

  const written = await ctx.db
    .transaction(async (tx) => {
      await lockUserForWrite(tx, ctx.userId);
      const removedBy = await removedOwnerOf(tx, body.id);
      if (removedBy !== undefined && removedBy !== ctx.userId) throw appError("entry_id_taken", 409);
      if (removedBy === ctx.userId) return "removed" as const;
      const values = await valuesFor(tx, ctx, body);
      const inserted = await tx
        .insert(entries)
        .values(values)
        .onConflictDoNothing({ target: entries.id })
        .returning({ id: entries.id });
      return inserted.length > 0 ? ("inserted" as const) : ("taken" as const);
    })
    .catch(sourceRefused);

  if (written === "removed") return replayed(null);
  const entry = await readEntry(ctx, body.id);
  if (!entry) throw appError("entry_id_taken", 409);
  if (written === "taken") return replayed(entry);
  return { value: { entry, days: [await getDay(ctx, entry.date)], outcome: "created" }, outcome: "created" };
}

/** A field of `patch` that does not fit an entry of `kind`. */
function mismatched(kind: Entry["kind"], patch: EntryPatchBody): boolean {
  if (patch.amount !== undefined && kind !== "food") return true;
  if (patch.count !== undefined && kind !== "saved_meal") return true;
  const estimateOnly = [patch.name, patch.figures, patch.note].some((v) => v !== undefined);
  return estimateOnly && kind !== "estimate";
}

/**
 * Changes, moves or re-marks the user's entry. The basis stays: an amount
 * edit takes grams as given, or a portion count times the portion's current
 * grams. A move of an eaten entry to a future date with no status named turns
 * it planned. Setting eaten on a future date answers 400. An amount or name
 * edit never checks the date.
 */
export async function updateEntry(
  ctx: WriteContext,
  id: string,
  patch: EntryPatchBody,
): Promise<WriteOutcome<EntryWriteResult>> {
  if (!isUuid(id)) throw appError("entry_not_found", 404);
  const dates = await ctx.db.transaction(async (tx) => {
    await lockUserForWrite(tx, ctx.userId);
    const mine = and(eq(entries.id, id), eq(entries.userId, ctx.userId));
    const [row] = await tx.select().from(entries).where(mine).for("no key update");
    if (!row) throw appError("entry_not_found", 404);
    if (mismatched(row.kind, patch)) throw appError("entry_kind_mismatch", 400);

    const date = patch.date ?? row.date;
    const movedToFuture = patch.date !== undefined && date > ctx.today;
    const status = patch.status ?? (movedToFuture && row.status === "eaten" ? "planned" : row.status);
    refuseEatenInFuture(ctx, date, patch.status);

    const set: Partial<EntryInsert> = {
      date,
      status,
      eatenAt: status === "planned" ? null : row.status === "eaten" ? row.eatenAt : ctx.now,
      updatedAt: ctx.now,
    };
    if (patch.amount !== undefined) Object.assign(set, await gramsOf(tx, ctx, row.foodId!, patch.amount));
    if (patch.count !== undefined) set.mealCount = patch.count;
    if (patch.name !== undefined) set.name = patch.name;
    if (patch.note !== undefined) set.note = patch.note;
    if (patch.figures !== undefined) Object.assign(set, basisColumnsOf(patch.figures));
    await tx.update(entries).set(set).where(mine);
    return [row.date, date];
  });
  const entry = await readEntry(ctx, id);
  if (!entry) throw appError("entry_not_found", 404);
  return { value: { entry, days: await getDays(ctx, dates), outcome: "changed" }, outcome: "changed" };
}

/**
 * Sets `status` on the listed entries that exist, are the user's, are not
 * already in it, and (for eaten) are not dated after today. The rest are
 * skipped, never an error. Answers the ids it changed, so an undo changes
 * exactly those back.
 */
export async function setEntriesStatus(
  ctx: WriteContext,
  ids: string[],
  status: EntryStatus,
): Promise<WriteOutcome<EntryStatusResult>> {
  const changed = await ctx.db.transaction(async (tx) => {
    await lockUserForWrite(tx, ctx.userId);
    const changing = and(
      eq(entries.userId, ctx.userId),
      inArray(entries.id, ids.filter(isUuid)),
      ne(entries.status, status),
      status === "eaten" ? lte(entries.date, ctx.today) : undefined,
    );
    // Locked in id order first, as a source edit's rewrite locks them, so the two never deadlock.
    const locked = await tx
      .select({ id: entries.id })
      .from(entries)
      .where(changing)
      .orderBy(asc(entries.id))
      .for("no key update");
    if (locked.length === 0) return [];
    return tx
      .update(entries)
      .set({ status, eatenAt: status === "eaten" ? ctx.now : null, updatedAt: ctx.now })
      .where(
        and(
          changing,
          inArray(
            entries.id,
            locked.map((r) => r.id),
          ),
        ),
      )
      .returning({ id: entries.id, date: entries.date, position: entries.position });
  });
  changed.sort((a, b) => a.date.localeCompare(b.date) || a.position - b.position || a.id.localeCompare(b.id));
  const value = {
    changedIds: changed.map((c) => c.id),
    days: await getDays(
      ctx,
      changed.map((c) => c.date),
    ),
  };
  return { value, outcome: changed.length > 0 ? "changed" : "unchanged" };
}

/**
 * Removes the user's entry. Its full row moves to `removed_entries` in the
 * same transaction, for ten minutes, so a restore brings it back exactly and
 * a late retry of its add adds nothing. Rows older than that are cleared here.
 */
export async function removeEntry(ctx: WriteContext, id: string): Promise<WriteOutcome<EntryRemoveResult>> {
  if (!isUuid(id)) throw appError("entry_not_found", 404);
  const date = await ctx.db.transaction(async (tx) => {
    await lockUserForWrite(tx, ctx.userId);
    await purgeExpired(tx, ctx);
    const moved = await tx.execute<{ date: string }>(sql`
      WITH gone AS (DELETE FROM ${entries} WHERE ${entries.id} = ${id} AND ${entries.userId} = ${ctx.userId} RETURNING *)
      INSERT INTO ${removedEntries} (id, user_id, row, removed_at)
      SELECT gone.id, gone.user_id, to_jsonb(gone), ${ctx.now} FROM gone
      RETURNING row->>'date' AS date`);
    const [row] = moved.rows;
    if (!row) throw appError("entry_not_found", 404);
    return row.date;
  });
  return { value: { days: [await getDay(ctx, date)] }, outcome: "deleted" };
}

/**
 * Removes the listed entries that are the user's and still there, whatever
 * happened to them since they were made. Each moves to `removed_entries`
 * exactly as `removeEntry` moves one, so each can be restored for ten
 * minutes. Missing and other users' ids are skipped, never an error. Answers
 * the ids it removed, in day and position order, and their days.
 */
export async function removeEntries(ctx: WriteContext, ids: string[]): Promise<WriteOutcome<EntryRemoveManyResult>> {
  const wanted = ids.filter(isUuid);
  const removed = await ctx.db.transaction(async (tx) => {
    await lockUserForWrite(tx, ctx.userId);
    await purgeExpired(tx, ctx);
    if (wanted.length === 0) return [];
    // Locked in id order first, as the status batch and a source edit's rewrite lock them, so they never deadlock.
    const locked = await tx
      .select({ id: entries.id })
      .from(entries)
      .where(and(eq(entries.userId, ctx.userId), inArray(entries.id, wanted)))
      .orderBy(asc(entries.id))
      .for("update");
    if (locked.length === 0) return [];
    const mine = and(
      eq(entries.userId, ctx.userId),
      inArray(
        entries.id,
        locked.map((r) => r.id),
      ),
    );
    const moved = await tx.execute<{ id: string; date: string; position: string }>(sql`
      WITH gone AS (DELETE FROM ${entries} WHERE ${mine} RETURNING *)
      INSERT INTO ${removedEntries} (id, user_id, row, removed_at)
      SELECT gone.id, gone.user_id, to_jsonb(gone), ${ctx.now} FROM gone
      RETURNING id, row->>'date' AS date, (row->>'position')::bigint AS position`);
    return moved.rows.map((r) => ({ id: r.id, date: r.date, position: Number(r.position) }));
  });
  removed.sort((a, b) => a.date.localeCompare(b.date) || a.position - b.position || a.id.localeCompare(b.id));
  const value = {
    removedIds: removed.map((r) => r.id),
    days: await getDays(
      ctx,
      removed.map((r) => r.date),
    ),
  };
  return { value, outcome: removed.length > 0 ? "deleted" : "unchanged" };
}

/** Deletes the user's removed entries too old to restore. */
async function purgeExpired(tx: Tx, ctx: WriteContext): Promise<void> {
  await tx
    .delete(removedEntries)
    .where(and(eq(removedEntries.userId, ctx.userId), lt(removedEntries.removedAt, restoreCutoff(ctx))));
}

/**
 * Codes of a stored row the entries table no longer takes: a missing value
 * where a column now requires one (23502), a value a check now refuses
 * (23514), a value of the wrong type (22P02). Possible only for a row removed
 * before a migration that changed `entries` without rewriting `removed_entries`.
 */
const ROW_NO_LONGER_FITS = new Set(["23502", "23514", "22P02"]);

/**
 * A restore that cannot put its row back: its food or meal was deleted
 * outright since, its id is in use, or the stored row no longer fits the table.
 */
function restoreRefused(err: unknown): never {
  const lost =
    isForeignKeyViolation(err, "entries_food_id_foods_id_fk") ||
    isForeignKeyViolation(err, "entries_saved_meal_user_fk") ||
    isUniqueViolation(err, "entries_pkey") ||
    ROW_NO_LONGER_FITS.has(pgCodeOf(err) ?? "");
  if (lost) throw appError("entry_not_found", 404);
  throw err;
}

/**
 * Puts a removed entry back exactly as it was: the same id, position, basis,
 * amount, references and status. It never re-reads a source, so it works on
 * a hidden one. An entry already back answers `replayed`. Unknown, another
 * user's, or removed more than ten minutes ago: 404 `entry_not_found`.
 */
export async function restoreEntry(ctx: WriteContext, id: string): Promise<WriteOutcome<EntryWriteResult>> {
  if (!isUuid(id)) throw appError("entry_not_found", 404);
  const cutoff = restoreCutoff(ctx);
  const restored = await ctx.db
    .transaction(async (tx) => {
      await lockUserForWrite(tx, ctx.userId);
      await purgeExpired(tx, ctx);
      const back = await tx.execute(sql`
        WITH back AS (
          DELETE FROM ${removedEntries}
           WHERE ${removedEntries.id} = ${id} AND ${removedEntries.userId} = ${ctx.userId}
             AND ${removedEntries.removedAt} >= ${cutoff}
          RETURNING row)
        INSERT INTO ${entries} SELECT (jsonb_populate_record(NULL::entries, back.row)).* FROM back
        RETURNING id`);
      return back.rows.length > 0;
    })
    .catch(restoreRefused);
  const entry = await readEntry(ctx, id);
  if (!entry) throw appError("entry_not_found", 404);
  const outcome = restored ? "created" : "replayed";
  return { value: { entry, days: [await getDay(ctx, entry.date)], outcome }, outcome };
}

/**
 * Copies the user's entries to `toDate`, each with the id the caller chose
 * for it, in the source entries' order. A copy arrives planned, with its
 * source's basis, amount and references as they are, so a hidden source
 * copies too. Ids already copied are skipped, also when a repeat of the
 * same copy commits them while this one runs, and a copy that inserted
 * nothing answers `replayed`. A source the user does not have: 404 `entry_not_found`. An id
 * another user holds: 409 `entry_id_taken`.
 */
export async function copyEntries(
  ctx: WriteContext,
  { toDate, entries: pairs }: CopyEntriesBody,
): Promise<WriteOutcome<CopyEntriesResult>> {
  const ids = pairs.map((p) => p.id);
  const inserted = await ctx.db.transaction(async (tx) => {
    await lockUserForWrite(tx, ctx.userId);
    const [held, removed] = await Promise.all([
      tx.select({ id: entries.id, userId: entries.userId }).from(entries).where(inArray(entries.id, ids)),
      tx
        .select({ id: removedEntries.id, userId: removedEntries.userId })
        .from(removedEntries)
        .where(inArray(removedEntries.id, ids)),
    ]);
    const taken = [...held, ...removed];
    if (taken.some((t) => t.userId !== ctx.userId)) throw appError("entry_id_taken", 409);
    const done = new Set(taken.map((t) => t.id));
    const todo = pairs.filter((p) => !done.has(p.id));
    if (todo.length === 0) return 0;

    const sources = await tx
      .select()
      .from(entries)
      .where(
        and(
          eq(entries.userId, ctx.userId),
          inArray(
            entries.id,
            todo.map((p) => p.sourceId),
          ),
        ),
      )
      .orderBy(asc(entries.date), asc(entries.position), asc(entries.id));
    const byId = new Map(sources.map((s) => [s.id, s]));
    if (todo.some((p) => !byId.has(p.sourceId))) throw appError("entry_not_found", 404);
    const order = new Map(sources.map((s, i) => [s.id, i]));
    todo.sort((a, b) => order.get(a.sourceId)! - order.get(b.sourceId)!);

    // One insert per copy, in order, so each takes the next position. An id
    // held by a transaction that committed meanwhile inserts nothing here.
    let count = 0;
    for (const pair of todo) {
      // Every column of the source but its id and position, which the copy takes anew.
      const source: EntryInsert = { ...byId.get(pair.sourceId)! };
      delete source.position;
      const copy = await tx
        .insert(entries)
        .values({
          ...source,
          id: pair.id,
          date: toDate,
          status: "planned",
          eatenAt: null,
          createdAt: ctx.now,
          updatedAt: ctx.now,
        })
        .onConflictDoNothing({ target: entries.id })
        .returning({ id: entries.id });
      count += copy.length;
    }
    if (count < todo.length) {
      // A repeat of this copy in flight took them, or another user did.
      const holders = await tx
        .select({ userId: entries.userId })
        .from(entries)
        .where(
          inArray(
            entries.id,
            todo.map((p) => p.id),
          ),
        );
      if (holders.some((h) => h.userId !== ctx.userId)) throw appError("entry_id_taken", 409);
    }
    return count;
  });
  const rows = await selectEntries(ctx.db, ctx.userId, inArray(entries.id, ids));
  const outcome = inserted > 0 ? "created" : "replayed";
  return {
    value: { entries: rows.map(entryOf), days: [await getDay(ctx, toDate)], outcome },
    outcome,
  };
}
