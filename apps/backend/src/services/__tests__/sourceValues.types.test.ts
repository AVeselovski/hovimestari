import { expect, it } from "@jest/globals";
import type { Db } from "../../db/types.js";
import type {
  isUsed,
  lockUserForWrite,
  readFoodForEntry,
  readMealForEntry,
  rewritePlannedBasis,
} from "../sourceValues.js";

// A type test, checked by `pnpm typecheck`: each of these takes or relies on
// a row lock, which on the pool would end with its own statement. Each must
// refuse the pool and take only a transaction. lockMeal in writes/savedMeals
// is module-private and typed the same way.

const pool = {} as Db;

// @ts-expect-error The pool is not a transaction.
const lockUser: Parameters<typeof lockUserForWrite>[0] = pool;
// @ts-expect-error The pool is not a transaction.
const readFood: Parameters<typeof readFoodForEntry>[0] = pool;
// @ts-expect-error The pool is not a transaction.
const readMeal: Parameters<typeof readMealForEntry>[0] = pool;
// @ts-expect-error The pool is not a transaction.
const used: Parameters<typeof isUsed>[0] = pool;
// @ts-expect-error The pool is not a transaction.
const rewrite: Parameters<typeof rewritePlannedBasis>[0] = pool;

it("refuses the pool where a transaction is needed (checked by typecheck)", () => {
  expect([lockUser, readFood, readMeal, used, rewrite]).toHaveLength(5);
});
