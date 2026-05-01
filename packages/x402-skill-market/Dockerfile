FROM oven/bun:1.2-alpine

WORKDIR /app

COPY package.json bun.lock turbo.json tsconfig.base.json ./
COPY packages packages
COPY apps/studio/package.json apps/studio/package.json
COPY examples examples

RUN bun install --frozen-lockfile --production || bun install --production

EXPOSE 3700
ENV PORT=3700

CMD ["bun", "run", "packages/x402-skill-market/src/server.ts"]
