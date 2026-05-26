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
