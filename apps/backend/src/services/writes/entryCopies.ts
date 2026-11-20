import type { CopyEntriesBody, CopyEntriesResult, Figures } from "@hovimestari/types";
import { and, asc, eq, inArray } from "drizzle-orm";
import { entries, removedEntries } from "../../db/schema/index.js";
import { appError } from "../../lib/errors.js";
import { basisColumnsOf, entriesOf, selectEntries } from "../entryRows.js";
import { getDay } from "../reads/days.js";
import { readRecipeForEntry } from "../recipeValues.js";
import { lockUserForWrite } from "../sourceValues.js";
import type { WriteContext, WriteOutcome } from "./context.js";

type EntryInsert = typeof entries.$inferInsert;

/**
 * Copies the user's entries to `toDate`, each with the id the caller chose
 * for it, in the source entries' order. A copy arrives planned, with its
 * source's basis, amount and references as they are, so a hidden source
 * copies too. A copy of a cook's entry is a plain entry of its recipe, with
 * the recipe's serving now, also when the recipe was deleted since. Ids
 * already copied are skipped, also when a repeat of the same copy commits
 * them while this one runs, and a copy that inserted nothing answers
 * `replayed`. A source the user does not have: 404 `entry_not_found`. An id
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

    // A copy of a cook's entry plans its recipe again: next week's batch is a
    // new one. It takes the recipe's serving now, deleted or not, and no cook.
    // Read before any copy is inserted, in recipe id order, so the recipes and
    // their foods are locked ahead of the entries, as every write locks them.
    const cookRecipes = [...new Set(sources.flatMap((s) => (s.cookId ? [s.recipeId!] : [])))].sort();
    const planned = new Map<string, Figures>();
    for (const recipeId of cookRecipes) {
      planned.set(recipeId, await readRecipeForEntry(tx, ctx, recipeId, { includeDeleted: true }));
    }

    // One insert per copy, in order, so each takes the next position. An id
    // held by a transaction that committed meanwhile inserts nothing here.
    let count = 0;
    for (const pair of todo) {
      // Every column of the source but its id and position, which the copy takes anew.
      const source: EntryInsert = { ...byId.get(pair.sourceId)! };
      delete source.position;
      if (source.cookId) {
        Object.assign(source, { cookId: null, ...basisColumnsOf(planned.get(source.recipeId!)!) });
      }
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
    value: { entries: await entriesOf(ctx.db, ctx.userId, rows), days: [await getDay(ctx, toDate)], outcome },
    outcome,
  };
}
