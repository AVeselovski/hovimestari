// ---------------------------------------------------------------------------
// After the account is deleted, this device keeps nothing of it. The query
// cache goes with the signed-in tree, and the session marker with the
// sign-out. This clears the last trace: the service worker's cached copies
// of signed-in pages. They hold no user data, but they are the app of an
// account that no longer exists. Guest pages stay cached, so the sign-in
// page still opens offline.
// ---------------------------------------------------------------------------

/** The service worker's page caches, whatever their version (public/sw.js). */
export const PAGE_CACHE_PREFIX = "hovi-pages-";

function isGuestPath(pathname: string): boolean {
  return pathname === "/auth" || pathname.startsWith("/auth/");
}

/** Deletes every cached signed-in page. Never throws: a browser without caches has nothing to clear. */
export async function forgetSignedInPages(): Promise<void> {
  try {
    if (typeof caches === "undefined") return;
    const names = (await caches.keys()).filter((name) => name.startsWith(PAGE_CACHE_PREFIX));
    for (const name of names) {
      const cache = await caches.open(name);
      const keys = await cache.keys();
      await Promise.all(keys.filter((req) => !isGuestPath(new URL(req.url).pathname)).map((req) => cache.delete(req)));
    }
  } catch {
    // Storage refused or unavailable: nothing more to do.
  }
}
