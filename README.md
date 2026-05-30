# Hovimestari

Local-first household butler. See `CLAUDE.md` for the full brief.

## Getting started (Phase 0)

```bash
cp .env.example .env
docker compose --env-file .env -f infra/compose.yaml up --build
```

`--env-file .env` is required because the compose file lives under `infra/`, so
Compose looks for `.env` in `infra/` by default — not at the repo root where the
file actually is.

Then open:

- Web UI: <http://localhost:5173> (or `http://<lan-ip>:5173` from a phone on the same LAN)
- API: <http://localhost:3000/healthz>

Postgres is exposed on `5001` for local tooling (override via `POSTGRES_PORT`
in `.env`; the default avoids clashing with other dev Postgres instances on
5432). The container always listens on `5432` internally.

### Reaching it from your phone

Easiest path is **mDNS** (`*.local`), which works out of the box on macOS and on
Linux with Avahi installed. Set `HOST_HOSTNAME` in `.env` to your host machine's
short name and Vite will print a clickable LAN URL on boot.

- macOS: `scutil --get LocalHostName` — set `HOST_HOSTNAME=<that>`.
- Linux: `hostname` — set `HOST_HOSTNAME=<that>` (requires Avahi/mDNS on host).

Then on the phone: `http://<HOST_HOSTNAME>.local:5173`.

If mDNS doesn't resolve (Windows host, locked-down router, no Avahi), fall back
to the manual LAN IP. Set `HOST_LAN_IP` and Vite prints that URL too.

- macOS: `ipconfig getifaddr en0` (Wi-Fi) — e.g. `192.168.1.42`
- Linux: `hostname -I | awk '{print $1}'`

Then on the phone: `http://<HOST_LAN_IP>:5173`.

Note: the "Network" line Vite prints by default is the Docker bridge IP and is
unreachable from outside the container — only the `HOST_HOSTNAME` / `HOST_LAN_IP`
lines printed alongside it work from the phone.

If it times out: check the host firewall (macOS System Settings → Network →
Firewall, or `sudo ufw status` on Linux) and allow inbound TCP on `5173` (and
`3000` if you want to hit the API directly). Some routers also block
LAN-to-LAN traffic via "AP isolation" — disable it in the router admin.

To stop and clean up:

```bash
docker compose --env-file .env -f infra/compose.yaml down
```

Postgres data persists in a named Docker volume (`hovimestari_pgdata`); it
survives `down` but is removed by `down -v`. The web and shared `node_modules`
caches use `hovimestari_web_node_modules` and `hovimestari_shared_node_modules`
respectively. These names are declared explicitly in `compose.yaml` and match
the names Compose has auto-generated since the project was first scaffolded —
so no data migration is needed for existing stacks. If you started the stack
with a non-default `COMPOSE_PROJECT_NAME`, your existing volumes will be
prefixed differently and you'll need to migrate them manually.

## Phase 1

The web UI is the ported meal-planner artifact: four tabs (Suunnitelma · Reseptit ·
Vakiot · Lista), recipes split into Arki/Erikois, and per-staple-group toggles.

```bash
cp .env.example .env
docker compose --env-file .env -f infra/compose.yaml up --build
```

Then open `http://<host-lan-ip>:5173/` from a phone on the same Wi-Fi.

The API runs database migrations on boot when `MIGRATE_ON_BOOT=true` (the default
in `compose.yaml`). The seed migration only writes to `household_state` while the
row still contains the pristine empty-state JSON inserted by the init migration —
so it's safe to re-run, and won't overwrite a populated database.

To force a re-seed (drops your data):

```bash
docker compose --env-file .env -f infra/compose.yaml exec db \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  -c "DELETE FROM pgmigrations WHERE name LIKE '%seed%'; \
      UPDATE household_state SET state = '{ \"recipes\": [], \"stapleGroups\": [], \"staples\": [], \"plan\": { \"selectedRecipeIds\": [] } }'::jsonb WHERE id = 1;"
docker compose --env-file .env -f infra/compose.yaml restart api
```

## Phase 2 — AI recipe import

The Reseptit tab's "Uusi" button now opens an import sheet with two AI options:

- **Kirjoita / liitä** — paste a Finnish recipe blob; the API parses it into a draft `Recipe` and opens the editor for review.
- **Kuva** — pick or snap a photo of a recipe; see "Phase 2b" below.
- **tyhjästä** — skip AI and open a blank editor (the Phase 1 flow).

Text import calls `POST /recipes/from-text`, which routes through an
`LLMProvider`. Two providers ship at day one and either can be used alone:

| Env vars set                               | Behaviour                                                              |
| ------------------------------------------ | ---------------------------------------------------------------------- |
| Neither                                    | Route returns 503; the UI shows an error                               |
| `LMSTUDIO_BASE_URL` only                   | Local-only; no fallback                                                |
| `ANTHROPIC_API_KEY` only                   | Anthropic-only; no fallback                                            |
| Both                                       | Local first; Anthropic fallback on parse failure or `confidence < 0.6` |
| `HOVI_FORCE_PROVIDER=anthropic` or `local` | Forces that provider; no fallback. 503 if the forced target is unset   |

### Option A — LM Studio (local, free)

1. Install [LM Studio](https://lmstudio.ai) on the host machine.
2. Download a model. Recommended: **Qwen 3.5 9B** (dense, ~6 GB at Q4_K_M).
   Qwen-family dense models handle Finnish-to-structured-JSON reliably; some
   larger MoE / heavily-quantized variants (e.g. Gemma 4 26B-a4b) look
   bigger on paper but derail mid-output on this kind of task. Dense in the
   8–14B range is the sweet spot.
3. Start the server (LM Studio → Developer → Start Server). Default port `1234`.
4. In `.env` at the repo root:

   ```text
   LMSTUDIO_BASE_URL=http://host.docker.internal:1234/v1
   LMSTUDIO_MODEL=qwen/qwen3.5-9b
   ```

   `LMSTUDIO_MODEL` must match the exact model ID shown in LM Studio's
   Developer tab (the string under each loaded model, e.g. `qwen/qwen3.5-9b`).
   If only one model is loaded you can leave it empty and LM Studio will use
   that one; with multiple models loaded, set it explicitly so requests are
   routed correctly. The `host.docker.internal` host is mapped to the host
   gateway via `extra_hosts` in `compose.yaml`, so the API container can
   reach LM Studio on Linux as well as macOS.

5. `docker compose --env-file .env -f infra/compose.yaml up --build`.

### Option B — Anthropic API (cloud, paid)

1. Create a key at <https://console.anthropic.com>.
2. In `.env`:

   ```text
   ANTHROPIC_API_KEY=sk-ant-...
   ANTHROPIC_TEXT_MODEL=claude-haiku-4-5-20251001
   ANTHROPIC_VISION_MODEL=claude-sonnet-4-6
   ```

   The two vars split model choice per API surface — Haiku is plenty for text
   recipes; Sonnet earns its keep on photo parsing. The legacy `ANTHROPIC_MODEL`
   still works as a single fallback when neither per-method var is set.

3. `docker compose --env-file .env -f infra/compose.yaml up --build`.

Costs apply per call. Running without `LMSTUDIO_BASE_URL` set means _every_
import hits Anthropic — set both if you want the local-first behaviour.

### Debugging

- `HOVI_FORCE_PROVIDER=anthropic` (or `=local`) pins the router to one provider
  and skips fallback. Useful for reproducing provider-specific bugs.
- The API logs one structured line per provider call:
  `{ task: 'recipe-from-text', provider, inputTokens, outputTokens, latencyMs }`.
- 502 responses include an `attempts` array showing what each provider returned.
- LM Studio requests have a 60-second timeout; if the model is mid-load the
  router falls back to Anthropic (when configured). Vision calls get 90 seconds.

## Phase 2b — image recipe import

Tap **Kuva** in the import sheet, pick (or snap) a photo of a recipe — cookbook
page, handwritten card, printed sheet — review the thumbnail, and tap **Tuo**.
The image is downscaled in the browser (long edge capped at 2000 px, re-encoded
as JPEG at quality 0.85, capped at 5 MB) and POSTed as JSON base64 to
`POST /recipes/from-image`. The same router routes through providers, but the
vision surface is Anthropic-first (per the routing table in `CLAUDE.md` —
photos are where the bigger model earns its keep): Anthropic vision model
first, LM Studio vision-capable model as a fallback when Anthropic rejects the
image or returns low confidence. If only one provider is configured the router
uses it directly. The parsed draft lands in the same editor as text import —
review, edit, save.

Audio import is intentionally parked — this household does not use voice
notes for recipes. It can ship later as a separate task if needed.

## Troubleshooting

**`Cannot find module '/repo/apps/web/node_modules/vite/bin/vite.js'`** — the
`web_node_modules` named volume was populated from a previous build that didn't
include the current set of dependencies (common after a Phase bump). Docker only
seeds a named volume from the image on first creation, so re-running `up --build`
doesn't refresh it. Drop just the node_modules volumes and bring the stack back
up:

```bash
docker compose --env-file .env -f infra/compose.yaml down
docker volume rm hovimestari_web_node_modules hovimestari_shared_node_modules
docker compose --env-file .env -f infra/compose.yaml up --build
```

`pgdata` is left alone so seeded recipes survive.

**`required variable POSTGRES_PASSWORD is missing a value`** — you forgot
`--env-file .env`, or your `.env` is in `infra/` (it should be at the repo root).
See the top-of-readme command.

### PWA notes

The service worker registers on `localhost` and HTTPS origins. iOS Safari refuses
to register a worker on `http://<lan-ip>:5173/`; the app still works fine, but
"Add to home screen" with full PWA behaviour needs HTTPS (Phase 2 will add Caddy).
