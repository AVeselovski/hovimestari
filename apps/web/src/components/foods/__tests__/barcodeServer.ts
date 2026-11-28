import { createFood, lookupBarcode } from "@/lib/api/foods";
import { sameBarcode } from "@/lib/barcode";
import type { BarcodeLookup, FoodDetail } from "@hovimestari/types";
import { act } from "@testing-library/react";
import { server } from "./foodSheetServer";
import { detailOf, ownFood, ownPortion, refusal } from "./support";

// The barcode lookup behind the log sheet, on top of ./foodSheetServer.tsx.
// It answers from what it holds when it answers, never from what it held when
// asked: the user's own food with that barcode first, then the product kept
// for it, then not found. It remembers every code it was sent. A held lookup
// waits until `releaseLookups`, so a test sees the sheet while it is out.
//
// A suite that uses it adds `lookupBarcode` to its mock of `@/lib/api/foods`
// and calls `installLookups()` after `installServer()`.

/** What the fake Open Food Facts side holds for a code, keyed by its 14-digit form. */
type Product =
  { kind: "food"; food: FoodDetail } | { kind: "answer"; answer: BarcodeLookup } | { kind: "error"; error: unknown };

export const lookups = {
  /** Every code sent, in order. */
  sent: [] as string[],
  products: new Map<string, Product>(),
  /** While true, every lookup waits for `releaseLookups`. */
  hold: false,
  held: [] as Array<() => void>,
  /** The kept products this user has looked up, for `newlyVisible`. */
  seen: new Set<string>(),
};

const key = (code: string) => code.padStart(14, "0");

/** Puts a kept Open Food Facts product behind `code`. Found, it joins the user's foods, as a lookup makes it visible. */
export function keepProduct(code: string, food: FoodDetail): void {
  lookups.products.set(key(code), { kind: "food", food });
}

/** Makes `code` answer `answer`. */
export function answerWith(code: string, answer: BarcodeLookup): void {
  lookups.products.set(key(code), { kind: "answer", answer });
}

/** Makes `code` fail with `error`. */
export function failWith(code: string, error: unknown): void {
  lookups.products.set(key(code), { kind: "error", error });
}

function answerNow(code: string): BarcodeLookup {
  const own = Object.values(server.foods).find((f) => f.isOwn && f.barcode !== null && sameBarcode(f.barcode, code));
  if (own) return { result: "found", food: own, newlyVisible: false };
  const product = lookups.products.get(key(code));
  if (!product) return { result: "not_found", barcode: code };
  if (product.kind === "error") throw product.error;
  if (product.kind === "answer") return product.answer;
  server.foods[product.food.id] = product.food;
  const newlyVisible = !lookups.seen.has(product.food.id);
  lookups.seen.add(product.food.id);
  return { result: "found", food: product.food, newlyVisible };
}

/** Answers every held lookup, in the order they were sent, from what the server holds now. */
export async function releaseLookups(): Promise<void> {
  const waiting = lookups.held.splice(0);
  await act(async () => {
    for (const answer of waiting) answer();
  });
}

export function installLookups(): void {
  lookups.sent = [];
  lookups.products = new Map();
  lookups.hold = false;
  lookups.held = [];
  lookups.seen = new Set();
  jest
    .mocked(lookupBarcode)
    .mockReset()
    .mockImplementation((code) => {
      lookups.sent.push(code);
      return new Promise<BarcodeLookup>((resolve, reject) => {
        const answer = () => {
          try {
            resolve(answerNow(code));
          } catch (err) {
            reject(err);
          }
        };
        if (lookups.hold) lookups.held.push(answer);
        else void Promise.resolve().then(answer);
      });
    });
  // An own food saved goes on the server, so a later lookup of its barcode finds it.
  jest
    .mocked(createFood)
    .mockReset()
    .mockImplementation(async (body) => {
      const taken = Object.values(server.foods).some(
        (f) => f.isOwn && body.barcode !== null && f.barcode !== null && sameBarcode(f.barcode, body.barcode),
      );
      if (taken) throw refusal(409, "barcode_taken");
      // The portions it came with, as the server answers them: the person's own, listed by name.
      const portions = (body.portions ?? [])
        .map((p) => ownPortion(p.name, p.grams))
        .sort((x, y) => (x.name ?? "").localeCompare(y.name ?? ""));
      const food = detailOf(ownFood(body.name, { per100g: body.per100g }), { barcode: body.barcode, portions });
      server.foods[food.id] = food;
      return food;
    });
}
