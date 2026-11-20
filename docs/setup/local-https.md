# Local HTTPS

This runbook serves the local web app and backend over https on your home network, so an iPhone on the same Wi-Fi opens the app from a secure origin. A phone's camera needs one. It is for a Mac with Homebrew, run by hand once, after [the local development runbook](local-development.md). Nothing leaves your network. mkcert makes a certificate from a root of its own, which the phone trusts once, and Caddy serves https in front of the two servers.

## Steps

1. Install mkcert and Caddy, then put mkcert's root in the Mac's trust store. macOS asks for your password.

   ```bash
   brew install mkcert caddy
   mkcert -install
   ```

   `mkcert -install` ends with `The local CA is now installed in the system trust store!`

2. Find the Mac's address on the network and its local name.

   ```bash
   ipconfig getifaddr en0
   scutil --get LocalHostName
   ```

   The first prints the address, such as `192.168.1.23`. If it prints nothing, Wi-Fi is on another interface, so run `ipconfig getifaddr en1`. If that prints nothing too, `ifconfig | grep "inet "` lists every address, and the one that starts like your router's is the Mac's. The second prints the name, such as `Arturs-MacBook-Pro`. The local name is that name with `.local` after it. The steps below write `<address>` and `<name>.local` for the two.

3. Make the certificate. From the repository root:

   ```bash
   mkdir -p tools/local-https/certs
   mkcert -cert-file tools/local-https/certs/dev.pem -key-file tools/local-https/certs/dev-key.pem <address> <name>.local localhost 127.0.0.1
   ```

   It lists the four names and says `The certificate is at "tools/local-https/certs/dev.pem"`. Git ignores `tools/local-https/certs/`, so the certificate and its key are never committed.

4. Send mkcert's root to the iPhone. This opens the folder that holds it:

   ```bash
   open "$(mkcert -CAROOT)"
   ```

   AirDrop `rootCA.pem` to the iPhone. Never send `rootCA-key.pem`. The phone says the profile is downloaded. Tap **Close**.

5. Install the profile on the iPhone. Open **Settings**, then **General**, then **VPN & Device Management**. Under **Downloaded Profile**, tap the profile whose name starts with `mkcert`. Tap **Install**, enter the passcode and tap **Install** again.

6. Turn on full trust for the root. Open **Settings**, then **General**, then **About**, then **Certificate Trust Settings**. Under **Enable Full Trust for Root Certificates**, turn on the switch for the `mkcert` root and tap **Continue**. Without this switch the phone shows a certificate warning on every page.

7. Point the apps at the https addresses. In `apps/web/.env.local`:

   ```bash
   NEXT_PUBLIC_API_URL=https://<address>:3444/api/v1
   NEXT_DEV_ORIGINS=<address>
   ```

   In `apps/backend/.env`, add `https://<address>:3443` to `CORS_ORIGIN`, comma separated after the localhost origin. `BACKEND_URL` stays `http://localhost:3001`, because the web server reaches the backend on this machine.

   The setup steps for an AI assistant in Settings then show the https address too. An assistant on the Mac needs another one, as [An assistant on the Mac](#an-assistant-on-the-mac) says.

8. Start the backend and the web app as steps 7 and 8 of [the local development runbook](local-development.md) say. Both read these values at start, so restart a server that is already running.

9. Start Caddy in a third terminal, from the repository root:

   ```bash
   caddy run --config tools/local-https/Caddyfile
   ```

   It logs `serving initial configuration` and keeps running. If macOS asks whether `caddy` may accept incoming network connections, choose **Allow**. Caddy serves the web app at `https://<address>:3443` and the backend at `https://<address>:3444`. The page calls the backend directly, so both need https.

10. Open `https://<address>:3443` on the phone, in Safari or in Chrome. The page loads with no certificate warning. Sign in with an email address and a password, or create an account.

### Google sign-in

Google sign-in does not work from the phone over this setup. Email and password do. After Google's consent screen, Google sends the browser to `GOOGLE_CALLBACK_URL`, and the backend then sends it on to `FRONTEND_URL`. Both point at `localhost`, which on the phone is the phone itself. Google accepts a callback on `localhost` or on a public domain over https, and neither an address like `192.168.1.23` nor a `.local` name is one, so no setting makes it work here.

`FRONTEND_URL` also builds the reset links the backend prints in its console. A reset link opens on the Mac. To open one on the phone, replace `http://localhost:3000` in it with `https://<address>:3443`.

### An assistant on the Mac

With `NEXT_PUBLIC_API_URL` on the https address, the setup steps under [Connected AI](../app/settings.md#connected-ai) in Settings show the server as `https://<address>:3444/mcp`. An assistant on the Mac cannot connect to it. Claude Desktop reaches the server through `mcp-remote`, a Node program, and Node does not read the Mac's keychain, where mkcert's root is. Claude Desktop then fails to connect, and its log says `unable to verify the first certificate`, with the code `UNABLE_TO_VERIFY_LEAF_SIGNATURE`.

An assistant on the same Mac as the backend uses `http://localhost:3001/mcp` in place of the address the steps show. The key stays the same. For Claude Desktop:

1. Copy the Claude Desktop entry from Settings and add it to Claude's config file, as the steps there say. The file is `~/Library/Application Support/Claude/claude_desktop_config.json`.
2. In the `hovimestari` entry's `args`, replace `https://<address>:3444/mcp` with `http://localhost:3001/mcp`. Leave the `env` block with `AUTH_HEADER` as it is.
3. Save the file. Quit Claude Desktop and open it again.

Ask Claude for today's figures to check it. With a read-and-write key, an entry it logs shows under **Activity** on the key's row in Settings.

For Claude Code, put `http://localhost:3001/mcp` in place of the https address in the `claude mcp add` command. That has not been tried with this setup yet. The localhost address stays the same when the network address changes, so the entry needs no change then.

### When the address changes

The router can give the Mac another address, for example after a restart. The phone then cannot reach the old one. Run step 2 again, then steps 3 and 7 with the new address, then restart the servers as step 8 says and Caddy as step 9 says. The root on the phone stays trusted, so steps 4 to 6 are not needed again.

The certificate also holds `<name>.local`, which stays the same when the address changes. To use the name instead of the address, write `<name>.local` everywhere step 7 writes `<address>` and open `https://<name>.local:3443` on the phone. If the phone does not find the name, use the address.

### The installed app

The development server registers no service worker, so installing the app to the Home Screen needs a production build. A production build has `NEXT_PUBLIC_API_URL` built in, so build after step 7, and build again whenever that value changes. Stop the development web server first, because the production server uses the same port.

```bash
pnpm --filter @hovimestari/web build
LOCAL_PRODUCTION_RELAY=1 pnpm --filter @hovimestari/web start
```

[The web app's README](../../apps/web/README.md#running-a-production-build-locally) says what the flag does. In Safari on the phone, open `https://<address>:3443`, tap the share button and then **Add to Home Screen**. The installed app belongs to the address it was installed from. An app installed from `http://<address>:3000` is a separate app with its own sign-in, so delete it and install again from the https address. A new address in [When the address changes](#when-the-address-changes) also means a new install.

### Going back to plain http

1. Stop Caddy with Ctrl+C.
2. Set `NEXT_PUBLIC_API_URL` back to `http://<address>:3001/api/v1` and `CORS_ORIGIN` back to the http origins, as step 9 of [the local development runbook](local-development.md) says.
3. Restart both servers, or build the web app again for a production build.
4. On the phone, open **Settings**, then **General**, then **VPN & Device Management**, tap the `mkcert` profile and tap **Remove Profile**.

A production build marks its session cookie `Secure`, so over plain http it signs in on `localhost` only. Use the development server for the phone over plain http.

## Check it works

On the phone, open `https://<address>:3443` and sign in with an email address and a password. The Day tab shows. Tap **Log food**, type a name such as `Porridge`, choose **Add “Porridge” as an estimate**, fill in the four figures and tap **Save estimate**. The entry shows on the day, which proves the page reaches the backend over https.

Safari and Chrome on the iPhone use the same trust settings. A page with no certificate warning in either has a secure context. To read it from the page itself, use Safari's Web Inspector:

1. On the iPhone, open **Settings**, then **Apps**, then **Safari**, then **Advanced**, and turn on **Web Inspector**. Before iOS 18 the path is **Settings**, then **Safari**, then **Advanced**.
2. On the Mac, open Safari, then **Safari**, **Settings**, **Advanced**, and turn on **Show features for web developers**.
3. Connect the iPhone to the Mac with a cable and open the app in Safari on the phone, or open the installed app.
4. In Safari on the Mac, open the **Develop** menu, then the iPhone's name, then the page.
5. In the inspector's console, type `window.isSecureContext`. It prints `true`.

On the Mac, the same checks run from a terminal. The first prints `{"status":"ok","db":"ok"}`. The second prints `{"message":"The session has ended.","code":"session_expired"}`, which means the web app's same-origin guard accepted the call from the https origin.

```bash
curl -s https://<address>:3444/health
curl -s -X POST https://<address>:3443/api/auth/refresh -H 'Origin: https://<address>:3443'
```

## Before production

- This setup is for development on your own network. Production is served over https by Vercel and Fly and needs none of it.
- mkcert's root key, `rootCA-key.pem` in the folder `mkcert -CAROOT` prints, can make a certificate for any name that the phone and the Mac trust. It stays on the Mac. It is never committed, never sent and never copied to another machine.
- Remove the profile from the phone when the testing ends, as [Going back to plain http](#going-back-to-plain-http) says. `mkcert -uninstall` removes the root from the Mac.
