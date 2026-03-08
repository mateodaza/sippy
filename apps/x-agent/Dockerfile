# Stage 1: Build
FROM node:22-slim AS builder
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/x-agent/package.json apps/x-agent/

RUN pnpm install --frozen-lockfile --filter x-agent...

COPY apps/x-agent/ apps/x-agent/

RUN pnpm --filter x-agent build

# Stage 2: Run
FROM node:22-slim AS runner
WORKDIR /app

COPY --from=builder /app/apps/x-agent/dist/main.js ./main.js

EXPOSE 3002

CMD ["node", "main.js"]
