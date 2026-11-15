# Google sign-in

The backend signs people in with Google through an OAuth 2.0 client, and the same client links Google to an account that has a password. This runbook creates the client and fills in `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL` and `GOOGLE_LINK_CALLBACK_URL` in `apps/backend/.env`. Google is optional: with the four values empty the backend runs without it, and `GET /api/v1/auth/providers` tells the web app to show no Google button.

You need a Google account and the [Google Cloud Console](https://console.cloud.google.com/).

## Steps

### 1. Select or create a project

In the top-left dropdown, pick a project or click **New Project** and name it, for example "Hovimestari".

### 2. Configure the consent screen

1. Left sidebar, **APIs & Services**, then **OAuth consent screen**. On a project without one, click **Get started**.
2. **App Information**: the app name, for example "Hovimestari", and your email as the support email. **Next**.
3. **Audience**: **External**. **Next**.
4. **Contact Information**: your email. **Next**.
5. **Finish**: agree to the policy, **Continue**, then **Create**.
6. Open **Audience**. Leave the publishing status at **Testing**, and under **Test users** add the Google accounts you will sign in with.

### 3. Create the client

1. **APIs & Services**, then **Credentials**, then **Create Credentials**, then **OAuth client ID**.
2. Application type **Web application**, any name.
3. Under **Authorised redirect URIs** add both:

   ```text
   http://localhost:3001/api/v1/auth/google/callback
   http://localhost:3001/api/v1/auth/link/google/callback
   ```

   The first finishes a sign-in, the second finishes linking Google. Each must match its value in `.env` exactly.

4. Click **Create**.

### 4. Fill in the env file

The dialog shows the client ID and the client secret. Paste them after `GOOGLE_CLIENT_ID=` and `GOOGLE_CLIENT_SECRET=` in `apps/backend/.env`, and set the two callbacks:

```env
GOOGLE_CALLBACK_URL=http://localhost:3001/api/v1/auth/google/callback
GOOGLE_LINK_CALLBACK_URL=http://localhost:3001/api/v1/auth/link/google/callback
```

The backend refuses to start with some of the four set and others empty. Restart it.

## Check it works

```bash
curl -s http://localhost:3001/api/v1/auth/providers
# {"google":true}
```

A browser that opens `http://localhost:3001/api/v1/auth/google` without the web app's `bind` value is sent to `FRONTEND_URL` at `/auth/sign-in?error=google_failed`. That is expected: a sign-in only finishes when it starts from the web app, which keeps the nonce it is bound to. A full sign-in needs the web app.

## Before production

- Add both production callback URLs under **Authorised redirect URIs**, on the backend's production host.
- On **Audience**, click **Publish app**, or keep **Testing** and maintain the test user list.
- Set the four values as Fly secrets, as [the Fly runbook](fly-backend.md) says, with the callbacks matching the URIs in the console.
