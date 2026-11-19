# Scan check: the camera prototype

`/scan-check` is a throwaway page on the branch `spike/scan-check`, which never merges. It proves on a real iPhone that the camera and the barcode decoder work, before the scanner slice is built. It follows [the camera part of the barcode design](barcode.md#part-2-the-camera-fr-scan-01): `zxing-wasm` 3.1.7's reader, loaded when the camera starts, with its wasm served by this app.

## What the page does

- **Start camera** asks for the rear camera, with no audio, at an ideal 1280x720. The video plays inline. The decoder loads at the same time.
- About every 150 ms the page draws the middle half of the frame's height into a canvas at most 960 pixels wide and decodes it for EAN-13, EAN-8, UPC-A and UPC-E with `tryHarder`. The red lines on the video mark that band. Aim the barcode between them.
- It keeps reading after a read, so several products can be tried in a row. The same number is logged again only after 1.5 seconds.
- **Stop camera** stops every track. So do hiding the page, `pagehide` and the track ending by itself. Each stop is a log line saying why and how many tracks stopped.
- The log is newest first, each line with a clock time to the millisecond. The shaded line on top is the decode rate, updated every second.
- **Copy log** puts the whole log on the clipboard.
- The page needs no sign-in and no backend.

What differs from master on this branch:

- `next.config.ts` sends `Permissions-Policy: camera=(self), microphone=(), geolocation=()` on every route, the header the scanner slice will ship. The phone proves the camera works with it in place.
- The manifest's `start_url` is `/scan-check`, so the installed app opens this page.
- `apps/web/eslint.config.js` lets the page's own files skip the message catalog.

## Steps for Artur

These assume [the local HTTPS runbook](../setup/local-https.md) has been run once: mkcert's root is trusted on the phone and the certificate is in `tools/local-https/certs/`. If the Mac's address changed since, follow its "When the address changes" section first.

1. On the Mac, from the repository root, get the branch and its packages:

   ```bash
   git fetch origin
   git switch spike/scan-check
   pnpm install
   ```

2. Find the Mac's address. It prints something like `192.168.1.23`. The steps below write `<address>` for it.

   ```bash
   ipconfig getifaddr en0
   ```

3. Build the web app and start it. The production build is needed for the installed app, and the browser tab uses the same one. The backend does not need to run.

   ```bash
   pnpm --filter @hovimestari/web build
   LOCAL_PRODUCTION_RELAY=1 pnpm --filter @hovimestari/web start
   ```

   It listens on port 3000. Stop any development web server first, because it uses the same port.

4. In a second terminal, from the repository root, start Caddy. It serves the web app at `https://<address>:3443`.

   ```bash
   caddy run --config tools/local-https/Caddyfile
   ```

5. On the iPhone, in Safari, open `https://<address>:3443/scan-check`.

If the app is already on the Home Screen from `https://<address>:3443`, delete it before the installed check, because it opens the Day tab and not this page.

## What the phone must show

**1. Safari.** Tap **Start camera**. Safari asks for the camera. Allow it. The rear camera shows inside the page, not full screen. Hold a real EAN-13, on a tub or a can, about a hand's width from the lens, between the red lines. A line that starts with `Read` and the product's digits appears within about two seconds. Try two or three more products.

**2. The installed app.** In Safari on the same page, tap the share button, then **Add to Home Screen**, then **Add**. Open the app from the Home Screen. The log has the line `Running as: installed app (standalone).` Do the same as in check 1. Then close the app fully: swipe up from the bottom edge, hold, and swipe the app away. Open it again and tap **Start camera**. Note whether it asks for the camera again, and whether the video freezes.

**3. The camera indicator.** While the camera runs, the green dot shows at the top of the screen. Tap **Stop camera**. The dot goes off within a second or two. Start the camera again and switch to another app. Come back. The log says the stream stopped by `visibilitychange to hidden`, and the dot went off while you were away.

After each check, tap **Copy log** and paste the text back into the chat.

## When the testing ends

1. Stop Caddy and the web server with Ctrl+C in each terminal.
2. Delete the scan check app from the Home Screen.
3. Go back to master:

   ```bash
   git switch master
   pnpm install
   ```
