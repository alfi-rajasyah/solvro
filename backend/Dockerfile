# syntax=docker/dockerfile:1.7

FROM node:22-slim AS deps
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci
RUN npx prisma generate

FROM deps AS dev
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev"]

FROM deps AS build
COPY . .
RUN npm run build

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
COPY prisma ./prisma
COPY scripts ./scripts
RUN npm ci --omit=dev \
    && npx prisma generate \
    && npm cache clean --force
COPY --from=build /app/dist ./dist
# Run as the image's unprivileged user (uid 1000). Install, generate and copy
# above stay root-owned and read-only to the process: nothing under /app is
# written at runtime (tsx and prisma use the home directory and /tmp), so no
# --chown is needed (docs/archive/plans/application-review-2026-10-22.md, F-33).
USER node
EXPOSE 3000
CMD ["node", "dist/index.js"]
