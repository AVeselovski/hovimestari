import { expect, it } from "@jest/globals";
import type { Db } from "../../db/types.js";
import type { endAllSessions } from "../sessions.js";

// A type test, checked by `pnpm typecheck`: endAllSessions takes the user's
// row lock, which on the pool would end with its own statement. It must
// refuse the pool and take only a transaction.

type Handle = Parameters<typeof endAllSessions>[0];

// @ts-expect-error The pool is not a transaction.
const onThePool: Handle = {} as Db;

it("refuses the pool where a transaction is needed (checked by typecheck)", () => {
  expect(onThePool).toBeDefined();
});
