ARG NODE_IMAGE=node:24-bookworm-slim

FROM ${NODE_IMAGE} AS base

WORKDIR /app

RUN apt-get update -y \
    && apt-get install -y openssl \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable

FROM base AS builder

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY prisma.config.ts ./
COPY prisma ./prisma

ENV DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres?schema=public
RUN pnpm run prisma:generate

COPY nest-cli.json tsconfig.json tsconfig.build.json ./
COPY src ./src

RUN pnpm run build

FROM base AS migrator

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY prisma.config.ts ./
COPY prisma ./prisma

CMD ["pnpm", "prisma:migrate:deploy"]

FROM base AS runner

WORKDIR /app

ENV NODE_ENV=production

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

COPY --from=builder /app/dist ./dist

# Seed prompts from docs on first boot (written into /app/data by services)
COPY docs ./docs

EXPOSE 5000

CMD ["node", "dist/src/main"]

