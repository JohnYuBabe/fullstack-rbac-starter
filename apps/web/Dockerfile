FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@8.6.12 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile --filter @rbac/web...

FROM deps AS build
ARG VITE_BASE=/
ARG VITE_API_BASE=/api
ENV VITE_BASE=$VITE_BASE
ENV VITE_API_BASE=$VITE_API_BASE

COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY apps/web ./apps/web
RUN pnpm --filter @rbac/shared build \
 && pnpm --filter @rbac/web build

FROM nginx:1.27-alpine AS runtime
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
