import { describe, expect, it } from "@jest/globals";
import { notAmong } from "../foods.js";

// The one part of the food search that needs no database: a food the first
// list holds is left out of the second. Two statements read the lists, so only
// this filter keeps a food renamed between them out of both.

describe("notAmong", () => {
  const food = (id: string) => ({ id, name: `Food ${id}` });

  it("leaves out of near every food the first list holds, and keeps the order of the rest", () => {
    const found = [food("a"), food("b")];
    const near = [food("c"), food("b"), food("d"), food("a"), food("e")];
    expect(notAmong(found, near)).toEqual([food("c"), food("d"), food("e")]);
  });

  it("keeps near as it is when the lists share no food", () => {
    const near = [food("c"), food("d")];
    expect(notAmong([food("a")], near)).toEqual(near);
    expect(notAmong([], near)).toEqual(near);
  });
});
