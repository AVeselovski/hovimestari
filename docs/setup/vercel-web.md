# Vercel web app

This runbook puts the web app on Vercel: one project, `hovimestari`, serving `apps/web` at `https://hovimestari.vercel.app` and deploying every push to `master`. Artur runs it by hand, once, after [the Fly runbook](fly-backend.md), because the web app relays sign-in to that backend. The end state is the production URL showing the sign-in page, and a new account reaching the Day tab.

## Steps

### 1. Prepare

1. Check the backend answers:

   ```bash
   curl -s https://hovimestari-backend.fly.dev/health
   # {"status":"ok","db":"ok"}
   ```

2. Have the `BFF_SECRET` value from the Fly runbook to hand, in your password manager. The web app must present the same value.
3. Sign in at [vercel.com](https://vercel.com) with the GitHub account that can read the repository.

### 2. Import the repository

1. Open [vercel.com/new](https://vercel.com/new) and import the Hovimestari repository. If it is not listed, choose **Adjust GitHub App Permissions** and grant Vercel this one repository.
2. On **Configure Project**:
   - **Project Name**: `hovimestari`. This sets the URL `hovimestari.vercel.app`.
   - **Framework Preset**: Next.js, detected.
   - **Root Directory**: `apps/web`. Leave **Include files outside the root directory** on, because the app builds `packages/types` from the workspace.
   - Leave the install and build commands as they are. Vercel finds pnpm from the lockfile.
3. Do not deploy yet. A build without the variables below bakes a missing API address into the page.

### 3. Set the environment variables

Under **Environment Variables**, add:

| Name                  | Value                                        | Environments                     |
| --------------------- | -------------------------------------------- | -------------------------------- |
| `NEXT_PUBLIC_API_URL` | `https://hovimestari-backend.fly.dev/api/v1` | Production, Preview, Development |
| `BACKEND_URL`         | `https://hovimestari-backend.fly.dev`        | Production, Preview, Development |
| `BFF_SECRET`          | the value from your password manager         | **Production only**              |

- `NEXT_PUBLIC_API_URL` ends in `/api/v1`. The browser calls the backend with it, and it is built into the page.
- `BACKEND_URL` has no `/api/v1`. Only the app's own route handlers read it, on Vercel's servers.
- `BFF_SECRET` is scoped to Production only, so no preview deployment ever holds it. A preview therefore cannot sign anyone in, which is expected.
- Do not set `LOCAL_PRODUCTION_RELAY` on Vercel. It is for a production build on a developer's machine, and Vercel ignores it anyway.
- Leave **Automatically expose System Environment Variables** on, under **Settings**, then **Environment Variables**. It provides `VERCEL`, which is what makes the app ignore `LOCAL_PRODUCTION_RELAY`.

Then choose **Deploy**.

### 4. Set the production branch

Vercel assumes `main`. This repository's branch is `master`.

1. Open the project's **Settings**, then **Git**, then **Production Branch**.
2. Change it to `master` and save.
3. Open **Deployments**, then the latest deployment's menu, and choose **Redeploy**, without the build cache.

### 5. Let the backend accept the web app

The backend answers the browser only from its own origin list, and sends people back to the web app after Google and in reset mails. If the production URL differs from the `$WEB_ORIGIN` the Fly runbook used, set it on Fly:

```bash
export WEB_ORIGIN=https://hovimestari.vercel.app
flyctl secrets set -a hovimestari-backend CORS_ORIGIN=$WEB_ORIGIN FRONTEND_URL=$WEB_ORIGIN
```

Google needs no change here. Its redirect addresses are the backend's, set in [the Google sign-in runbook](google-sign-in.md).

### Rotating BFF_SECRET

The value lives on Fly and on Vercel, which cannot change at the same moment:

1. On Fly, set the new value as `BFF_SECRET` and the old one as `BFF_SECRET_PREVIOUS`, as [the Fly runbook](fly-backend.md#rotating-bff_secret) says.
2. On Vercel, open **Settings**, then **Environment Variables**, edit `BFF_SECRET` to the new value, still Production only, and redeploy. A variable change takes effect only with a new deployment.
3. On Fly, remove `BFF_SECRET_PREVIOUS`.

## Check it works

1. Open `https://hovimestari.vercel.app`. It sends you to the sign-in page.
2. Choose **Create an account**, sign up, and land on the Day tab.
3. Reload. You stay signed in.
4. In Settings, choose **Sign out**. You are back on the sign-in page.
5. Ask for a reset link for your address. The mail arrives through Resend, and its link opens **Choose a new password** on this site.
6. Check the security headers:

   ```bash
   curl -sI https://hovimestari.vercel.app/auth/sign-in | grep -iE 'referrer-policy|x-content-type-options'
   # referrer-policy: strict-origin-when-cross-origin
   # x-content-type-options: nosniff
   ```

When sign-in answers "Hovimestari cannot be reached right now", the web app cannot reach the backend: check that `BACKEND_URL` names the Fly app and that the health check above answers. When it answers "Something went wrong", the relay is missing a setting or is refused: check that `BACKEND_URL` and `BFF_SECRET` are both set for Production, that `BFF_SECRET` matches Fly's, and that the deployment was made after they were set.

## Before production

- Choose a domain. On the default `vercel.app` and `fly.dev` hosts the app works, because the refresh cookie belongs to the web app's own host. A custom domain changes `CORS_ORIGIN` and `FRONTEND_URL` on Fly, and the URL above.
- Install the app on a real iPhone and check the safe areas, the status bar and Google sign-in from the installed app.
- Keep `BFF_SECRET` out of Preview and Development for as long as previews are open to anyone with the link.
