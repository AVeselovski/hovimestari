# syntax=docker/dockerfile:1.6
FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /repo

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/api/package.json apps/api/package.json
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @hovi/shared build
RUN pnpm --filter @hovi/api build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /repo/node_modules /repo/node_modules
COPY --from=build /repo/package.json /repo/package.json
COPY --from=build /repo/pnpm-workspace.yaml /repo/pnpm-workspace.yaml
COPY --from=build /repo/packages/shared/package.json /repo/packages/shared/package.json
COPY --from=build /repo/packages/shared/dist /repo/packages/shared/dist
COPY --from=build /repo/packages/shared/node_modules /repo/packages/shared/node_modules
COPY --from=build /repo/apps/api/package.json /repo/apps/api/package.json
COPY --from=build /repo/apps/api/dist /repo/apps/api/dist
COPY --from=build /repo/apps/api/migrations /repo/apps/api/migrations
COPY --from=build /repo/apps/api/node_modules /repo/apps/api/node_modules
WORKDIR /repo/apps/api
EXPOSE 3000
CMD ["node", "dist/index.js"]
