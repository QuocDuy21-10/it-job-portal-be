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
RUN npm prune --production

# Production stage
FROM node:20-alpine AS production
WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nestjs -u 1001

# Copy built application
COPY --from=build --chown=nestjs:nodejs /app/dist ./dist
COPY --from=build --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=build --chown=nestjs:nodejs /app/package*.json ./

USER nestjs

EXPOSE ${PORT:-8081}

CMD ["node", "dist/main"]