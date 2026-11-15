// Hovimestari's service worker. Hand-written and small on purpose: it needs
// no build step and works with Turbopack builds.
//
// What it does:
// - Same-origin GET requests only. Never anything under /api/, so no session
//   call or user data is ever cached or answered from a cache.
// - Page navigations: network first. A page that answers normally is cached
//   under its path, without the query string. A guest page under /auth/ with
//   a query string is never cached, because its query can hold a reset token.
//   The page cache keeps the 50 most recent pages.
// - Offline, a page answers from the cache: its own path, else its side's
//   fallback, else a one-line offline page. An app path falls back to the
//   cached Day tab ("/"). A guest path under /auth/ falls back to the cached
//   sign-in page, never to the app shell.
// - Build assets and fonts (/_next/static/): cache first. They are content
//   hashed, so a cached copy never goes stale.
// - The manifest and the icons: stale while revalidate. They keep one name
//   across deploys, so the cached copy answers at once and a fresh one is
//   fetched in the background for next time. A changed name, colour or icon
//   reaches an installed app on its next launch.
// - The asset cache keeps the 300 most recent entries, trimmed after each new
//   one, because deploys do not change CACHE_VERSION. The manifest and icons
//   are never trimmed.
//
// Signed-in pages carry no user data in their HTML, which is what makes
// caching them safe. Whether the app or the guest side shows offline is the
// page's own choice (AuthGuard), made from a non-secret marker on the device.
//
// Bump CACHE_VERSION whenever this file's logic changes. Activation deletes
// every cache from another version.
const CACHE_VERSION = "v3";
const PAGE_CACHE = `hovi-pages-${CACHE_VERSION}`;
const ASSET_CACHE = `hovi-assets-${CACHE_VERSION}`;
const PAGE_CACHE_LIMIT = 50;
const ASSET_CACHE_LIMIT = 300;
const APP_FALLBACK = "/";
const GUEST_FALLBACK = "/auth/sign-in";
const PRECACHE_PAGES = [APP_FALLBACK, GUEST_FALLBACK];
const PRECACHE_ASSETS = ["/manifest.webmanifest", "/icon-192.png", "/icon-512.png"];

// Shown only when the device is offline and no page fits. A worker cannot read
// the app's message catalog or its stylesheet, so this one line is written
// here. Its words match `shell.offline` in messages/en.json and its colours
// the page background and ink tokens in globals.css, in both themes.
// src/app/__tests__/themeColors.test.ts checks the colours against the tokens.
const OFFLINE_PAGE =
  '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Hovimestari</title>' +
  "<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;font:1rem system-ui,sans-serif;background:#f6efe1;color:#1d2e22}" +
  "@media (prefers-color-scheme: dark){body{background:#121a15;color:#ece4d2}}</style></head>" +
  "<body><p>You are offline.</p></body></html>";

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const pages = await caches.open(PAGE_CACHE);
      const assets = await caches.open(ASSET_CACHE);
      // One missing file must not stop the worker installing.
      await Promise.all([
        ...PRECACHE_PAGES.map((url) => pages.add(url).catch(() => undefined)),
        ...PRECACHE_ASSETS.map((url) => assets.add(url).catch(() => undefined)),
      ]);
      await self.skipWaiting();
    })(),
  );
});

/**
 * Drops the oldest entries until the cache holds at most `limit`, never one
 * whose path is in `keep`. Only kept paths actually in the cache count towards
 * the limit. Cache keys keep insertion order.
 */
async function trim(cache, limit, keep = []) {
  const all = await cache.keys();
  const droppable = all.filter((key) => !keep.includes(new URL(key.url).pathname));
  const excess = all.length - limit;
  if (excess > 0) await Promise.all(droppable.slice(0, excess).map((key) => cache.delete(key)));
}

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([PAGE_CACHE, ASSET_CACHE]);
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => !keep.has(key)).map((key) => caches.delete(key)));
      await self.clients.claim();
    })(),
  );
});

function isGuestPath(pathname) {
  return pathname === "/auth" || pathname.startsWith("/auth/");
}

/** The manifest and the icons: same name on every deploy. */
function isAppIdentity(pathname) {
  return /^\/icon-\d+\.png$/.test(pathname) || pathname === "/manifest.webmanifest";
}

async function networkFirstPage(request) {
  const url = new URL(request.url);
  const cache = await caches.open(PAGE_CACHE);
  try {
    const fresh = await fetch(request);
    // Only a plain page from this site: never a redirect or an error page,
    // and never a guest page whose query string may hold a token.
    const cacheable = fresh.ok && fresh.type === "basic" && !fresh.redirected;
    if (cacheable && !(isGuestPath(url.pathname) && url.search)) {
      // Re-put moves the path to the end, so trimming drops the least recent.
      await cache.delete(url.pathname);
      await cache.put(url.pathname, fresh.clone());
      await trim(cache, PAGE_CACHE_LIMIT, PRECACHE_PAGES);
    }
    return fresh;
  } catch {
    const fallback = isGuestPath(url.pathname) ? GUEST_FALLBACK : APP_FALLBACK;
    const cached = (await cache.match(url.pathname)) ?? (await cache.match(fallback));
    return cached ?? new Response(OFFLINE_PAGE, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  }
}

async function fetchAndCacheAsset(cache, request) {
  const fresh = await fetch(request);
  if (fresh.ok) {
    await cache.put(request, fresh.clone());
    await trim(cache, ASSET_CACHE_LIMIT, PRECACHE_ASSETS);
  }
  return fresh;
}

async function cacheFirstAsset(request) {
  const cache = await caches.open(ASSET_CACHE);
  return (await cache.match(request)) ?? fetchAndCacheAsset(cache, request);
}

/** Answers from the cache when it can, and refreshes the copy in the background. */
async function staleWhileRevalidate(event) {
  const cache = await caches.open(ASSET_CACHE);
  const cached = await cache.match(event.request);
  if (!cached) return fetchAndCacheAsset(cache, event.request);
  // Offline, the refresh fails quietly and the cached copy stays.
  event.waitUntil(fetchAndCacheAsset(cache, event.request).catch(() => undefined));
  return cached;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirstPage(request));
    return;
  }
  if (isAppIdentity(url.pathname)) {
    event.respondWith(staleWhileRevalidate(event));
  } else if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirstAsset(request));
  }
});
