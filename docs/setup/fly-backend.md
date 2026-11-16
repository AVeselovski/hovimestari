# Fly backend

This runbook puts the backend on Fly.io: one app, `hovimestari-backend`, in region `arn` (Stockholm) on one `shared-cpu-1x` machine with 512 MB, and a Fly Postgres cluster, `hovimestari-db`, reached over Fly's private network. Artur runs it by hand, once, when the app is worth using on a phone. The end state is `https://hovimestari-backend.fly.dev/health` answering `{"status":"ok","db":"ok"}`.

The backend runs on exactly one machine. The one-time codes that finish Google sign-in and the rate limiters' budgets live in process memory, so a second machine would fail codes minted on the other and split the budgets.

## Steps

### 1. Prepare

1. Install `flyctl` from [the Fly docs](https://fly.io/docs/flyctl/install/) and sign in with `flyctl auth login`. A payment method is required.
2. Create a Resend key and a verified sender, as [the Resend runbook](resend-email.md) says. Production refuses to start without them.
3. Optionally create a Google OAuth client, as [the Google sign-in runbook](google-sign-in.md) says, with these redirect URIs:

   ```text
   https://hovimestari-backend.fly.dev/api/v1/auth/google/callback
   https://hovimestari-backend.fly.dev/api/v1/auth/link/google/callback
   ```

4. Decide the web app's production origin, for example `https://hovimestari.vercel.app`. The commands below call it `$WEB_ORIGIN`.

### 2. Create the app and the database

From the repository root:

```bash
flyctl apps create hovimestari-backend --org personal
flyctl postgres create --name hovimestari-db --region arn --vm-size shared-cpu-1x \
  --vm-memory 256 --initial-cluster-size 1 --volume-size 1
flyctl postgres attach hovimestari-db -a hovimestari-backend
```

Food search needs a UTF-8 database, the `pg_trgm` and `unaccent` extensions, and the ICU collation `fi-x-icu`, which sorts food names in Finnish order. Migration `0001` refuses any other encoding and a server without the collation, and creates both extensions. Both are trusted extensions, so the app's own role may create them, as long as it has `CREATE` on the database. The attach step names the app's database `hovimestari_backend`, and its role has the same name. Check all of it:

```bash
flyctl postgres connect -a hovimestari-db --database hovimestari_backend
# At the prompt:
# SHOW server_encoding;
# One row: UTF8.
# SELECT name FROM pg_available_extensions WHERE name IN ('pg_trgm', 'unaccent');
# Two rows.
# SELECT has_database_privilege('hovimestari_backend', 'hovimestari_backend', 'CREATE');
# One row: t. If it is f, run:
# GRANT CREATE ON DATABASE hovimestari_backend TO hovimestari_backend;
# SELECT collname FROM pg_collation WHERE collname = 'fi-x-icu';
# One row. Quit with \q.
```

If the encoding is not `UTF8`, an extension row or the collation row is missing, or the role lacks `CREATE`, the migration fails at the first deploy and no machine takes traffic. A missing collation means the server was built without ICU. These checks show the same thing before the deploy does.

The attach step creates a database role and a database for the app and sets `DATABASE_URL` as a secret on it. That value is never written down anywhere else. Fly prints the cluster's superuser password once when it creates it. Keep it in a password manager. Normal operation never needs it.

Fly now steers new apps to Managed Postgres, which sits behind PgBouncer. PgBouncer refuses the session settings the backend's pool sends at connection time (`apps/backend/src/db/index.ts`). To use Managed Postgres instead, first move `statement_timeout`, `lock_timeout` and `idle_in_transaction_session_timeout` to `ALTER ROLE ... SET` on the database and remove them from the pool.

### 3. Set the secrets

Generate each secret inline, so none is pasted. `BFF_SECRET` is shared with the web app, so generate it once into a shell variable and set it here:

```bash
export WEB_ORIGIN=https://hovimestari.vercel.app
export BFF_SECRET=$(openssl rand -hex 32)
flyctl secrets set -a hovimestari-backend \
  JWT_ACCESS_SECRET=$(openssl rand -hex 32) \
  JWT_REFRESH_SECRET=$(openssl rand -hex 32) \
  BFF_SECRET=$BFF_SECRET \
  CORS_ORIGIN=$WEB_ORIGIN \
  FRONTEND_URL=$WEB_ORIGIN
```

Copy the value of `$BFF_SECRET` into your password manager. The web app's deployment needs the same value, and a rotation needs it as the old value. Fly never shows a secret again.

Then the Resend values. `flyctl secrets import` reads `NAME=value` lines from standard input, so the key never lands in your shell history:

```bash
flyctl secrets set -a hovimestari-backend EMAIL_FROM="Hovimestari <mail@your-verified-domain>"
flyctl secrets import -a hovimestari-backend
# Type RESEND_API_KEY=, paste the key after it, press Enter, then Ctrl-D.
```

With Google, set all four the same way, with `flyctl secrets import` for `GOOGLE_CLIENT_SECRET`:

```bash
flyctl secrets set -a hovimestari-backend \
  GOOGLE_CLIENT_ID=<the client ID from the console> \
  GOOGLE_CALLBACK_URL=https://hovimestari-backend.fly.dev/api/v1/auth/google/callback \
  GOOGLE_LINK_CALLBACK_URL=https://hovimestari-backend.fly.dev/api/v1/auth/link/google/callback
flyctl secrets import -a hovimestari-backend
# Type GOOGLE_CLIENT_SECRET=, paste the secret after it, press Enter, then Ctrl-D.
```

`NODE_ENV`, `PORT`, the token lifetimes and `DB_POOL_MAX` are in `apps/backend/fly.toml` and need no secret.

### 4. Deploy

From the repository root, because the image copies workspace siblings such as `packages/types`:

```bash
flyctl deploy --remote-only --ha=false --config apps/backend/fly.toml
```

A first deploy without `--ha=false` creates two machines. Later deploys keep the machine count, so the flag matters only the first time and does no harm after. The `release_command` in `fly.toml` runs `drizzle-kit migrate` before the new machine takes traffic. A failed migration aborts the deploy. `flyctl logs -a hovimestari-backend` shows why.

The food catalogue starts empty. Load Fineli's foods with [the Fineli import runbook](fineli-import.md): steps 1 and 2 download and unzip the release on your machine, and steps 8 to 10 import it on Fly.

### Rotating BFF_SECRET

Fly and Vercel cannot change the value at the same moment, so the backend accepts the old one beside the new one for the switch:

1. Set the new value as `BFF_SECRET` and the old one as `BFF_SECRET_PREVIOUS` on Fly:

   ```bash
   export OLD_BFF_SECRET=<the current value, from your password manager>
   export BFF_SECRET=$(openssl rand -hex 32)
   flyctl secrets set -a hovimestari-backend BFF_SECRET=$BFF_SECRET BFF_SECRET_PREVIOUS=$OLD_BFF_SECRET
   ```

2. Set the new value on Vercel and redeploy the web app.
3. Remove the old one:

   ```bash
   flyctl secrets unset -a hovimestari-backend BFF_SECRET_PREVIOUS
   ```

## Check it works

```bash
curl -s https://hovimestari-backend.fly.dev/health
# {"status":"ok","db":"ok"}
curl -s https://hovimestari-backend.fly.dev/api/v1/auth/providers
# {"google":true} with Google configured, {"google":false} without
flyctl status -a hovimestari-backend
```

`flyctl status` lists exactly one machine.

## Before production

- Keep one machine. Before a second one, the one-time codes and the rate limiters need a shared store.
- Take a backup before any destructive change: `flyctl postgres backup create -a hovimestari-db`.
- The two apps are billable until destroyed with `flyctl apps destroy`. Destroying `hovimestari-db` deletes its volume and every account.
