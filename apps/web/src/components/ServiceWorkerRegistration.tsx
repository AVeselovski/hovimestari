"use client";

import { useEffect } from "react";

/**
 * Registers the service worker (public/sw.js) in production builds only, so
 * the dev server's hot reload is never intercepted.
 */
export function ServiceWorkerRegistration(): null {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // No worker: the app still works online.
    });
  }, []);
  return null;
}
