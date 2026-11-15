# Installable app

Hovimestari installs to a phone's home screen and opens like an app, without the browser's address bar. Once opened, it opens again without a network connection and says plainly that it is offline.

## In detail

### Installing

On Android the browser offers to install the app. On an iPhone, Safari's Share menu has **Add to Home Screen**. The installed app opens full screen with its own icon and the name Hovimestari. The status bar at the top and the home indicator at the bottom keep clear of the app's header and tab bar.

### Without a network

On a device that was signed in, a tab opened once opens again offline. The header, the tabs and the page frame load from the device, and a line under the header says "You are offline." It never covers the screen. Nobody is signed out because the network went away. When the connection returns the line goes and the app carries on.

On a device that was signed out, or never signed in, the app does not open offline. Any address shows the sign-in side instead: the sign-in page if it was cached, or a page titled "You are offline" that says "Sign in once you are back online."

The app shows no user data offline yet, because no tab holds any. Signing in, signing up and anything else that needs the server wait for the connection.

## How it works

### The manifest

`apps/web/src/app/manifest.ts` serves the web manifest at `/manifest.webmanifest`: name and short name "Hovimestari", `display: standalone`, start URL and scope `/`, the paper background as the splash colour, and the 192 and 512 pixel icons, each listed once for any use and once as maskable. The root layout adds the Apple web app tags, with the default status bar style.

### The service worker

`apps/web/public/sw.js` is a small hand-written worker. It is registered by `ServiceWorkerRegistration` in production builds only, so the development server's hot reload is never intercepted.

- It handles only `GET` requests to the app's own origin, and never anything under `/api/`. No session call and no user data passes through its caches.
- A page navigation goes to the network first. Every page that answers normally is cached under its path, without the query string. A guest page under `/auth/` with a query string is never cached, because a reset link's query holds its token. The page cache keeps the 50 most recent pages.
- Offline, a page answers from its own cached path. Otherwise an app path falls back to the cached Day tab and a guest path to the cached sign-in page, never to the app. With nothing cached, a one-line offline page answers, in the device's light or dark scheme.
- Build assets under `/_next/static/`, fonts included, the icons and the manifest are served from the cache first. Build assets are content hashed, so a cached copy never goes stale. The asset cache keeps 300 entries, trimmed after each new one, because a deploy does not change the worker.
- Installing caches the Day tab, the sign-in page, the manifest and the icons. Activating deletes the caches of every other version.
- `CACHE_VERSION` at the top of the file is bumped by hand whenever its logic changes.

Caching pages is safe because no signed-in page puts user data in its server-rendered HTML. Every signed-in page renders on the device, behind the session. Every later step keeps it so.

The offline page is the one piece of copy outside the message catalog, and its colours the one place outside the tokens, because a worker can read neither. `src/app/__tests__/themeColors.test.ts` holds its colours to the tokens. `src/app/__tests__/serviceWorker.test.ts` runs the worker itself.

### Offline state

`useOnlineStatus` reads the browser's own online flag. The auth context reports `offline` when the server cannot be reached even though the browser thinks it is online. The offline line shows for either.

Whether the app or the sign-in side shows offline is `AuthGuard`'s choice, made from the known-session flag the auth context keeps on the device. [The authentication doc](authentication.md#the-browser-session-through-the-web-server) describes it.

### Safe areas

The viewport uses `viewport-fit=cover`, so the app draws under the status bar and the home indicator and pads itself clear of them. `apps/web/src/app/globals.css` turns the device's insets into the tokens `--safe-top`, `--safe-right`, `--safe-bottom` and `--safe-left`. The header, the tab bar and the side rail read those tokens, and nothing else reads the insets. `src/app/__tests__/safeAreas.test.ts` fails when another file does.

### Known gaps

- Installing, the status bar and the safe areas are checked in an emulator only. A real iPhone check is open.
- Google sign-in from the installed app on an iPhone may finish in a browser sheet that holds its own cookies, which would leave the app signed out. Password sign-in works there either way.

Requirements: NFR-PWA-01, NFR-PWA-02 (requirements 4)

## Where it appears

- [The app shell](../app/shell.md): the offline line under the header, and the safe-area padding.
