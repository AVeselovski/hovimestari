import { randomInt } from "node:crypto";
import { readFileSync } from "node:fs";
import type { LookupDeps } from "../../services/writes/barcode.js";

// A stand-in for Open Food Facts that the barcode suites pass as `fetch`. It
// answers from a table of products by the code in the path and counts every
// call, so a suite can say that a lookup made none. Never the live service.

const MILK = readFileSync(
  new URL("../../lib/openFoodFacts/__tests__/fixtures/valio-milk-6408430000258.json", import.meta.url),
  "utf8",
);

/**
 * The recorded milk's answer for the product `code`, with `name` and any
 * product fields changed. `code` is the product's own (`product.code`). The
 * stub sets the top-level `code` to the code asked for, as Open Food Facts
 * echoes it.
 */
export function offBody(code: string, name: string, fields: Record<string, unknown> = {}, nutriments = {}): object {
  const body = JSON.parse(MILK);
  delete body.code;
  Object.assign(body.product, { code, product_name: name, product_name_fi: name, product_name_en: name }, fields);
  Object.assign(body.product.nutriments, nutriments);
  return body;
}

/** One stubbed answer: a body for 200, a status alone, or a thrown network failure. */
export type StubAnswer = { body: object } | { status: number } | "network";

export interface OffStub {
  fetch: typeof globalThis.fetch;
  /** Every path asked for, in order. */
  calls: string[];
  /** What the stub answers for the code sent (the path's last part). Unknown codes answer 404. */
  answers: Map<string, StubAnswer>;
  /** Holds every answer until `release` is called, to make two lookups overlap. */
  hold(): { release: () => void; arrived: (n: number) => Promise<void> };
}

export function offStub(): OffStub {
  const calls: string[] = [];
  const answers = new Map<string, StubAnswer>();
  let gate: Promise<void> | null = null;
  const waiters: { n: number; resolve: () => void }[] = [];
  const fetch = (async (input: string | URL | Request) => {
    const url = new URL(input instanceof Request ? input.url : input);
    calls.push(url.pathname);
    for (const w of waiters.filter((w) => calls.length >= w.n)) w.resolve();
    if (gate) await gate;
    const asked = url.pathname.split("/").at(-1) ?? "";
    const answer = answers.get(asked);
    if (answer === "network") throw new TypeError("fetch failed");
    if (answer === undefined) return new Response(JSON.stringify({ code: asked, status: 0 }), { status: 404 });
    if ("status" in answer) return new Response("{}", { status: answer.status });
    // Open Food Facts echoes the code asked for at the top of every answer.
    return new Response(JSON.stringify({ ...answer.body, code: asked }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof globalThis.fetch;
  return {
    fetch,
    calls,
    answers,
    hold() {
      let release!: () => void;
      gate = new Promise<void>((resolve) => (release = resolve));
      return {
        release: () => {
          gate = null;
          release();
        },
        arrived: (n) => new Promise<void>((resolve) => waiters.push({ n, resolve })),
      };
    },
  };
}

/** A fake clock the budgets and the cache read. */
export function fakeClock(start = 1_800_000_000_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => void (t += ms) };
}

/** Fresh budgets and cache over `stub`, on `clock`. */
export async function stubDeps(stub: OffStub, clock = fakeClock()): Promise<LookupDeps> {
  const { lookupDeps } = await import("../../services/writes/barcode.js");
  return lookupDeps({ fetch: stub.fetch, now: clock.now, baseUrl: "https://off.test", userAgent: "Hovimestari/0" });
}

let serial = 0;

/** A new EAN-13 starting 64, a Finnish product's prefix, with its check digit. */
export async function newEan13(): Promise<string> {
  const { checkDigitOf } = await import("../../lib/openFoodFacts/gtin.js");
  const data = `64${String(randomInt(1e6)).padStart(6, "0")}${String(++serial).padStart(4, "0")}`;
  return `${data}${checkDigitOf(data)}`;
}
