#!/bin/sh
# Forced command for the GitHub Actions deploy key (authorized_keys: restrict,command="<repo>/scripts/deploy-from-ci.sh").
# The workflow sends only the version to deploy (e.g. 1.2.3); this runs the manual steps from
# docs/11-operations/rollback.md: update the repo, back up MongoDB, deploy, then record IMAGE_TAG.
set -eu

VERSION="${SSH_ORIGINAL_COMMAND:-}"
# Untrusted input: allow only a plain semver, no spaces, newlines or shell characters.
case "$VERSION" in
  '' | *[!0-9A-Za-z.-]*) VERSION='' ;;
esac
if ! printf '%s' "$VERSION" | grep -Eqx '[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?'; then
  echo "refused: expected a version like 1.2.3, got '${SSH_ORIGINAL_COMMAND:-}'" >&2
  exit 64
fi

cd "$(dirname "$0")/.."
grep -q '^IMAGE_TAG=' .env.production || { echo "IMAGE_TAG is missing from .env.production" >&2; exit 1; }

echo "Deploying $VERSION (was $(grep '^IMAGE_TAG=' .env.production | cut -d= -f2))"
git pull --ff-only --quiet origin main
./scripts/backup-mongo.sh
# The shell value overrides .env.production for this run; the file is only updated once the new
# version is up, so a failed pull or healthcheck leaves it naming the version still running.
IMAGE_TAG="$VERSION" ./scripts/deploy.sh
sed -i "s/^IMAGE_TAG=.*/IMAGE_TAG=$VERSION/" .env.production
