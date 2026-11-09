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
- `HEALTHCHECK` mỗi 30 giây, timeout 5 giây, chờ khởi động 40 giây, thử lại 3 lần, gọi `wget` tới `/api/v1/health`.
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
| `backend` | build target `production`, gắn tag `job-portal-be:latest` | `127.0.0.1:${PORT:-8081}` | `env_file: .env.production`; tự dựng `MONGO_URL` từ biến Mongo; volume `uploads` tại `/app/public/images` và `cv_storage` tại `/app/storage`; chờ Mongo và Redis khỏe |
| `mongodb` | `mongo:7.0` | Không publish | Biến root bắt buộc (`:?`), volume `mongodb_data`, `mongodb_config` |
| `redis` | `redis:7-alpine` | Không publish | `--requirepass`, `--appendonly yes`, volume `redis_data` |

Tất cả dịch vụ nằm trong mạng `backend` riêng; log dùng driver `json-file` giữ 5 file mỗi file 10 MB.

## Điểm cần biết

- Compose prod **bắt buộc** `MONGO_INITDB_ROOT_USERNAME`, `MONGO_INITDB_ROOT_PASSWORD`, `REDIS_PASSWORD` (cú pháp `${VAR:?}` làm lệnh lỗi nếu thiếu).
- `MONGO_URL` và `REDIS_HOST` trong `.env.production` bị **ghi đè** bởi compose.
- Ứng dụng kết nối Mongo bằng tài khoản root ([production-security-checklist](../08-security/production-security-checklist.md)).
- Chỉ có một container `backend`: không có cấu hình nhân bản, và hệ thống chưa sẵn sàng cho nhiều instance ([scalability](../02-architecture/scalability.md)).
- `docker compose config` (dev) hợp lệ; chưa chạy được stack vì Docker daemon không phản hồi lúc tạo tài liệu.
