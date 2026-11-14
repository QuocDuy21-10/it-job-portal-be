# Deployment Guide

The deployment guide now lives with the rest of the documentation:

- **[docs/09-infrastructure/deployment.md](docs/09-infrastructure/deployment.md)**: VPS setup, environment, nginx and TLS, updates, rollback.
- [docs/09-infrastructure/docker.md](docs/09-infrastructure/docker.md): Dockerfile stages and both Compose files.
- [docs/11-operations/backup-and-recovery.md](docs/11-operations/backup-and-recovery.md): backups, restore, rollback.
- [docs/08-security/production-security-checklist.md](docs/08-security/production-security-checklist.md): read before going live.
- [docs/14-reference/environment-variables.md](docs/14-reference/environment-variables.md): every environment variable.

Quick start for local development: `nvm use && npm ci && cp .env.example .env && npm run docker:dev && npm run dev` (see [docs/00-getting-started/quick-start.md](docs/00-getting-started/quick-start.md)).

> `npm run seed` creates sample companies, jobs and `@seed.local` accounts only when `NODE_ENV` is `development` or `test`. With any other value (or none) it creates skills, job sources and the `EMAIL_ADMIN` account only, and requires `INIT_PASSWORD` of at least 12 characters.

The previous long-form version of this file is in git history (`git log -- DEPLOYMENT.md`).
