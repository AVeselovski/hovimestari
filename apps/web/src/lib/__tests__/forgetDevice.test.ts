import fs from "node:fs";
import path from "node:path";
import { PAGE_CACHE_PREFIX, forgetSignedInPages } from "../forgetDevice";

/** A Cache Storage fake with the calls the helper makes. Keys are full URLs, as the browser's are. */
function fakeCaches(contents: Record<string, string[]>): Map<string, Set<string>> {
  const store = new Map(Object.entries(contents).map(([name, urls]) => [name, new Set(urls)]));
  (globalThis as { caches?: unknown }).caches = {
    keys: async () => [...store.keys()],
    open: async (name: string) => ({
      keys: async () => [...(store.get(name) ?? [])].map((url) => ({ url })),
      delete: async (req: { url: string }) => store.get(name)?.delete(req.url) ?? false,
    }),
  };
  return store;
}

afterEach(() => {
  delete (globalThis as { caches?: unknown }).caches;
});

describe("forgetSignedInPages", () => {
  it("deletes every cached signed-in page and keeps the guest pages and the assets", async () => {
    const store = fakeCaches({
      "hovi-pages-v3": ["https://hovi.test/", "https://hovi.test/settings", "https://hovi.test/auth/sign-in"],
      "hovi-pages-v2": ["https://hovi.test/recipes"],
      "hovi-assets-v3": ["https://hovi.test/icon-192.png"],
    });
    await forgetSignedInPages();
    expect([...store.get("hovi-pages-v3")!]).toEqual(["https://hovi.test/auth/sign-in"]);
    expect([...store.get("hovi-pages-v2")!]).toEqual([]);
    expect([...store.get("hovi-assets-v3")!]).toEqual(["https://hovi.test/icon-192.png"]);
  });

  it("does nothing, and does not throw, where the browser has no caches", async () => {
    await expect(forgetSignedInPages()).resolves.toBeUndefined();
  });

  it("does not throw when storage refuses", async () => {
    (globalThis as { caches?: unknown }).caches = { keys: () => Promise.reject(new Error("refused")) };
    await expect(forgetSignedInPages()).resolves.toBeUndefined();
  });
});

// The prefix is written twice: here, and in the service worker, which cannot import it.
describe("the page cache prefix", () => {
  it("is the start of the service worker's page cache name", () => {
    const sw = fs.readFileSync(path.resolve(__dirname, "../../../public/sw.js"), "utf8");
    const name = /const PAGE_CACHE = `([^`$]*)\$\{CACHE_VERSION\}`;/.exec(sw);
    expect(name).not.toBeNull();
    expect(name![1].startsWith(PAGE_CACHE_PREFIX)).toBe(true);
  });
});
