#!/bin/sh
# Dump MongoDB to a gzip archive and keep 7 days. Cron example: 0 3 * * * /opt/job-portal-be/scripts/backup-mongo.sh
set -eu
cd "$(dirname "$0")/.."
OUT="${BACKUP_DIR:-./backups}"
mkdir -p "$OUT"
FILE="$OUT/mongo-$(date +%F-%H%M).archive.gz"
docker compose -f docker-compose.prod.yml --env-file .env.production exec -T mongodb sh -c \
  'mongodump --quiet --archive --gzip -u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin' > "$FILE"
find "$OUT" -name 'mongo-*.archive.gz' -mtime +7 -delete
echo "$FILE"
