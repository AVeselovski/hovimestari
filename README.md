# Hovimestari

Local-first household butler. See `CLAUDE.md` for the full brief.

## Getting started (Phase 0)

```bash
cp .env.example .env
docker compose -f infra/compose.yaml up --build
```

Then open:

- Web UI: <http://localhost:5173> (or `http://<lan-ip>:5173` from a phone on the same LAN)
- API: <http://localhost:3000/healthz>

Postgres is exposed on `5432` for local tooling.

### Reaching it from your phone

Use your **host machine's LAN IP**, not the "Network" address Vite prints — that's
the Docker bridge IP and is unreachable from outside the container.

- macOS: `ipconfig getifaddr en0` (Wi-Fi) — e.g. `192.168.1.42`
- Linux: `hostname -I | awk '{print $1}'`

Then on the phone: `http://192.168.1.42:5173`.

If it times out: check the host firewall (macOS System Settings → Network →
Firewall, or `sudo ufw status` on Linux) and allow inbound TCP on `5173` (and
`3000` if you want to hit the API directly). Some routers also block
LAN-to-LAN traffic via "AP isolation" — disable it in the router admin.

To stop and clean up:

```bash
docker compose -f infra/compose.yaml down
```

Postgres data persists in a named Docker volume (`pgdata`); it survives `down` but
is removed by `down -v`.

## Phase 1

The web UI is the ported meal-planner artifact: four tabs (Suunnitelma · Reseptit ·
Vakiot · Lista), recipes split into Arki/Erikois, and per-staple-group toggles.

```bash
cp .env.example .env
docker compose -f infra/compose.yaml up --build
```

Then open `http://<host-lan-ip>:5173/` from a phone on the same Wi-Fi.

The API runs database migrations on boot when `MIGRATE_ON_BOOT=true` (the default
in `compose.yaml`). The seed migration only writes to `household_state` while the
row still contains the pristine empty-state JSON inserted by the init migration —
so it's safe to re-run, and won't overwrite a populated database.

To force a re-seed (drops your data):

```bash
docker compose -f infra/compose.yaml exec db \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  -c "DELETE FROM pgmigrations WHERE name LIKE '%seed%'; \
      UPDATE household_state SET state = '{ \"recipes\": [], \"stapleGroups\": [], \"staples\": [], \"plan\": { \"selectedRecipeIds\": [] } }'::jsonb WHERE id = 1;"
docker compose -f infra/compose.yaml restart api
```

### PWA notes

The service worker registers on `localhost` and HTTPS origins. iOS Safari refuses
to register a worker on `http://<lan-ip>:5173/`; the app still works fine, but
"Add to home screen" with full PWA behaviour needs HTTPS (Phase 2 will add Caddy).
