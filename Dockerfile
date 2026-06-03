# syntax=docker/dockerfile:1.7
#
# One Dockerfile builds any app via the APP_NAME build-arg, e.g.
#   docker build --build-arg APP_NAME=api-gateway -t beta-api-gateway .
# (docker-compose passes APP_NAME per service.)

# --- build stage: install all deps and produce the bundled main.js ----------
FROM node:24-slim AS build
WORKDIR /workspace
ENV NX_DAEMON=false

# `npm install` (not `npm ci`) so platform-specific transitive deps resolve
# for the target arch.
COPY package.json package-lock.json ./
RUN npm install --no-audit --no-fund

COPY . .

ARG APP_NAME
RUN test -n "$APP_NAME" || (echo "APP_NAME build-arg is required" && exit 1)
RUN npx nx build "$APP_NAME"

# --- runtime stage: prod deps + the bundled app -----------------------------
FROM node:24-slim AS runtime
WORKDIR /app
ARG APP_NAME
ENV NODE_ENV=production

COPY --from=build /workspace/package.json /workspace/package-lock.json ./
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force

COPY --from=build /workspace/dist/apps/${APP_NAME}/main.js ./

EXPOSE 3000
CMD ["node", "main.js"]
