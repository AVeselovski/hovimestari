# syntax=docker/dockerfile:1.7
#
# Multi-stage Dockerfile for @hovimestari/backend.
#
# Build context: MONOREPO ROOT (not apps/backend/). Build with:
#   docker build -f apps/backend/Dockerfile -t hovimestari-backend .
# Fly invokes this the same way via `dockerfile = "../../apps/backend/Dockerfile"`
# in apps/backend/fly.toml (that path is relative to fly.toml's own directory,
# not the build context) when `flyctl deploy` is run from the repo root.
#
# Stages:
#   1. deps    — install ALL deps (including devDeps) with the workspace
#                lockfile so the build stage can run TypeScript.
#   2. build   — copy source and emit JS for @hovimestari/types and
#                @hovimestari/backend (ESM, NodeNext, .js specifiers).
#   3. prod-deps — fresh `install --prod` (not `pnpm prune`, which was
#                observed to empty each workspace's node_modules/ entirely
#                instead of just dropping devDeps) so only production deps
#                remain, workspace symlinks intact.
#   4. runtime — minimal node:22-alpine, non-root user, copies prod
#                node_modules + workspace deps + emitted backend dist.

# ---- Stage 1: deps ----
FROM node:22-alpine AS deps
RUN corepack enable
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/backend/package.json apps/backend/package.json
COPY packages/types/package.json packages/types/package.json
RUN pnpm install --frozen-lockfile

# ---- Stage 2: build ----
FROM deps AS build
WORKDIR /repo
COPY tsconfig.base.json ./
COPY packages/types packages/types
COPY apps/backend apps/backend
RUN pnpm --filter @hovimestari/types build \
 && pnpm --filter @hovimestari/backend build
# After this: /repo/apps/backend/dist contains the emitted ESM .js files.

# ---- Stage 3: prod-deps ----
FROM deps AS prod-deps
WORKDIR /repo
# `pnpm prune --prod` was tried here first but silently deletes each
# workspace's entire node_modules/ (not just devDeps — production deps like
# drizzle-kit vanished too), breaking the release_command at runtime. A fresh
# `--prod` install reliably yields exactly the production dependency tree.
# CI=true skips pnpm's interactive TTY confirmation before removing the
# existing modules dir, which Fly's remote (Depot) builder has no way to answer.
RUN CI=true pnpm install --frozen-lockfile --prod

# ---- Stage 4: runtime ----
FROM node:22-alpine AS runtime
RUN addgroup -S app && adduser -S app -G app
WORKDIR /app
ENV NODE_ENV=production

# Production node_modules and workspace deps (kept hoisted by pnpm).
# packages/types/node_modules holds the symlink to its runtime dep (zod);
# without it, @hovimestari/types fails to resolve zod at runtime.
COPY --from=prod-deps  --chown=app:app /repo/node_modules                       ./node_modules
COPY --from=prod-deps  --chown=app:app /repo/apps/backend/node_modules          ./apps/backend/node_modules
COPY --from=prod-deps  --chown=app:app /repo/packages/types/node_modules        ./packages/types/node_modules

# Built artefacts and metadata.
COPY --from=build  --chown=app:app /repo/packages/types/dist                ./packages/types/dist
COPY --from=build  --chown=app:app /repo/packages/types/package.json        ./packages/types/package.json
COPY --from=build  --chown=app:app /repo/apps/backend/dist                  ./apps/backend/dist
COPY --from=build  --chown=app:app /repo/apps/backend/drizzle               ./apps/backend/drizzle
COPY --from=build  --chown=app:app /repo/apps/backend/drizzle.config.ts     ./apps/backend/drizzle.config.ts
COPY --from=build  --chown=app:app /repo/apps/backend/package.json          ./apps/backend/package.json
COPY --from=build  --chown=app:app /repo/package.json                      ./package.json
COPY --from=build  --chown=app:app /repo/pnpm-workspace.yaml               ./pnpm-workspace.yaml

USER app
EXPOSE 3000
# For local `docker run`. Fly.io uses the HTTP check in fly.toml instead.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/health || exit 1
CMD ["node", "apps/backend/dist/index.js"]
