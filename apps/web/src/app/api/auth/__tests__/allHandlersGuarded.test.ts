/** @jest-environment node */
import fs from "node:fs";
import path from "node:path";
import { browserRequest, withEnv } from "./support";

// Every route handler under src/app/api that accepts a POST must run the
// same-origin guard first. This finds them on disk, so a new handler without
// the guard fails here without anyone listing it.

const API_ROOT = path.resolve(__dirname, "../../..");

function routeFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "__tests__" ? [] : routeFiles(full);
    return entry.name === "route.ts" ? [full] : [];
  });
}

type RouteModule = { POST?: unknown };
const files = routeFiles(path.join(API_ROOT, "api"));
// Imported, not read as text: a regex would miss `export const POST =`,
// `export function POST` or a re-export.
let postFiles: string[] = [];
beforeAll(async () => {
  const modules = await Promise.all(files.map(async (file) => [file, (await import(file)) as RouteModule] as const));
  postFiles = modules.filter(([, mod]) => typeof mod.POST === "function").map(([file]) => file);
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
