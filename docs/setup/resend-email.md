# Resend email

The backend sends one email, the password reset link, through Resend. This runbook gets an API key for `RESEND_API_KEY` and a sender for `EMAIL_FROM`. Without a key, development writes each mail to the backend's console, so local work needs none of this. Production refuses to start without it.

You need a [Resend account](https://resend.com/). The free tier is enough.

## Steps

1. Sign up at [resend.com](https://resend.com/).
2. Choose a sending domain. For a local test, use Resend's shared test domain. It needs no verification, delivers only to the address that owns the Resend account, and the sender must be `onboarding@resend.dev`. For production, add your own domain under **Domains**, add the DNS records Resend shows at your DNS provider, and click **Verify** once they have propagated.
3. Under **API Keys**, click **Create API Key**. Name it, for example "Hovimestari local", give it **Sending access**, click **Add** and copy the key. Resend shows it only once.
4. Put both values in `apps/backend/.env`. Paste the key you just copied after `RESEND_API_KEY=`, and set the sender:

   ```env
   EMAIL_FROM=onboarding@resend.dev
   ```

5. Restart the backend.

## Check it works

Sign up with a password, using the address that owns the Resend account, then ask for a reset link. Sign-up answers only the web server, so the first command presents the relay secret from your env file. The password is generated, because the test never signs in with it. Run both from the repository root:

```bash
EMAIL=your-resend-account-address@example.com
curl -s -X POST http://localhost:3001/api/v1/auth/register \
  -H 'Content-Type: application/json' \
  -H "X-Bff-Secret: $(grep '^BFF_SECRET=' apps/backend/.env | cut -d= -f2)" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$(openssl rand -hex 12)\"}"
curl -s -X POST http://localhost:3001/api/v1/auth/forgot-password \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\"}"
# {"message":"If an account exists, a reset email has been sent."}
```

The answer is the same whether or not a mail went out, so check the inbox or the [Resend logs](https://resend.com/emails). A send that Resend refuses, such as from an unverified sender, is logged by the backend as `[auth] password reset mail failed`.

## Before production

- Verify your own sending domain and set `EMAIL_FROM` to an address on it.
- Create a production key with **Sending access**. Set it and the sender as Fly secrets, as [the Fly runbook](fly-backend.md) says.
- Check `FRONTEND_URL` on Fly. The reset link in the mail is built from it.
