#!/bin/sh
# Restore the app database + uploaded files from one backup run of scripts/backup-mongo.sh:
#   ./scripts/restore-mongo.sh 2026-11-15-0300          # timestamps: ls backups/  or  rclone ls "$BACKUP_REMOTE"
#   BACKUP_REMOTE=gdrive-crypt:job-portal-be ./scripts/restore-mongo.sh 2026-11-15-0300   # fetch first (new VPS)
# Only the app database is restored (not admin), so a new VPS keeps its own root password.
set -eu
cd "$(dirname "$0")/.."
TS="${1:?usage: $0 <timestamp, e.g. 2026-11-15-0300>}"
OUT="${BACKUP_DIR:-./backups}"
COMPOSE="docker compose -f docker-compose.prod.yml --env-file .env.production"
MONGO="$OUT/mongo-$TS.archive.gz"
UPLOADS="$OUT/uploads-$TS.tgz"
CV="$OUT/cv-$TS.tgz"

if [ ! -f "$MONGO" ] && [ -n "${BACKUP_REMOTE:-}" ]; then
  mkdir -p "$OUT"
  rclone copy "$BACKUP_REMOTE" "$OUT" --include "*-$TS.*"
fi
[ -f "$MONGO" ] || { echo "Backup $MONGO not found (set BACKUP_REMOTE to fetch it)" >&2; exit 1; }

printf 'Replace the database and uploaded files with backup %s? Collections are dropped first. Type yes: ' "$TS"
read -r ANSWER
[ "$ANSWER" = yes ] || { echo "Aborted"; exit 1; }

$COMPOSE exec -T mongodb sh -c \
  'mongorestore --quiet --drop --archive --gzip --nsInclude="$MONGO_INITDB_DATABASE.*" -u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin' < "$MONGO"
# Backups made before files were included only have the Mongo archive.
if [ -f "$UPLOADS" ]; then $COMPOSE exec -T backend tar xzf - -C /app/public/images < "$UPLOADS"; else echo "No $UPLOADS, skipped"; fi
if [ -f "$CV" ]; then $COMPOSE exec -T backend tar xzf - -C /app/storage < "$CV"; else echo "No $CV, skipped"; fi
echo "Restored $TS"
