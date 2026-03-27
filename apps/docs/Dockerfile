FROM node:22-alpine AS base

RUN corepack enable && corepack prepare pnpm@10.6.1 --activate

WORKDIR /app
COPY package.json ./
RUN pnpm install --no-frozen-lockfile

COPY . .
RUN pnpm build

EXPOSE 3000
ENV PORT=3000
CMD ["pnpm", "start"]
