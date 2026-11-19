import { readFileSync } from "node:fs";
import { sentFormOf } from "./gtin.js";
import { OffBodySchema, type OffProduct } from "./product.js";

// The one call to Open Food Facts. The server makes it, never the browser,
// and it carries nothing of the person: a fixed User-Agent, no cookie, no
// account id. `fetch` is injected, so no test ever reaches the real service.

/** How long a call may take, start to last byte. One attempt, no retry. */
export const OFF_TIMEOUT_MS = 5_000;
/** The largest body read. A longer one counts as unavailable. */
export const OFF_MAX_BODY_BYTES = 512 * 1024;
/** The fields asked for, each one read. Everything else in a product stays at Open Food Facts. */
export const OFF_FIELDS = "code,product_name,product_name_fi,product_name_en,brands,nutriments,no_nutrition_data";

/**
 * `code` is the product's own code, `product.code`, or null when it names
 * none. The answer's top-level `code` only echoes the code asked for, so it
 * is never read.
 */
export type OffAnswer = { kind: "found"; code: string | null; product: OffProduct } | { kind: "not_found" };

/**
 * Open Food Facts did not answer usably: a timeout, a network failure, a
 * 429, a 5xx, a body too long or not JSON. The message names the kind of
 * failure only, never the code or the URL, because an unexpected error's
 * message reaches the log.
 */
export class OffUnavailableError extends Error {
  constructor(kind: string) {
    super(`Open Food Facts lookup failed: ${kind}`);
    this.name = "OffUnavailableError";
  }
}

export interface ClientDeps {
  fetch: typeof globalThis.fetch;
  baseUrl: string;
  userAgent: string;
  timeoutMs?: number;
  maxBodyBytes?: number;
}

/** The body as text, read up to `max` bytes. */
async function readCapped(res: Response, max: number): Promise<string> {
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > max) throw new OffUnavailableError("body too long");
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => {});
      throw new OffUnavailableError("body too long");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/** Reads the product with the 14-digit GTIN `gtin14`. */
export async function fetchProduct(gtin14: string, deps: ClientDeps): Promise<OffAnswer> {
  const url = new URL(`/api/v2/product/${sentFormOf(gtin14)}`, deps.baseUrl);
  url.searchParams.set("fields", OFF_FIELDS);
  let text: string;
  let status: number;
  try {
    const res = await deps.fetch(url, {
      method: "GET",
      headers: { "User-Agent": deps.userAgent, Accept: "application/json" },
      credentials: "omit",
      // A redirect could name any host. It fails as a network error, so it counts as unavailable.
      redirect: "error",
      signal: AbortSignal.timeout(deps.timeoutMs ?? OFF_TIMEOUT_MS),
    });
    status = res.status;
    if (status === 404) {
      await res.body?.cancel().catch(() => {});
      return { kind: "not_found" };
    }
    if (status !== 200) {
      await res.body?.cancel().catch(() => {});
      throw new OffUnavailableError(`status ${status === 429 ? "too many requests" : "not usable"}`);
    }
    text = await readCapped(res, deps.maxBodyBytes ?? OFF_MAX_BODY_BYTES);
  } catch (err) {
    if (err instanceof OffUnavailableError) throw err;
    // Read by name: the abort reason is a DOMException, which may come from another realm.
    const name = typeof err === "object" && err !== null ? (err as { name?: unknown }).name : undefined;
    const timedOut = name === "TimeoutError" || name === "AbortError";
    throw new OffUnavailableError(timedOut ? "timeout" : "network");
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new OffUnavailableError("body not JSON");
  }
  const body = OffBodySchema.safeParse(json);
  if (!body.success) throw new OffUnavailableError("body not readable");
  if (body.data.status !== 1 || !body.data.product) return { kind: "not_found" };
  return { kind: "found", code: body.data.product.code ?? null, product: body.data.product };
}

/** Where lookups go unless `OFF_BASE_URL` says otherwise. */
export const OFF_DEFAULT_BASE_URL = "https://world.openfoodfacts.org";

/** `Hovimestari/<backend package version>`: the app and its version, nothing of anyone. */
export function defaultUserAgent(): string {
  const pkg = JSON.parse(readFileSync(new URL("../../../package.json", import.meta.url), "utf8")) as {
    version: string;
  };
  return `Hovimestari/${pkg.version}`;
}
