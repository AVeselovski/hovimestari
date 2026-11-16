import { and, eq, inArray, isNotNull, isNull, sql, TransactionRollbackError } from "drizzle-orm";
import { foodPortions, foods } from "../../db/schema/index.js";
import type { Db } from "../../db/types.js";
import { ARCHIVED_PREFIX, type FineliFood, type Release } from "./readRelease.js";

// Writes a read release into the catalogue, in one transaction. A Fineli
// food's UUID never changes: a known FOODID is updated in place, a new one
// inserted, and one absent from the release retired, never deleted. A user's
// own portions are never touched.

/** The largest share of live Fineli foods one import may retire without `allowRetire`. */
export const RETIRE_GUARD_SHARE = 0.1;
/**
 * The largest share of live Fineli foods one import may rename without
 * `allowRename`. A file read in the wrong encoding renames every name with an
 * accented letter, 31 % of release 18, while an editorial release renames a
 * few foods.
 */
export const RENAME_GUARD_SHARE = 0.05;
/** Renames up to this many never trip the rename guard, so a small catalogue is judged by count, not share. */
export const RENAME_GUARD_MIN = 10;
/** Rows per INSERT or UPDATE statement. */
const BATCH = 500;

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export interface ImportOptions {
  /** Retire any number of foods. Without it, retiring more than RETIRE_GUARD_SHARE stops the import. */
  allowRetire: boolean;
  /** Rename any number of foods. Without it, renaming more than RENAME_GUARD_SHARE stops the import. */
  allowRename: boolean;
  /** Run everything, then roll back. */
  dryRun: boolean;
  now: Date;
}

export interface ImportResult {
  dryRun: boolean;
  /** What happened to each food the release gives usable values for. Exactly one count per food. */
  foods: {
    inserted: number;
    updated: number;
    unchanged: number;
    /** Retired before, live again in this release. */
    revived: number;
    /** Live before, named "(arc)" in this release. Inserted "(arc)" foods count as inserted. */
    archived: number;
  };
  /** Live catalogue foods this import retired. */
  retired: {
    /** Absent from the release. */
    absent: number;
    /** Still in the release, but left out of it, such as for a missing value. */
    leftOut: { fineliId: number; name: string; reason: string }[];
  };
  portions: { inserted: number; updated: number; unchanged: number; removed: number };
  /** Every food whose Finnish name changed under the same Fineli id. */
  renamed: { fineliId: number; from: string; to: string }[];
}

/** The import would retire more than RETIRE_GUARD_SHARE of the live Fineli foods. Nothing was written. */
export class RetireGuardError extends Error {
  override name = "RetireGuardError";
  constructor(
    readonly wouldRetire: number,
    readonly live: number,
  ) {
    super(
      `This release would retire ${wouldRetire} of the ${live} Fineli foods in the catalogue, more than ${RETIRE_GUARD_SHARE * 100} %. ` +
        "Nothing was written. Check that the folder holds the whole release. To retire them anyway, run again with --allow-retire.",
    );
  }
}

/** The import would rename more than RENAME_GUARD_SHARE of the live Fineli foods. Nothing was written. */
export class RenameGuardError extends Error {
  override name = "RenameGuardError";
  constructor(
    readonly renamed: ImportResult["renamed"],
    readonly live: number,
  ) {
    super(
      `This release would rename ${renamed.length} of the ${live} Fineli foods in the catalogue, more than ${RENAME_GUARD_SHARE * 100} % (and more than ${RENAME_GUARD_MIN}). ` +
        `For example: ${renamed
          .slice(0, 3)
          .map((r) => `${r.fineliId} "${r.from}" to "${r.to}"`)
          .join(", ")}. ` +
        "Nothing was written. Check that the names read correctly, such as å, ä and ö. " +
        "To rename them anyway, run again with --allow-rename.",
    );
  }
}

type Existing = Pick<
  typeof foods.$inferSelect,
  | "id"
  | "fineliId"
  | "name"
  | "nameEn"
  | "energyKcal"
  | "proteinG"
  | "carbsG"
  | "fatG"
  | "fineliType"
  | "fineliProcess"
  | "retiredAt"
>;

/** A name without Fineli's "(arc)" mark, so adding or dropping the mark is not a rename. */
const withoutArchivedPrefix = (name: string) =>
  name.startsWith(ARCHIVED_PREFIX) ? name.slice(ARCHIVED_PREFIX.length).trimStart() : name;

/** Whether the release changes anything the catalogue stores about a food, besides its retirement. */
const differs = (e: Existing, f: FineliFood) =>
  e.name !== f.name ||
  e.nameEn !== f.nameEn ||
  e.energyKcal !== f.energyKcal ||
  e.proteinG !== f.proteinG ||
  e.carbsG !== f.carbsG ||
  e.fatG !== f.fatG ||
  e.fineliType !== f.fineliType ||
  e.fineliProcess !== f.fineliProcess;

function chunks<T>(items: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += BATCH) out.push(items.slice(i, i + BATCH));
  return out;
}

/** Applies `release` to the catalogue. Throws RetireGuardError or RenameGuardError before writing anything when a guard trips. */
export async function applyRelease(db: Db, release: Release, options: ImportOptions): Promise<ImportResult> {
  const { now } = options;
  const result: ImportResult = {
    dryRun: options.dryRun,
    foods: { inserted: 0, updated: 0, unchanged: 0, revived: 0, archived: 0 },
    retired: { absent: 0, leftOut: [] },
    portions: { inserted: 0, updated: 0, unchanged: 0, removed: 0 },
    renamed: [],
  };

  try {
    await db.transaction(async (tx) => {
      // One import at a time.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('fineli_import'))`);
      const existing: Existing[] = await tx
        .select({
          id: foods.id,
          fineliId: foods.fineliId,
          name: foods.name,
          nameEn: foods.nameEn,
          energyKcal: foods.energyKcal,
          proteinG: foods.proteinG,
          carbsG: foods.carbsG,
          fatG: foods.fatG,
          fineliType: foods.fineliType,
          fineliProcess: foods.fineliProcess,
          retiredAt: foods.retiredAt,
        })
        .from(foods)
        .where(eq(foods.source, "fineli"));
      const byFineliId = new Map(existing.map((e) => [e.fineliId as number, e]));
      const inRelease = new Set(release.foods.map((f) => f.fineliId));

      // The guard comes first, so a tripped guard has written nothing.
      const live = existing.filter((e) => e.retiredAt === null);
      const absent = live.filter((e) => !inRelease.has(e.fineliId as number));
      if (absent.length > live.length * RETIRE_GUARD_SHARE && !options.allowRetire) {
        throw new RetireGuardError(absent.length, live.length);
      }
      // Every rename is reported. Only renames of live foods count toward the
      // guard, whose limit is a share of the live foods.
      const liveRenamed: ImportResult["renamed"] = [];
      for (const f of release.foods) {
        const e = byFineliId.get(f.fineliId);
        if (!e || withoutArchivedPrefix(e.name) === withoutArchivedPrefix(f.name)) continue;
        const rename = { fineliId: f.fineliId, from: e.name, to: f.name };
        result.renamed.push(rename);
        if (e.retiredAt === null) liveRenamed.push(rename);
      }
      const renameLimit = Math.max(RENAME_GUARD_MIN, live.length * RENAME_GUARD_SHARE);
      if (liveRenamed.length > renameLimit && !options.allowRename) {
        throw new RenameGuardError(liveRenamed, live.length);
      }

      // Foods: insert the new, update the changed, leave the rest.
      const toWrite: (typeof foods.$inferInsert)[] = [];
      for (const f of release.foods) {
        const e = byFineliId.get(f.fineliId);
        const retiredAt = f.archived ? (e?.retiredAt ?? now) : null;
        if (!e) {
          result.foods.inserted++;
        } else {
          const wasRetired = e.retiredAt !== null;
          if (wasRetired && !f.archived) result.foods.revived++;
          else if (!wasRetired && f.archived) result.foods.archived++;
          else if (differs(e, f)) result.foods.updated++;
          else {
            result.foods.unchanged++;
            continue;
          }
        }
        toWrite.push({
          source: "fineli",
          fineliId: f.fineliId,
          name: f.name,
          nameEn: f.nameEn,
          energyKcal: f.energyKcal,
          proteinG: f.proteinG,
          carbsG: f.carbsG,
          fatG: f.fatG,
          fineliType: f.fineliType,
          fineliProcess: f.fineliProcess,
          retiredAt,
          updatedAt: now,
        });
      }
      const idOf = new Map(existing.map((e) => [e.fineliId as number, e.id]));
      for (const batch of chunks(toWrite)) {
        const written = await tx
          .insert(foods)
          .values(batch)
          .onConflictDoUpdate({
            target: foods.fineliId,
            set: {
              name: sql`excluded.name`,
              nameEn: sql`excluded.name_en`,
              energyKcal: sql`excluded.energy_kcal`,
              proteinG: sql`excluded.protein_g`,
              carbsG: sql`excluded.carbs_g`,
              fatG: sql`excluded.fat_g`,
              fineliType: sql`excluded.fineli_type`,
              fineliProcess: sql`excluded.fineli_process`,
              retiredAt: sql`excluded.retired_at`,
              updatedAt: sql`excluded.updated_at`,
            },
          })
          .returning({ id: foods.id, fineliId: foods.fineliId });
        for (const w of written) idOf.set(w.fineliId as number, w.id);
      }

      // Retire the live foods the release no longer has, telling apart the
      // foods it still lists but gives no usable values for.
      const skipped = new Map(release.skipped.map((x) => [x.fineliId, x.reason]));
      for (const e of absent) {
        const reason = skipped.get(e.fineliId as number);
        if (reason === undefined) result.retired.absent++;
        else result.retired.leftOut.push({ fineliId: e.fineliId as number, name: e.name, reason });
      }
      for (const batch of chunks(absent.map((e) => e.id))) {
        await tx.update(foods).set({ retiredAt: now, updatedAt: now }).where(inArray(foods.id, batch));
      }

      await applyPortions(tx, release, idOf, now, result);
      if (options.dryRun) tx.rollback();
    });
  } catch (err) {
    if (!(err instanceof TransactionRollbackError)) throw err;
  }
  return result;
}

/** Upserts the release's portions on (food, unit) and removes the units a released food no longer has. */
async function applyPortions(
  tx: Tx,
  release: Release,
  idOf: Map<number, string>,
  now: Date,
  result: ImportResult,
): Promise<void> {
  const current = await tx
    .select({
      id: foodPortions.id,
      foodId: foodPortions.foodId,
      unit: foodPortions.fineliUnit,
      grams: foodPortions.grams,
    })
    .from(foodPortions)
    .innerJoin(foods, eq(foods.id, foodPortions.foodId))
    .where(and(eq(foods.source, "fineli"), isNull(foodPortions.userId), isNotNull(foodPortions.fineliUnit)));
  const key = (foodId: string, unit: string) => `${foodId}|${unit}`;
  const byKey = new Map(current.map((p) => [key(p.foodId, p.unit as string), p]));

  const toWrite: (typeof foodPortions.$inferInsert)[] = [];
  const kept = new Set<string>();
  const released = new Set<string>();
  for (const f of release.foods) {
    const foodId = idOf.get(f.fineliId) as string;
    released.add(foodId);
    for (const p of f.portions) {
      const k = key(foodId, p.unit);
      kept.add(k);
      const old = byKey.get(k);
      if (old && old.grams === p.grams) {
        result.portions.unchanged++;
        continue;
      }
      if (old) result.portions.updated++;
      else result.portions.inserted++;
      toWrite.push({ foodId, fineliUnit: p.unit, grams: p.grams, updatedAt: now });
    }
  }
  for (const batch of chunks(toWrite)) {
    await tx
      .insert(foodPortions)
      .values(batch)
      .onConflictDoUpdate({
        target: [foodPortions.foodId, foodPortions.fineliUnit],
        targetWhere: isNotNull(foodPortions.fineliUnit),
        set: { grams: sql`excluded.grams`, updatedAt: sql`excluded.updated_at` },
      });
  }

  // A released food's unowned measures that the release no longer lists.
  // A retired food keeps its measures, so whatever points at it still reads.
  const gone = current.filter((p) => released.has(p.foodId) && !kept.has(key(p.foodId, p.unit as string)));
  result.portions.removed = gone.length;
  for (const batch of chunks(gone.map((p) => p.id))) {
    await tx.delete(foodPortions).where(and(inArray(foodPortions.id, batch), isNull(foodPortions.userId)));
  }
}
