# Deployment Guide

Two setups share one codebase and one `Dockerfile`:

| | Local development | Production (VPS) |
|---|---|---|
| Compose file | `docker-compose.yml` | `docker-compose.prod.yml` |
| Env file | `.env` | `.env.production` |
| Backend | `npm run dev` on the host (hot reload) | `production` image, non-root, healthcheck |
| MongoDB / Redis | published on `127.0.0.1` only | private Docker network, no published ports, Redis password |
| HTTPS | none | nginx (or Caddy) on the host terminates TLS |
| Swagger | `http://localhost:8081/api` | off (set `SWAGGER_ENABLED=true` to expose) |

Both env files start from `.env.example`. The app refuses to boot when a required key is missing (`src/config/env.validation.ts`).

## 1. Local development

```bash
nvm use                      # Node 20 (.nvmrc)
npm ci
cp .env.example .env         # fill JWT/OTP secrets: openssl rand -hex 32
npm run docker:dev           # MongoDB + Redis
npm run seed                 # optional: sample data + admin account
npm run dev                  # http://localhost:8081/api
```

`npm run docker:full` also runs the backend inside Docker with hot reload.

## 2. Production on a VPS

Tested shape: Ubuntu 22.04+, 2 vCPU / 4 GB RAM, Docker Engine with the Compose plugin.

### 2.1 Prepare the server

```bash
# firewall: only SSH and HTTP(S) are reachable from the internet
sudo ufw allow OpenSSH && sudo ufw allow 80,443/tcp && sudo ufw enable
# Docker: https://docs.docker.com/engine/install/ubuntu/
sudo apt install -y nginx certbot python3-certbot-nginx
```

Docker-published ports bypass `ufw`. That is why every port in `docker-compose.prod.yml` is bound to `127.0.0.1`. Keep it that way.

### 2.2 Configure

```bash
git clone <repo-url> /opt/job-portal-be && cd /opt/job-portal-be
cp .env.example .env.production
chmod 600 .env.production
```

Set at least:

```dotenv
NODE_ENV=production
PORT=8081
FE_URL=https://example.com
CORS_ORIGINS=https://example.com,https://www.example.com
TRUST_PROXY=1
MONGO_INITDB_ROOT_PASSWORD=<openssl rand -hex 24>
REDIS_PASSWORD=<openssl rand -hex 24>
JWT_ACCESS_TOKEN_SECRET=<openssl rand -hex 32>
JWT_REFRESH_TOKEN_SECRET=<openssl rand -hex 32>
OTP_SECRET=<openssl rand -hex 32>
# + SMTP_*, GOOGLE_*, GEMINI_*, GROQ_*, EMAIL_ADMIN, INIT_PASSWORD
```

Use hex passwords: `MONGO_URL` is built from them, and characters like `@ / :` would break the URI. `MONGO_URL` and `REDIS_HOST` in the file are ignored, because the compose file points them at its own containers.

The refresh-token cookie is `Secure` + `SameSite=Strict` in production. The frontend and API must therefore be served over HTTPS on the same site, e.g. `example.com` and `api.example.com`.

### 2.3 Start

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
docker compose -f docker-compose.prod.yml ps        # backend should become "healthy"
curl -s http://127.0.0.1:8081/api/v1/health
```

### 2.4 Seed the admin account (first deploy only)

The production image has no dev tools, so seed from the development stage on the same network:

```bash
docker build --target development -t job-portal-be:dev .
set -a; . ./.env.production; set +a
docker run --rm --network my-job-portal-be_backend --env-file .env.production \
  -e MONGO_URL="mongodb://$MONGO_INITDB_ROOT_USERNAME:$MONGO_INITDB_ROOT_PASSWORD@mongodb:27017/$MONGO_INITDB_DATABASE?authSource=admin" \
  job-portal-be:dev npm run seed
```

The network name is `<folder>_backend`. Check it with `docker network ls`.

### 2.5 nginx reverse proxy + TLS

`/etc/nginx/sites-available/api.example.com`:

```nginx
server {
    server_name api.example.com;
    client_max_body_size 10m;            # uploads are capped at 5 MB by the app

    location / {
        proxy_pass http://127.0.0.1:8081;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # socket.io (/notifications) and SSE chat streaming
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_buffering off;
        proxy_read_timeout 300s;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/api.example.com /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d api.example.com
```

`TRUST_PROXY=1` tells Express to trust exactly this one proxy hop. Without it every user shares nginx's IP and the rate limits lock everyone out together.

### 2.6 Update to a new version

```bash
git pull
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build backend
docker image prune -f
```

`SIGTERM` from `docker stop` triggers Nest shutdown hooks, so BullMQ jobs and DB connections close cleanly.

### 2.7 Backups

```bash
# MongoDB, daily via cron
docker compose -f docker-compose.prod.yml --env-file .env.production exec -T mongodb sh -c \
  'mongodump -u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin --archive --gzip' \
  > /var/backups/mongo-$(date +%F).archive.gz

# Uploaded files (avatars, logos, CVs)
docker run --rm -v my-job-portal-be_uploads:/data -v /var/backups:/backup alpine \
  tar czf /backup/uploads-$(date +%F).tgz -C /data .
```

Copy backups off the server, for example to object storage.

### 2.8 Operations checklist

- Logs: `docker compose -f docker-compose.prod.yml logs -f backend` (rotated at 5 × 10 MB per container).
- Health: point an uptime monitor at `https://api.example.com/api/v1/health` (checks MongoDB and Redis).
- Secrets: rotate any key that was ever pasted into chat, a ticket or a commit. Rotating `JWT_*` logs everyone out.
- Scaling beyond one backend container needs the socket.io Redis adapter, because the notifications gateway keeps socket maps in memory.
