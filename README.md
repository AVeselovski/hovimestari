# Hovimestari

Hovimestari is a food planner and food log for people who bring their own calorie and protein targets. The user sets a daily calorie range and a daily protein range. The app adds up what they eat and plan, shows the gap to the targets and ranks what in their own recipe library closes it. Every figure is computed from a food database. The app runs no AI of its own. A user can connect their own AI assistant with a key.

## Where the project stands

The backend is built with authentication, targets and the food catalogue, without the Fineli import yet. The web app comes next. [The feature catalog](docs/features.md) lists what is built.

- [The overview](docs/overview.md) frames the product.
- [The requirements](docs/requirements.md) say what it must do.
- `docs/design/pivot-plan.md` holds the build order.
- [TODO.md](TODO.md) lists the open decisions.

## Working in this repository

The project runs on an agentic workflow. `CLAUDE.md` holds the rules every session follows. `.claude/agents/` holds the seven agents. [The workflow](docs/playbook/workflow.md) explains the pipeline end to end, and [the lessons learned](docs/playbook/lessons-learned.md) explain why the rules exist.

Node 22 and pnpm are required. Corepack picks the pnpm version from `package.json`.

```bash
pnpm install
pnpm build
pnpm test
pnpm docs:check
```

`pnpm install` also points git at the commit hook in `.githooks/`, which formats staged files with Prettier.

## Running it locally

[The local development runbook](docs/setup/local-development.md) goes from a fresh clone to a running backend: `pnpm env:init` writes the env file with generated secrets, `pnpm db:up` starts Postgres in Docker, and the backend runs on port 3001.

- `apps/backend`: the Express API. [Its README](apps/backend/README.md) has the source layout, the database and the tests.
- `packages/types`: the schemas the backend and the web app share. [Its README](packages/types/README.md).
