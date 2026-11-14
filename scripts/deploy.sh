#!/bin/sh
# Pull the image named in .env.production and (re)start the stack, waiting for healthchecks.
# Override the tag for one run: IMAGE_TAG=1.2.3 ./scripts/deploy.sh
set -eu
cd "$(dirname "$0")/.."
COMPOSE="docker compose -f docker-compose.prod.yml --env-file .env.production"
$COMPOSE pull
$COMPOSE up -d --remove-orphans --wait --wait-timeout 180
docker image prune -f
$COMPOSE ps
