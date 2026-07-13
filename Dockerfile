# Server image for @vobo/server (Railway / Render / Fly.io / any Docker host).
# Built from the repo root because the server consumes the @vobo/game-engine
# workspace package as TypeScript source (run via tsx).
FROM node:22-slim

# pnpm via corepack (uses the version pinned in package.json "packageManager")
RUN corepack enable
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0

WORKDIR /app

# Copy the whole workspace, then install only the server + its deps (skips web).
COPY . .
RUN pnpm install --frozen-lockfile --filter "@vobo/server..."

ENV NODE_ENV=production
# The platform injects PORT; the server reads process.env.PORT (defaults to 3001).
EXPOSE 3001

CMD ["pnpm", "--filter", "@vobo/server", "start"]
