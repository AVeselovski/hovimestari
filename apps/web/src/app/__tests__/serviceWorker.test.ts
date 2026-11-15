/** @jest-environment node */
import fs from "node:fs";
import path from "node:path";

// Runs public/sw.js as written, with the parts of the worker platform it uses
// in Node: Cache Storage (string keys resolve against the worker's location,
// keys come back in insertion order, as the spec says), fetch, and fetch events.

const SOURCE = fs.readFileSync(path.resolve(__dirname, "../../../public/sw.js"), "utf8");
const ORIGIN = "https://app.test";

type Handler = (event: {
  request?: unknown;
  respondWith?: (p: Promise<Response>) => void;
  waitUntil?: (p: Promise<unknown>) => void;
}) => void;

function makeCaches(fetchFn: (url: string) => Promise<Response>) {
  const stores = new Map<string, Map<string, Response>>();
  const key = (r: string | { url: string }) => new URL(typeof r === "string" ? r : r.url, ORIGIN).href;
  const open = async (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const store = stores.get(name)!;
    return {
      put: async (r: string | { url: string }, res: Response) => {
        store.set(key(r), res);
      },
      match: async (r: string | { url: string }) => store.get(key(r))?.clone(),
      delete: async (r: string | { url: string }) => store.delete(key(r)),
      keys: async () => [...store.keys()].map((url) => ({ url })),
      // Like the real one: fetches, and rejects when the fetch fails.
      add: async (url: string) => {
        await fetchFn(key(url));
        store.set(key(url), new Response(`page ${new URL(url, ORIGIN).pathname}`, { status: 200 }));
      },
    };
  };
  return {
    stores,
    api: {
      open,
      keys: async () => [...stores.keys()],
      delete: async (name: string) => stores.delete(name),
    },
  };
}

async function boot(network: (url: string) => Promise<Response>) {
  const listeners: Record<string, Handler> = {};
  const caches = makeCaches(network);
  const self = {
    location: new URL(`${ORIGIN}/sw.js`),
    addEventListener: (type: string, fn: Handler) => (listeners[type] = fn),
    skipWaiting: async () => {},
    clients: { claim: async () => {} },
  };
  const fetchFn = (req: string | { url: string }) =>
    network(new URL(typeof req === "string" ? req : req.url, ORIGIN).href);
  new Function("self", "caches", "fetch", SOURCE)(self, caches.api, fetchFn);

  const waits: Promise<unknown>[] = [];
  listeners.install({ waitUntil: (p) => waits.push(p) });
  listeners.activate({ waitUntil: (p) => waits.push(p) });
  await Promise.all(waits);

  async function navigate(pathAndQuery: string): Promise<Response | undefined> {
    let answer: Promise<Response> | undefined;
    listeners.fetch({
      request: { url: `${ORIGIN}${pathAndQuery}`, method: "GET", mode: "navigate" },
      respondWith: (p) => (answer = p),
    });
    return answer;
  }
  async function asset(p: string): Promise<Response | undefined> {
    let answer: Promise<Response> | undefined;
    listeners.fetch({
      request: { url: `${ORIGIN}${p}`, method: "GET", mode: "cors" },
      respondWith: (x) => (answer = x),
    });
    return answer;
  }
  const pages = () => [...([...caches.stores.entries()].find(([n]) => n.startsWith("hovi-pages"))?.[1].keys() ?? [])];
  const assets = () => [...([...caches.stores.entries()].find(([n]) => n.startsWith("hovi-assets"))?.[1].keys() ?? [])];
  return { navigate, asset, pages, assets };
}

/** A same-origin answer as a worker's fetch returns it: `type` is "basic", which `new Response` cannot set. */
const page = (body: string): Response => {
  const res = new Response(body, { status: 200 });
  Object.defineProperty(res, "type", { value: "basic" });
  return res;
};
let online = true;
const network = async (url: string): Promise<Response> => {
  if (!online) throw new TypeError("Failed to fetch");
  return page(`fresh ${new URL(url).pathname}`);
};

beforeEach(() => {
  online = true;
});

describe("the service worker", () => {
  it("never caches a guest page with a query string, and caches others by path alone", async () => {
    const sw = await boot(network);
    await sw.navigate("/auth/reset-password?token=abc123");
    await sw.navigate("/settings?google=linked");
    expect(sw.pages().some((u) => u.includes("token") || u.includes("reset-password"))).toBe(false);
    expect(sw.pages()).toContain(`${ORIGIN}/settings`);
    expect(sw.pages().some((u) => u.includes("?"))).toBe(false);
  });

  it("offline, falls back to the sign-in page for an unvisited guest path, never the app shell", async () => {
    const sw = await boot(network);
    online = false;
    const res = await sw.navigate("/auth/sign-up");
    expect(await res!.text()).toBe("page /auth/sign-in");
  });

  it("offline, falls back to the Day tab for an unvisited app path", async () => {
    const sw = await boot(network);
    online = false;
    expect(await (await sw.navigate("/groceries"))!.text()).toBe("page /");
  });

  it("offline, answers a visited page from its own cached copy", async () => {
    const sw = await boot(network);
    await sw.navigate("/recipes");
    online = false;
    expect(await (await sw.navigate("/recipes?x=1"))!.text()).toBe("fresh /recipes");
  });

  it("offline, with nothing cached, answers the plain offline page", async () => {
    const sw = await boot(async () => {
      throw new TypeError("Failed to fetch");
    });
    const res = await sw.navigate("/auth/sign-up");
    expect(await res!.text()).toContain("You are offline.");
  });

  it("keeps at most 50 pages, and always the two fallbacks", async () => {
    const sw = await boot(network);
    for (let i = 0; i < 70; i++) await sw.navigate(`/recipes/${i}`);
    expect(sw.pages()).toHaveLength(50);
    expect(sw.pages()).toEqual(expect.arrayContaining([`${ORIGIN}/`, `${ORIGIN}/auth/sign-in`]));
    expect(sw.pages()).toContain(`${ORIGIN}/recipes/69`);
    expect(sw.pages()).not.toContain(`${ORIGIN}/recipes/0`);
  });

  it("trims the asset cache to 300 after each new asset", async () => {
    const sw = await boot(network);
    for (let i = 0; i < 310; i++) await sw.asset(`/_next/static/chunks/${i}.js`);
    expect(sw.assets()).toHaveLength(300);
    expect(sw.assets()).toContain(`${ORIGIN}/_next/static/chunks/309.js`);
  });

  it("handles nothing under /api/", async () => {
    const sw = await boot(network);
    expect(await sw.navigate("/api/auth/google/complete?code=x")).toBeUndefined();
  });
});
