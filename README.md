# Hovimestari

Hovimestari is a food planner and food log for people who bring their own calorie and protein targets. The user sets a daily calorie range and a daily protein range. The app adds up what they eat and plan, shows the gap to the targets and ranks what in their own recipe library closes it. Every figure is computed from a food database. The app runs no AI of its own. A user can connect their own AI assistant with a key.

## Where the project stands

The repository is mid-pivot. The product above is described in the docs and has no code yet. The code here today is the earlier app, a weekly meal planner for one household.

- [The overview](docs/overview.md) frames the product.
- [The requirements](docs/requirements.md) say what it must do.
- [The feature catalog](docs/features.md) lists what is built.
- `docs/design/pivot-plan.md` holds the build order and what carries over.
- [TODO.md](TODO.md) lists the open decisions.

## Working in this repository

The project runs on an agentic workflow. `CLAUDE.md` holds the rules every session follows. `.claude/agents/` holds the seven agents. [The workflow](docs/playbook/workflow.md) explains the pipeline end to end, and [the lessons learned](docs/playbook/lessons-learned.md) explain why the rules exist.

Node 22 and pnpm are required.

```bash
pnpm install
pnpm build
pnpm test
pnpm docs:check
```

`pnpm install` also points git at the commit hook in `.githooks/`, which formats staged files with Prettier.

## Running the earlier app

The earlier app runs as a compose stack with Postgres, an API and a web UI.

```bash
cp .env.example .env
docker compose --env-file .env -f infra/compose.yaml up --build
```

The web UI is at `http://localhost:5173` and the API answers at `http://localhost:3000/healthz`. Stop it with the same command and `down` in place of `up --build`.
