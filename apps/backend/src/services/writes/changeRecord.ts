import type {
  AssistantChangeAction,
  AssistantChangeSummary,
  AssistantFieldChange,
  ErrorCode,
} from "@hovimestari/types";
import { and, count, eq, gt } from "drizzle-orm";
import { createHash } from "node:crypto";
import { assistantChanges, users } from "../../db/schema/index.js";
import type { Tx } from "../../db/types.js";
import { AppError, appError } from "../../lib/errors.js";
import { isUniqueViolation } from "../../lib/pgErrors.js";
import type { ReadContext } from "../reads/context.js";
import { lockUserForWrite } from "../sourceValues.js";
import type { WriteContext, WriteOutcome } from "./context.js";

// ---------------------------------------------------------------------------
// The record of what a connected assistant changed (design d.4, d.5), lifted
// from finanssiappisV2's services/writes/events.ts. `recordedWrite` runs an
// assistant's write and inserts its record row in one transaction, so a
// change never exists without its row, nor a row without its change. The
// row carries the call's request key, and the unique index on
// (connection_id, request_key) makes a retried call land once.
//
// The screen's write services know nothing of this. Each runs on the
// transaction as a savepoint, through the context it is given, so the REST
// path never reaches here and records nothing.
// ---------------------------------------------------------------------------

const REQUEST_KEY_INDEX = "assistant_changes_request_key_uq";

/** The connection behind a write and the call it came in. */
export interface AssistantActor {
  connectionId: string;
  connectionName: string;
  requestKey: string;
  requestHash: string;
}

/** What a change leaves in the record. */
export interface ChangeRecord {
  action: AssistantChangeAction;
  entityIds: string[];
  summary: AssistantChangeSummary;
}

/** One assistant write, defined in services/writes/recorded/. `B` is its before-state. */
export interface RecordedWrite<B, T> {
  /** The first lock, on the user's row: "key share" for every write but set_targets ("update") and request_deletion ("no key update"). */
  userLock: "key share" | "no key update" | "update";
  /** Locks and reads what the write may change, after the user lock. `async () => null` for a pure add. */
  before: (tx: Tx, ctx: WriteContext) => Promise<B>;
  run: (ctx: WriteContext) => Promise<WriteOutcome<T>>;
  /** The record of the change, or null when nothing changed. */
  record: (before: B, result: WriteOutcome<T>) => ChangeRecord | null;
}

export type RecordedOutcome = "created" | "changed" | "deleted" | "unchanged";

/**
 * Thrown when another call with the same request key committed first: the
 * record insert lost the race on (connection_id, request_key), or the write
 * found nothing left to change and the winner's row was already there. Its
 * transaction is already rolled back.
 */
export class RequestKeyTaken extends Error {
  /** `cause` is the unique violation, when the insert lost. */
  constructor(cause?: unknown) {
    super("Another call with this request key committed first.", { cause });
    this.name = "RequestKeyTaken";
  }
}

/** An earlier call's record row with the same request key and the same arguments. */
export interface Replay {
  action: AssistantChangeAction;
  entityIds: string[];
  summary: AssistantChangeSummary;
  createdAt: Date;
}

/** The user's row in `mode`, the first lock of every recorded write. 404 `user_not_found` for a user gone meanwhile. */
async function lockUser(tx: Tx, userId: string, mode: RecordedWrite<unknown, unknown>["userLock"]): Promise<void> {
  if (mode === "key share") return lockUserForWrite(tx, userId);
  const [user] = await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for(mode);
  if (!user) throw appError("user_not_found", 404);
}

/** Whether a record row with this connection's request key is there to read. */
async function keyTaken(tx: Tx, via: AssistantActor): Promise<boolean> {
  const [row] = await tx
    .select({ id: assistantChanges.id })
    .from(assistantChanges)
    .where(and(eq(assistantChanges.connectionId, via.connectionId), eq(assistantChanges.requestKey, via.requestKey)))
    .limit(1);
  return row !== undefined;
}

/**
 * Runs `w` for the assistant `via` in one transaction: the user's row first,
 * then the before-read, then the screen's own write service on the
 * transaction, then the record row. The outcome follows the record: no
 * record means `unchanged`, whatever the service said, unless another call
 * with this request key committed meanwhile: then it throws
 * `RequestKeyTaken`, as a lost insert does. A refusal throws before the
 * insert and records nothing.
 */
export async function recordedWrite<B, T>(
  ctx: WriteContext,
  via: AssistantActor,
  w: RecordedWrite<B, T>,
): Promise<{ outcome: RecordedOutcome; value: T }> {
  try {
    return await ctx.db.transaction(async (tx) => {
      await lockUser(tx, ctx.userId, w.userLock);
      const before = await w.before(tx, ctx);
      const result = await w.run({ ...ctx, db: tx });
      const record = w.record(before, result);
      if (!record) {
        // A call that waited on the locks of another call with this key finds
        // nothing left to change once that one commits. Its row is visible to
        // this statement (read committed), so the call answers as its replay.
        if (await keyTaken(tx, via)) throw new RequestKeyTaken();
        return { outcome: "unchanged" as const, value: result.value };
      }
      if (result.outcome === "unchanged" || result.outcome === "replayed") {
        // A record of a write its own service says changed nothing would be a false line.
        throw new Error(`A ${record.action} record for a write that answered ${result.outcome}.`);
      }
      await tx.insert(assistantChanges).values({
        userId: ctx.userId,
        connectionId: via.connectionId,
        connectionName: via.connectionName,
        action: record.action,
        entityIds: record.entityIds,
        summary: record.summary,
        requestKey: via.requestKey,
        requestHash: via.requestHash,
      });
      return { outcome: result.outcome, value: result.value };
    });
  } catch (err) {
    if (isUniqueViolation(err, REQUEST_KEY_INDEX)) throw new RequestKeyTaken(err);
    throw err;
  }
}

/**
 * The record row an earlier call with this request key left, or null. The
 * same key with other arguments, or sent to another tool, answers 409
 * `request_key_reused`, and nothing is written.
 */
export async function findReplay(ctx: ReadContext, via: AssistantActor): Promise<Replay | null> {
  const [found] = await ctx.db
    .select({
      action: assistantChanges.action,
      entityIds: assistantChanges.entityIds,
      summary: assistantChanges.summary,
      requestHash: assistantChanges.requestHash,
      createdAt: assistantChanges.createdAt,
    })
    .from(assistantChanges)
    .where(
      and(
        eq(assistantChanges.userId, ctx.userId),
        eq(assistantChanges.connectionId, via.connectionId),
        eq(assistantChanges.requestKey, via.requestKey),
      ),
    )
    .limit(1);
  if (!found) return null;
  if (found.requestHash !== via.requestHash) throw appError("request_key_reused", 409);
  return { action: found.action, entityIds: found.entityIds, summary: found.summary, createdAt: found.createdAt };
}

/**
 * After `RequestKeyTaken`: the winner's row, answered as a replay when the
 * arguments match and refused `request_key_reused` when they do not. The
 * winner committed before the loser failed, so its row is there to read.
 * Should it not be, the original failure is thrown, as finanssiappisV2
 * rethrows it, so the log names what really failed.
 */
export async function replayAfterConflict(
  ctx: ReadContext,
  via: AssistantActor,
  taken: RequestKeyTaken,
): Promise<Replay> {
  const replay = await findReplay(ctx, via);
  if (replay) return replay;
  // Only a lost insert carries a cause. Without one, the write saw the key's
  // row and it is gone now, which only the connection's own removal can do.
  throw taken.cause ?? new Error("A write saw this request key's record row, and the row is gone.");
}

/**
 * The fields a change set, each from its value before to its value after,
 * in the order given. A field whose two values are equal is left out, so an
 * edit to the same values answers an empty list.
 */
export function fieldChanges(
  pairs: [field: AssistantFieldChange["field"], from: unknown, to: unknown][],
): AssistantFieldChange[] {
  return pairs
    .filter(([, from, to]) => JSON.stringify(from) !== JSON.stringify(to))
    .map(([field, from, to]) => ({ field, from, to }));
}

/**
 * What a replay reader answers for a row gone since: `read`'s value, or null
 * when it refuses with `code`, the read service's own way of saying the row
 * is not there. Any other failure goes up.
 */
export async function goneAsNull<T>(code: ErrorCode, read: Promise<T>): Promise<T | null> {
  try {
    return await read;
  } catch (err) {
    if (err instanceof AppError && err.code === code) return null;
    throw err;
  }
}

/** The changes recorded for the user since `since`, across every connection. */
export async function countRecentChanges(ctx: ReadContext, since: Date): Promise<number> {
  const [row] = await ctx.db
    .select({ n: count() })
    .from(assistantChanges)
    .where(and(eq(assistantChanges.userId, ctx.userId), gt(assistantChanges.createdAt, since)));
  return row?.n ?? 0;
}

/** The arguments that take a set of entry ids: their order and repeats mean nothing. */
const ID_SETS = ["entryIds", "attach"] as const;

/** The arguments that take a list of `{ id, ... }` per entry: their order means nothing. */
const BY_ID = ["attachStatus"] as const;

/** A value with its object keys sorted, at every depth. Absent keys drop out, as in JSON. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object") {
    const fields = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return Object.fromEntries(fields.map(([k, v]) => [k, canonical(v)]));
  }
  return value;
}

/**
 * The sha256 of the tool's name and the call's validated arguments without
 * its request key, as canonical JSON. The same call sent twice hashes the
 * same, whatever order its fields or its entry ids came in, and whatever
 * order log_cook's attachStatus names its entries in. The name is in
 * the hash, so one key sent to two tools never replays the other's change.
 */
export function requestHashOf(tool: string, args: Record<string, unknown>): string {
  const rest = { ...args };
  delete rest.requestKey;
  for (const field of ID_SETS) {
    const ids = rest[field];
    if (Array.isArray(ids)) rest[field] = [...new Set(ids.map((id) => String(id).toLowerCase()))].sort();
  }
  for (const field of BY_ID) {
    const list = rest[field];
    if (!Array.isArray(list)) continue;
    const keyed = list.map((item: Record<string, unknown>) => ({ ...item, id: String(item.id).toLowerCase() }));
    rest[field] = keyed.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }
  return createHash("sha256")
    .update(JSON.stringify(canonical({ tool, args: rest })))
    .digest("hex");
}
