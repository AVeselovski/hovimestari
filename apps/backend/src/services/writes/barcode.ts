import type { BarcodeLookup, BarcodeLookupBody, IncompleteReason, ProductValues } from "@hovimestari/types";
import { and, desc, eq, isNotNull, or, sql, type SQL } from "drizzle-orm";
import { foodLookups, foods } from "../../db/schema/index.js";
import { env } from "../../lib/env.js";
import { appError } from "../../lib/errors.js";
import { failureOf, isQueryWrapper } from "../../lib/failureOf.js";
import { answerCache, type AnswerCache } from "../../lib/openFoodFacts/cache.js";
import {
  defaultUserAgent,
  fetchProduct,
  OFF_DEFAULT_BASE_URL,
  OffUnavailableError,
  type OffAnswer,
} from "../../lib/openFoodFacts/client.js";
import { readingsOf, storedFormOf, upcEOf } from "../../lib/openFoodFacts/gtin.js";
import { keyedBuckets, tokenBucket, type KeyedBuckets, type TokenBucket } from "../../lib/openFoodFacts/limiter.js";
import { foodOf, type KeptFood } from "../../lib/openFoodFacts/product.js";
import { visibleTo } from "../foodScope.js";
import { getFood } from "../reads/foods.js";
import { lockUserForWrite } from "../sourceValues.js";
import type { WriteContext, WriteOutcome } from "./context.js";

// Looking up a barcode: the user's own foods, then the Open Food Facts
// products already stored, then answers held in memory, then Open Food Facts
// itself, within two budgets. A write service: it may store a product, and it
// records that the user looked it up, which makes the product visible to
// them. No log line here holds a barcode, a product's name or the user id.

/** Calls to Open Food Facts one user may make, and how often one comes back: 30 an hour. */
export const USER_BUDGET = { capacity: 30, refillEveryMs: 2 * 60_000 };
/** Calls the whole server may make: 10 a minute, below the 15 Open Food Facts allows. */
export const SERVER_BUDGET = { capacity: 10, refillEveryMs: 6_000 };
/** How long and how many answers that were not stored are held. */
export const CACHE = { ttlMs: 10 * 60_000, max: 500 };

/** An answer that was not stored. */
type Unstored =
  { kind: "not_found" } | { kind: "incomplete"; reason: IncompleteReason; name: string | null; per100g: ProductValues };
/** What one reading of a code comes to. */
type ReadingAnswer = Unstored | { kind: "stored"; id: string };
/**
 * What the cache holds under a 14-digit form: an answer that was not stored,
 * or a complete product that came back but whose storing failed. The next
 * press stores that one from memory, with no call.
 */
type Remembered = Unstored | { kind: "fetched"; food: KeptFood };

export interface LookupDeps {
  fetchProduct: (gtin14: string) => Promise<OffAnswer>;
  userBudget: KeyedBuckets;
  serverBudget: TokenBucket;
  cache: AnswerCache<Remembered>;
  /**
   * The calls to Open Food Facts under way, by 14-digit form. A lookup of a
   * code already being called for waits on that call and spends nothing.
   * An entry goes when its call settles, either way.
   */
  inFlight: Map<string, Promise<ReadingAnswer>>;
}

/** Fresh budgets and cache over `fetch`, on the clock `now`. Tests build their own. */
export function lookupDeps({
  fetch = (...args) => globalThis.fetch(...args),
  now = Date.now,
  baseUrl = env.OFF_BASE_URL ?? OFF_DEFAULT_BASE_URL,
  userAgent = env.OFF_USER_AGENT ?? defaultUserAgent(),
}: {
  fetch?: typeof globalThis.fetch;
  now?: () => number;
  baseUrl?: string;
  userAgent?: string;
} = {}): LookupDeps {
  return {
    fetchProduct: (gtin14) => fetchProduct(gtin14, { fetch, baseUrl, userAgent }),
    userBudget: keyedBuckets({ ...USER_BUDGET, now }),
    serverBudget: tokenBucket({ ...SERVER_BUDGET, now }),
    cache: answerCache<Remembered>({ ...CACHE, now }),
    inFlight: new Map(),
  };
}

let shared: LookupDeps | undefined;

/** The process's one set of budgets and cache, which the route uses. They live in memory: a restart empties them. */
export const sharedLookupDeps = (): LookupDeps => (shared ??= lookupDeps());

/** Replaces the route's budgets and cache. For tests only, which pass their own fetch and clock. */
export function setSharedLookupDepsForTests(deps: LookupDeps | undefined): void {
  shared = deps;
}

const padded = (column: SQL | typeof foods.barcode) => sql`lpad(${column}, 14, '0')`;

/** The user's own food whose barcode is any form of the code, the most recently updated first. */
async function findOwnFood(ctx: WriteContext, code: string, gtins: string[]): Promise<string | null> {
  const forms = [...new Set([code.padStart(14, "0"), ...gtins])];
  const upcE = gtins.map(upcEOf).filter((c): c is string => c !== null);
  const matches = or(
    sql`${padded(foods.barcode)} IN (${sql.join(
      forms.map((f) => sql`${f}`),
      sql`, `,
    )})`,
    upcE.length > 0
      ? sql`${foods.barcode} IN (${sql.join(
          upcE.map((c) => sql`${c}`),
          sql`, `,
        )})`
      : undefined,
  );
  const [own] = await ctx.db
    .select({ id: foods.id })
    .from(foods)
    .where(
      and(
        eq(foods.source, "user"),
        eq(foods.userId, ctx.userId),
        isNotNull(foods.barcode),
        matches,
        visibleTo(ctx.userId),
      ),
    )
    .orderBy(desc(foods.updatedAt), desc(foods.id))
    .limit(1);
  return own?.id ?? null;
}

/** The stored Open Food Facts food for a 14-digit form, read with no visibility filter, retired or not. */
async function findStored(ctx: WriteContext, gtin: string) {
  const [stored] = await ctx.db
    .select({ id: foods.id, retiredAt: foods.retiredAt })
    .from(foods)
    .where(and(eq(foods.source, "open_food_facts"), sql`${padded(foods.barcode)} = ${gtin}`));
  return stored ?? null;
}

/**
 * Records that the user looked the food up, which makes it visible to them.
 * Answers whether this lookup inserted the row: their first lookup of it.
 */
async function recordLookup(ctx: WriteContext, foodId: string): Promise<boolean> {
  const [row] = await ctx.db.transaction(async (tx) => {
    await lockUserForWrite(tx, ctx.userId);
    return tx
      .insert(foodLookups)
      .values({ userId: ctx.userId, foodId, lookedUpAt: ctx.now })
      .onConflictDoUpdate({ target: [foodLookups.userId, foodLookups.foodId], set: { lookedUpAt: ctx.now } })
      .returning({ inserted: sql<boolean>`xmax = 0` });
  });
  return row.inserted;
}

async function found(ctx: WriteContext, foodId: string): Promise<WriteOutcome<BarcodeLookup>> {
  const newlyVisible = await recordLookup(ctx, foodId);
  return {
    value: { result: "found", food: await getFood(ctx, foodId), newlyVisible },
    outcome: newlyVisible ? "created" : "unchanged",
  };
}

/**
 * Takes one call from both budgets, or from neither. One synchronous step: no
 * other request runs in between. A refusal says when a call comes back: the
 * server's within seconds, the user's within minutes.
 */
function spendBudgets(ctx: WriteContext, deps: LookupDeps): void {
  if (!deps.userBudget.has(ctx.userId)) {
    throw appError("barcode_lookup_limit", 429, USER_BUDGET.refillEveryMs / 1000);
  }
  if (!deps.serverBudget.has()) throw appError("barcode_lookup_busy", 429, SERVER_BUDGET.refillEveryMs / 1000);
  deps.userBudget.take(ctx.userId);
  deps.serverBudget.take();
}

/** Whether the catalogue refused the row for what it holds: an integrity constraint, SQLSTATE class 23. */
function isRefusedRow(err: unknown): boolean {
  const driver = err instanceof Error && isQueryWrapper(err) ? err.cause : err;
  const code = typeof driver === "object" && driver !== null ? (driver as { code?: unknown }).code : undefined;
  return typeof code === "string" && code.startsWith("23");
}

/**
 * Stores a complete product once and reads it back. Its own statement,
 * committed before the read-back, so two first lookups at once on two
 * machines store one row: the second waits on the unique index, then does
 * nothing, and both read the first one's row.
 *
 * A failure keeps what was fetched in memory, since a call was spent on it.
 * A row the catalogue refuses is remembered as a product to add from the
 * label. Any other failure, such as a busy database, goes on to the error
 * middleware as for any write, and the next press stores the product from
 * memory, with no call and no budget spent.
 */
async function keep(ctx: WriteContext, gtin: string, food: KeptFood, deps: LookupDeps): Promise<ReadingAnswer> {
  let stored: Awaited<ReturnType<typeof findStored>>;
  try {
    await ctx.db
      .insert(foods)
      .values({ source: "open_food_facts", barcode: storedFormOf(gtin), ...food })
      .onConflictDoNothing();
    stored = await findStored(ctx, gtin);
  } catch (err) {
    if (!isRefusedRow(err)) {
      deps.cache.set(gtin, { kind: "fetched", food });
      throw err;
    }
    // Swallowed here, so logged here: the code and constraint, never the row.
    console.error("[barcode] a product could not be kept:", failureOf(err));
    const { name, energyKcal, proteinG, carbsG, fatG } = food;
    const refused: Unstored = {
      kind: "incomplete",
      reason: "implausible_values",
      name,
      per100g: { energyKcal, proteinG, carbsG, fatG },
    };
    deps.cache.set(gtin, refused);
    return refused;
  }
  if (!stored || stored.retiredAt !== null) return { kind: "not_found" };
  return { kind: "stored", id: stored.id };
}

/** Asks Open Food Facts, and stores a complete product once. Steps 6 and 7. The caller has spent the budgets. */
async function fetchAndKeep(ctx: WriteContext, gtin: string, deps: LookupDeps): Promise<ReadingAnswer> {
  let answer: OffAnswer;
  try {
    answer = await deps.fetchProduct(gtin);
  } catch (err) {
    if (err instanceof OffUnavailableError) throw appError("barcode_lookup_unavailable", 503);
    throw err;
  }
  // An answer under another code, such as a product merged into another, is
  // never stored under the code asked for: it would put that product's
  // figures under this barcode, for every user, for good. Only the product's
  // own code counts, and a product that names none is not the one asked for.
  const sameCode =
    answer.kind === "found" &&
    answer.code !== null &&
    /^[0-9]{1,14}$/.test(answer.code) &&
    answer.code.padStart(14, "0") === gtin;
  if (answer.kind === "not_found" || !sameCode) {
    deps.cache.set(gtin, { kind: "not_found" });
    return { kind: "not_found" };
  }
  const outcome = foodOf(answer.product);
  if (outcome.kind === "incomplete") {
    deps.cache.set(gtin, outcome);
    return outcome;
  }
  return keep(ctx, gtin, outcome.food, deps);
}

/** Runs `start` as the one call under way for `gtin`, which other lookups of it wait on. */
function startCall(gtin: string, deps: LookupDeps, start: () => Promise<ReadingAnswer>): Promise<ReadingAnswer> {
  const call: Promise<ReadingAnswer> = start().finally(() => {
    if (deps.inFlight.get(gtin) === call) deps.inFlight.delete(gtin);
  });
  deps.inFlight.set(gtin, call);
  return call;
}

/**
 * Steps 3 to 7 for one reading of the code. A call already under way for the
 * same form is waited on, not repeated: only the lookup that starts a call
 * spends from the budgets. Each lookup still records its own visit. A product
 * fetched but not yet stored is stored from memory, through the same entry,
 * so two presses do not race the insert.
 */
async function lookUpReading(ctx: WriteContext, gtin: string, deps: LookupDeps): Promise<ReadingAnswer> {
  const stored = await findStored(ctx, gtin);
  if (stored) return stored.retiredAt === null ? { kind: "stored", id: stored.id } : { kind: "not_found" };
  // From here to `startCall` runs in one synchronous step, so no second call starts in between.
  const remembered = deps.cache.get(gtin);
  if (remembered && remembered.kind !== "fetched") return remembered;
  const pending = deps.inFlight.get(gtin);
  if (pending) return pending;
  if (remembered) return startCall(gtin, deps, () => keep(ctx, gtin, remembered.food, deps));
  spendBudgets(ctx, deps);
  return startCall(gtin, deps, () => fetchAndKeep(ctx, gtin, deps));
}

/**
 * Looks up `body.barcode` for the user. Own foods first, always. A code with
 * a wrong check digit, or a shop's own number, is never sent. An 8-digit
 * code that reads two ways tries its second reading only when the first is
 * not found. Throws 429 `barcode_lookup_limit` or `barcode_lookup_busy` when
 * a call is needed and a budget is empty, 503 `barcode_lookup_unavailable`
 * when Open Food Facts does not answer.
 */
export async function lookupBarcode(
  ctx: WriteContext,
  body: BarcodeLookupBody,
  deps: LookupDeps,
): Promise<WriteOutcome<BarcodeLookup>> {
  const code = body.barcode;
  const readings = readingsOf(code, body.format);
  const own = await findOwnFood(
    ctx,
    code,
    readings.map((r) => r.gtin),
  );
  if (own)
    return { value: { result: "found", food: await getFood(ctx, own), newlyVisible: false }, outcome: "unchanged" };

  const unchanged = (value: BarcodeLookup): WriteOutcome<BarcodeLookup> => ({ value, outcome: "unchanged" });
  if (readings.length === 0) return unchanged({ result: "not_found", barcode: code });
  const sendable = readings.filter((r) => !r.inStore);
  if (sendable.length === 0) return unchanged({ result: "in_store", barcode: code });

  for (const { gtin } of sendable) {
    const answer = await lookUpReading(ctx, gtin, deps);
    if (answer.kind === "stored") return found(ctx, answer.id);
    if (answer.kind === "incomplete") {
      return unchanged({
        result: "incomplete",
        barcode: code,
        reason: answer.reason,
        product: { name: answer.name, per100g: answer.per100g },
      });
    }
  }
  return unchanged({ result: "not_found", barcode: code });
}
