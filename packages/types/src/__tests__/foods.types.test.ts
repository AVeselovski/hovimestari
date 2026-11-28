import { expect, it } from "@jest/globals";
import type { OwnFoodBody, OwnFoodUpdateBody } from "../index.js";

// A type test, checked by `pnpm typecheck` and by ts-jest: an edit's body can
// never carry portions, also when it comes from a value typed as a create's
// body, while an edit's body still goes where a create's is taken.

function bodies(created: OwnFoodBody, edited: OwnFoodUpdateBody) {
  // @ts-expect-error A create's body, which may hold portions, is not an edit's.
  const refused: OwnFoodUpdateBody = created;
  const kept: OwnFoodBody = edited;
  return [refused, kept];
}

it("is checked by the compiler", () => {
  expect(typeof bodies).toBe("function");
});
