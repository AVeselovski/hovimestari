// Minimal hand-written service worker for Hovimestari.
// Bump CACHE_VERSION whenever index.html structure or cached precache list changes.
const CACHE_VERSION = "v1";
const ASSET_CACHE = `hovi-assets-${CACHE_VERSION}`;
const SHELL_CACHE = `hovi-shell-${CACHE_VERSION}`;
const PRECACHE = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
  "/fonts/fraunces-var.woff2",
  "/fonts/instrument-sans-var.woff2",
  "/fonts/jetbrains-mono-var.woff2",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      const keep = new Set([ASSET_CACHE, SHELL_CACHE]);
      await Promise.all(keys.filter((k) => !keep.has(k)).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Never cache API calls — stale household state is dangerous.
  if (url.pathname.startsWith("/api/")) {
    return;
  }

  // Navigation: network-first, fall back to cached shell. Refresh the cached
  // shell on every successful navigation so future deploys self-heal (#7).
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          if (fresh.ok) {
            const cache = await caches.open(SHELL_CACHE);
            cache.put("/index.html", fresh.clone());
          }
          return fresh;
        } catch {
          const cache = await caches.open(SHELL_CACHE);
          const cached = await cache.match("/index.html");
          return cached ?? Response.error();
        }
      })(),
    );
    return;
  }

  // Static assets: stale-while-revalidate. Guard against `undefined` returns
  // when neither cache nor network resolves (#4).
  event.respondWith(
    (async () => {
      const cache = await caches.open(ASSET_CACHE);
      const cached = await cache.match(req);
      const network = fetch(req)
        .then((res) => {
          if (res.ok) cache.put(req, res.clone());
          return res;
        })
        .catch(() => cached ?? Response.error());
      return cached ?? network;
    })(),
  );
});
