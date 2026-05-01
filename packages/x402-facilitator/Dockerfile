# Build context = repo root (set in railway.json)
FROM oven/bun:1.2-alpine

WORKDIR /app

# Copy the whole workspace so `bun install` resolves workspace:* links
COPY package.json bun.lock turbo.json tsconfig.base.json ./
COPY packages packages
COPY apps/studio/package.json apps/studio/package.json
COPY examples examples

RUN bun install --frozen-lockfile --production || bun install --production

# Bun runs TS natively — no build step required
EXPOSE 3701
ENV PORT=3701

CMD ["bun", "run", "packages/x402-facilitator/src/server.ts"]
