# syntax=docker/dockerfile:1
# Base image
FROM node:24-alpine AS base
WORKDIR /app
COPY package*.json ./

# Development stage
FROM base AS development
RUN npm ci
COPY . .
EXPOSE ${PORT:-8081}
CMD ["npm", "run", "start:dev"]

# Build stage
FROM base AS build
RUN --mount=type=cache,target=/root/.npm npm ci
COPY . .
RUN npm run build
RUN npm prune --omit=dev

# Production stage
FROM node:24-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
# Cap the V8 heap so the container stays inside its mem_limit on a 1.5 GB VPS
ENV NODE_OPTIONS=--max-old-space-size=384

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nestjs -u 1001

# Copy built application
COPY --from=build --chown=nestjs:nodejs /app/dist ./dist
COPY --from=build --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=build --chown=nestjs:nodejs /app/package*.json ./

# Uploads: mount volumes on /app/public/images (public assets) and /app/storage (private CV files)
RUN mkdir -p public/images storage && chown -R nestjs:nodejs public storage

USER nestjs

EXPOSE ${PORT:-8081}

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT:-8081}/api/v1/health/live" > /dev/null || exit 1

CMD ["node", "dist/main"]
