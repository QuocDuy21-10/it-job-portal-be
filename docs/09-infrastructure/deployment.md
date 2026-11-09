# Triển khai

Hướng dẫn triển khai lên một VPS bằng Docker Compose. Nội dung được chuyển từ `DEPLOYMENT.md` (tiếng Anh, nay chỉ còn trỏ tới đây), đã đối chiếu với [docker-compose.prod.yml](../../docker-compose.prod.yml) và [Dockerfile](../../Dockerfile). Các lệnh dưới đây **chưa được chạy** khi tạo tài liệu (không có Docker daemon và không có VPS): `Chưa xác minh`.

## Hai cách chạy

| | Phát triển | Production (VPS) |
|---|---|---|
| File compose | `docker-compose.yml` | `docker-compose.prod.yml` |
| File môi trường | `.env` | `.env.production` |
| Backend | `npm run dev` trên máy | Image `production`, không phải root, có healthcheck |
| MongoDB và Redis | Gắn vào `127.0.0.1` | Mạng Docker riêng, không publish, Redis có mật khẩu |
| HTTPS | Không | nginx (hoặc Caddy) ngoài repository |
| Swagger | `http://localhost:8081/api` | Tắt (đặt `SWAGGER_ENABLED=true` để mở) |

Chạy local: [quick-start](../00-getting-started/quick-start.md).

## Kiến trúc triển khai tham chiếu

Cấu hình mẫu trong `DEPLOYMENT.md`: Ubuntu 22.04 trở lên, 2 vCPU, 4 GB RAM, Docker Engine kèm Compose plugin. Sơ đồ: [container-diagram](../02-architecture/container-diagram.md).

## Các bước

### 1. Chuẩn bị máy chủ

- Tường lửa chỉ mở SSH, 80, 443 (ví dụ `ufw`).
- Cài Docker Engine, nginx và certbot.
- **Lưu ý:** cổng do Docker publish bỏ qua `ufw`. Vì vậy mọi cổng trong compose production gắn vào `127.0.0.1`; không đổi điều này.

### 2. Cấu hình môi trường

```bash
git clone <repo-url> /opt/job-portal-be && cd /opt/job-portal-be
cp .env.example .env.production
chmod 600 .env.production
```

Đặt tối thiểu (giá trị thật tự sinh bằng `openssl rand -hex ...`, không lưu vào git):

```dotenv
NODE_ENV=production
PORT=8081
FE_URL=https://example.com
CORS_ORIGINS=https://example.com,https://www.example.com
TRUST_PROXY=1
MONGO_INITDB_ROOT_PASSWORD=<chuỗi hex ngẫu nhiên>
REDIS_PASSWORD=<chuỗi hex ngẫu nhiên>
JWT_ACCESS_TOKEN_SECRET=<chuỗi hex ngẫu nhiên>
JWT_REFRESH_TOKEN_SECRET=<chuỗi hex ngẫu nhiên>
OTP_SECRET=<chuỗi hex ngẫu nhiên>
```

kèm các biến `SMTP_*`, `GOOGLE_*`, `GEMINI_*`, `GROQ_*`, `AI_GROQ_*`, `EMAIL_ADMIN`, `INIT_PASSWORD`. Danh sách đầy đủ: [environment-variables](../14-reference/environment-variables.md).

- Dùng mật khẩu hex vì `MONGO_URL` được dựng từ chúng; ký tự `@ / :` làm hỏng URI.
- `MONGO_URL` và `REDIS_HOST` trong file bị compose ghi đè.
- Cookie refresh là `Secure` và `SameSite=Strict` ở production, nên frontend và API phải phục vụ qua HTTPS và **cùng site** (ví dụ `example.com` và `api.example.com`).

### 3. Khởi động

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
docker compose -f docker-compose.prod.yml ps          # backend sẽ chuyển "healthy"
curl -s http://127.0.0.1:8081/api/v1/health
```

### 4. Dữ liệu ban đầu (cân nhắc kỹ)

`DEPLOYMENT.md` hướng dẫn chạy `npm run seed` từ image `development` trong cùng mạng Docker để tạo tài khoản quản trị. **Seed không chỉ tạo admin**: nó tạo 95 tài khoản mẫu (20 HR, 75 ứng viên) dùng chung `INIT_PASSWORD`, cùng công ty, tin, CV và hồ sơ mẫu, và không kiểm tra môi trường. Đọc [production-security-checklist](../08-security/production-security-checklist.md#mục-cần-xử-lý-trước-khi-chạy-production-seed) trước khi chạy ở production.

### 5. Reverse proxy và TLS

Cấu hình nginx mẫu trong `DEPLOYMENT.md` trỏ tới `127.0.0.1:8081` và có các điểm quan trọng:

| Thiết lập | Lý do |
|---|---|
| `client_max_body_size 10m` | Ứng dụng giới hạn upload 5 MB |
| `proxy_set_header X-Forwarded-For ...` và `TRUST_PROXY=1` | Để rate limit và phiên dùng IP thật; thiếu thì mọi người dùng chung IP của proxy |
| `Upgrade` và `Connection "upgrade"` | Socket.IO ở `/notifications` cần WebSocket |
| `proxy_buffering off`, `proxy_read_timeout 300s` | Stream chat SSE không bị gom đệm hay cắt |

Cấp chứng chỉ bằng certbot. Cấu hình proxy không nằm trong repository nên không kiểm chứng được.

### 6. Cập nhật phiên bản

```bash
git pull
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build backend
docker image prune -f
```

`SIGTERM` từ `docker stop` kích hoạt shutdown hook của Nest nên hàng đợi và kết nối database đóng gọn (`app.enableShutdownHooks()` trong [main.ts](../../src/main.ts)). Quá trình này **có thời gian ngừng** ngắn vì chỉ có một container, và các token trong `CACHE_MANAGER` (đặt lại mật khẩu, hủy xóa tài khoản) mất khi khởi động lại ([data-flow](../02-architecture/data-flow.md#known-limitation-cache_manager-chạy-trong-bộ-nhớ-không-phải-redis)).

### Nâng cấp Phase 1 (chạy một lần)

Sau khi khởi động backend mới, dời file CV cũ sang volume private:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production exec backend \
  node dist/databases/migrations/move-cv-files-to-private-storage.js
```

Exit code 1 nghĩa là có file trùng tên khác nội dung; file đó vẫn nằm ở `public/images/...` và cần xử lý tay.

### 7. Sao lưu

Xem [backup-and-recovery](../11-operations/backup-and-recovery.md).

## Rollback

Repository **không có quy trình rollback** được ghi lại. Cách khả thi theo cấu trúc hiện tại (suy ra, chưa thử): `git checkout` về commit trước rồi chạy lại lệnh `up -d --build backend`; image mới ghi đè tag `job-portal-be:latest` nên bản cũ không còn nếu không gắn tag riêng. Thay đổi schema hay index đã áp dụng không tự hoàn tác (Mongoose tạo index khi khởi động và không có migration). Xem [backup-and-recovery](../11-operations/backup-and-recovery.md#rollback).

## Known Limitation

- Không có CD, không có staging; mọi bước là tay.
- Một container, không có nhân bản; cần xử lý cron, Socket.IO, cache và file trước khi chạy nhiều instance ([scalability](../02-architecture/scalability.md)).
- Image dùng tag `latest`, không có phiên bản.
