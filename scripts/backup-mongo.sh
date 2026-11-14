#!/bin/sh
# Back up MongoDB + uploaded files (one timestamp per run), keep 7 days locally, and copy offsite
# (encrypted rclone remote, kept 30 days) when BACKUP_REMOTE is set. Each run appends one line to backups/backup.log.
# Cron (stdout is already in backup.log; stderr adds the error detail):
#   0 3 * * * BACKUP_REMOTE=gdrive-crypt:job-portal-be /opt/job-portal-be/scripts/backup-mongo.sh >/dev/null 2>>/opt/job-portal-be/backups/backup.log
# Restore: scripts/restore-mongo.sh <timestamp>. Setup: docs/11-operations/backup-and-recovery.md
set -eu
cd "$(dirname "$0")/.."
OUT="${BACKUP_DIR:-./backups}"
COMPOSE="docker compose -f docker-compose.prod.yml --env-file .env.production"
TS=$(date +%F-%H%M)
MONGO="$OUT/mongo-$TS.archive.gz"
UPLOADS="$OUT/uploads-$TS.tgz"
CV="$OUT/cv-$TS.tgz"
mkdir -p "$OUT"
log() { echo "$(date '+%F %T %z') $*" | tee -a "$OUT/backup.log"; }

# A failed dump deletes its partial files so it never looks like a good backup.
trap 'rm -f "$MONGO" "$UPLOADS" "$CV"; log "FAIL $TS dump"' EXIT
$COMPOSE exec -T mongodb sh -c \
  'mongodump --quiet --archive --gzip -u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin' > "$MONGO"
$COMPOSE exec -T backend tar czf - -C /app/public/images . > "$UPLOADS"
$COMPOSE exec -T backend tar czf - -C /app/storage . > "$CV"
trap - EXIT
log "OK $TS mongo=$(du -h "$MONGO" | cut -f1) uploads=$(du -h "$UPLOADS" | cut -f1) cv=$(du -h "$CV" | cut -f1)"

find "$OUT" \( -name 'mongo-*.archive.gz' -o -name 'uploads-*.tgz' -o -name 'cv-*.tgz' \) -mtime +7 -delete

if [ -n "${BACKUP_REMOTE:-}" ]; then
  if rclone copy "$OUT" "$BACKUP_REMOTE" --exclude backup.log && rclone delete "$BACKUP_REMOTE" --min-age 30d; then
    log "OK $TS offsite $BACKUP_REMOTE"
  else
    log "FAIL $TS offsite $BACKUP_REMOTE"
    exit 1
  fi
fi
