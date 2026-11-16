/** @jest-environment node */
import fs from "node:fs";
import path from "node:path";
import { browserRequest, withEnv } from "./support";

// Every route handler under src/app/api that accepts a POST must run the
// same-origin guard first. This finds them on disk, so a new handler without
// the guard fails here without anyone listing it.
//
// A GET cannot run that guard: it is a navigation, and a cross-site link can
// start one. So every GET handler is listed below with what it changes, and
// a new GET fails here until someone decides it is safe and adds its line.

const API_ROOT = path.resolve(__dirname, "../../..");

function routeFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "__tests__" ? [] : routeFiles(full);
    return entry.name === "route.ts" ? [full] : [];
  });
}

type RouteModule = { POST?: unknown; GET?: unknown };
const files = routeFiles(path.join(API_ROOT, "api"));
// Imported, not read as text: a regex would miss `export const POST =`,
// `export function POST` or a re-export.
let postFiles: string[] = [];
let getFiles: string[] = [];
beforeAll(async () => {
  const modules = await Promise.all(files.map(async (file) => [file, (await import(file)) as RouteModule] as const));
  postFiles = modules.filter(([, mod]) => typeof mod.POST === "function").map(([file]) => file);
  getFiles = modules.filter(([, mod]) => typeof mod.GET === "function").map(([file]) => file);
});

let restore: () => void;
const fetchSpy = jest.fn<Promise<Response>, Parameters<typeof fetch>>();

beforeAll(() => {
  restore = withEnv({ BFF_SECRET: crypto.randomUUID() });
  global.fetch = fetchSpy as unknown as typeof fetch;
});
afterAll(() => restore());
beforeEach(() => {
  fetchSpy.mockReset();
  fetchSpy.mockRejectedValue(new TypeError("no network in this test"));
});

describe("every POST route handler is guarded", () => {
  it("finds the handlers", () => {
    expect(postFiles.map((f) => path.relative(API_ROOT, f)).sort()).toEqual([
      "api/auth/google/link/start/route.ts",
      "api/auth/refresh/route.ts",
      "api/auth/sign-in/route.ts",
      "api/auth/sign-out/route.ts",
      "api/auth/sign-up/route.ts",
    ]);
  });

  async function post(file: string, init: Parameters<typeof browserRequest>[1]): Promise<Response> {
    const mod = (await import(file)) as { POST: (req: ReturnType<typeof browserRequest>) => Promise<Response> };
    return mod.POST(browserRequest("/api/auth/x", { ...init, cookies: { __refresh_token: "r" } }));
  }

  it("answers a cross-site request with 403 from each, and calls nothing", async () => {
    for (const file of postFiles) {
      const res = await post(file, { body: "{}", site: "cross-site" });
      expect([path.relative(API_ROOT, file), res.status]).toEqual([path.relative(API_ROOT, file), 403]);
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("answers a same-origin text/plain body with 415 from each, and calls nothing", async () => {
    for (const file of postFiles) {
      const res = await post(file, { body: JSON.stringify({ email: "a@b.c" }), contentType: "text/plain" });
      expect([path.relative(API_ROOT, file), res.status]).toEqual([path.relative(API_ROOT, file), 415]);
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

/**
 * Every GET route handler, with the state it changes. Each is a step of a
 * Google redirect flow, bound to the browser that started it by a nonce
 * cookie that only this site sets, so a cross-site navigation to one changes
 * nothing it should not. A new GET joins this list only after that decision.
 */
const GET_HANDLERS: Record<string, string> = {
  // Sets the sign-in nonce cookie and redirects to Google. Overwriting the
  // cookie only spoils a sign-in this browser had started.
  "api/auth/google/start/route.ts": "sets the Google sign-in nonce cookie",
  // Spends the code with the nonce cookie, sets the session cookie and
  // deletes the nonce. Without this browser's nonce the exchange is refused.
  "api/auth/google/complete/route.ts": "sets the session cookie and clears the sign-in nonce cookie",
  // Spends the link code with the link nonce cookie, links Google on the
  // backend, and clears the nonce whatever the outcome.
  "api/auth/google/link/complete/route.ts":
    "clears the link nonce cookie and links Google. A cross-site hit can spend the nonce, which only cancels a link already under way",
};

describe("every GET route handler is a decided one", () => {
  it("finds no GET handler beyond the ones listed", () => {
    expect(getFiles.map((f) => path.relative(API_ROOT, f)).sort()).toEqual(Object.keys(GET_HANDLERS).sort());
  });

  it.each(Object.entries(GET_HANDLERS))("%s is a GET handler, and safe to start cross-site: it %s", (file, reason) => {
    expect(getFiles.map((f) => path.relative(API_ROOT, f))).toContain(file);
    expect(reason.trim()).not.toBe("");
  });
});
