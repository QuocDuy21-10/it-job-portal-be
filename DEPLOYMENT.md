# Deployment Guide

The deployment guide now lives with the rest of the documentation:

- **[docs/09-infrastructure/deployment.md](docs/09-infrastructure/deployment.md)**: VPS setup, environment, nginx and TLS, updates, rollback.
- [docs/09-infrastructure/docker.md](docs/09-infrastructure/docker.md): Dockerfile stages and both Compose files.
- [docs/11-operations/backup-and-recovery.md](docs/11-operations/backup-and-recovery.md): backups, restore, rollback.
- [docs/08-security/production-security-checklist.md](docs/08-security/production-security-checklist.md): read before going live.
- [docs/14-reference/environment-variables.md](docs/14-reference/environment-variables.md): every environment variable.

Quick start for local development: `nvm use && npm ci && cp .env.example .env && npm run docker:dev && npm run dev` (see [docs/00-getting-started/quick-start.md](docs/00-getting-started/quick-start.md)).

> Warning: `npm run seed` creates 96 sample accounts (1 admin, 20 HR, 75 candidates) that share `INIT_PASSWORD`. Do not run it unchanged on production.

The previous long-form version of this file is in git history (`git log -- DEPLOYMENT.md`).
