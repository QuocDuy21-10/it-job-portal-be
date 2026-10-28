# Base image
FROM node:20-alpine AS base
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
RUN npm ci
COPY . .
RUN npm run build
RUN npm prune --omit=dev

# Production stage
FROM node:20-alpine AS production
WORKDIR /app
ENV NODE_ENV=production

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nestjs -u 1001

# Copy built application
COPY --from=build --chown=nestjs:nodejs /app/dist ./dist
COPY --from=build --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=build --chown=nestjs:nodejs /app/package*.json ./

# Uploads are written here; mount a volume on /app/public/images to keep them across deploys
RUN mkdir -p public/images && chown -R nestjs:nodejs public

USER nestjs

EXPOSE ${PORT:-8081}

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT:-8081}/api/v1/health" > /dev/null || exit 1

CMD ["node", "dist/main"]
