# Docker và Docker Compose

Một `Dockerfile` đa tầng và hai file compose: một cho phát triển, một cho VPS. Nguồn: [Dockerfile](../../Dockerfile), [docker-compose.yml](../../docker-compose.yml), [docker-compose.prod.yml](../../docker-compose.prod.yml).

## Dockerfile

| Stage | Nền | Dùng cho | Điểm chính |
|---|---|---|---|
| `base` | `node:24-alpine` | Chung | Sao chép `package*.json` |
| `development` | `base` | `npm run docker:full`, seed trên production | `npm ci` (cả dev dependency), chạy `npm run start:dev` |
| `build` | `base` | Biên dịch | `npm ci`, `npm run build`, rồi `npm prune --omit=dev` |
| `production` | `node:24-alpine` | Chạy thật | `NODE_ENV=production`, người dùng `nestjs` (uid 1001) không phải root, chỉ chép `dist/` và `node_modules` đã prune, `CMD node dist/main` |

- Thư mục `public/images` (ảnh public) và `storage` (file CV private) được tạo sẵn và giao cho `nestjs`; cần gắn volume cho cả hai để giữ file qua các lần triển khai.
- `HEALTHCHECK` mỗi 30 giây, timeout 5 giây, chờ khởi động 40 giây, thử lại 3 lần, gọi `wget` tới `/api/v1/health/live`.
- Cổng lấy từ biến `PORT` (mặc định 8081).

## Compose phát triển (`docker-compose.yml`)

| Dịch vụ | Image | Cổng | Ghi chú |
|---|---|---|---|
| `mongodb` | `mongo:7.0` | `127.0.0.1:27017` | Healthcheck `ping`; mật khẩu mặc định `123456` nếu không đặt biến |
| `redis` | `redis:7-alpine` | `127.0.0.1:6379` | Không mật khẩu |
| `backend` (profile `full`) | build target `development` | `127.0.0.1:${PORT}` | Gắn mã nguồn vào container, hot reload; ghi đè `MONGO_URL`, `REDIS_HOST` để dùng dịch vụ trong compose |

Cổng chỉ gắn vào loopback nên không truy cập được từ mạng ngoài.

## Compose production (`docker-compose.prod.yml`)

| Dịch vụ | Image | Cổng | Ghi chú |
|---|---|---|---|
| `caddy` | `caddy:2-alpine` | `80`, `443` (cổng duy nhất publish) | Reverse proxy và TLS tự động cho `API_DOMAIN`, đọc [Caddyfile](../../Caddyfile); `mem_limit: 32m`; chờ backend khỏe |
| `backend` | `${DOCKERHUB_USER}/${IMAGE_NAME}:${IMAGE_TAG}` (build ở CI, không build trên VPS) | Không publish (`expose` nội bộ) | `init: true`, `mem_limit: 450m`; `env_file: .env.production`; `METRICS_PORT=9464` nội bộ; tự dựng `MONGO_URL` từ biến Mongo; volume `uploads` tại `/app/public/images` và `cv_storage` tại `/app/storage`; chờ Mongo và Redis khỏe |
| `mongodb` | `mongo:7.0` | Không publish | Biến root bắt buộc (`:?`), volume `mongodb_data`, `mongodb_config`; `mem_limit: 450m`, `--wiredTigerCacheSizeGB 0.25` |
| `redis` | `redis:7-alpine` | Không publish | `--requirepass`, `--appendonly yes`, `--maxmemory 64mb` với `noeviction` (BullMQ yêu cầu), `mem_limit: 96m`, volume `redis_data` |
| `prometheus` (profile `monitoring`) | `prom/prometheus:v3.13.5` | `127.0.0.1:9090` | Đọc `monitoring/prometheus.yml`, `alerts.yml`; giữ 15 ngày trong volume `prometheus_data` |
| `alertmanager` (profile `monitoring`) | `prom/alertmanager:v0.34.2` | không publish | Đọc `monitoring/alertmanager.yml` (không commit); volume `alertmanager_data` |

Tất cả dịch vụ nằm trong mạng `backend` riêng; log dùng driver `json-file` giữ 5 file mỗi file 10 MB.

## Điểm cần biết

- Compose prod **bắt buộc** `MONGO_INITDB_ROOT_USERNAME`, `MONGO_INITDB_ROOT_PASSWORD`, `REDIS_PASSWORD`, `DOCKERHUB_USER`, `IMAGE_TAG`, `API_DOMAIN` (cú pháp `${VAR:?}` làm lệnh lỗi nếu thiếu).
- `docker-compose.yml` (dev) và `docker-compose.prod.yml` cùng tên project mặc định (tên thư mục), nên **dùng chung volume** như `<thư-mục>_mongodb_data`. `MONGO_INITDB_*` chỉ có tác dụng khi volume còn trống: chạy thử bản prod trên máy dev với mật khẩu khác sẽ lỗi `Authentication failed`. Khi thử cục bộ hãy thêm `-p <tên-khác>` và đừng chạy `down -v` ở project mặc định.
- `MONGO_URL` và `REDIS_HOST` trong `.env.production` bị **ghi đè** bởi compose.
- Ứng dụng kết nối Mongo bằng tài khoản root ([production-security-checklist](../08-security/production-security-checklist.md)).
- Chỉ có một container `backend`: không có cấu hình nhân bản, và hệ thống chưa sẵn sàng cho nhiều instance ([scalability](../02-architecture/scalability.md)).
- `docker compose config` (dev) hợp lệ; chưa chạy được stack vì Docker daemon không phản hồi lúc tạo tài liệu.
