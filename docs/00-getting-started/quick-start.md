# Chạy thử trong 5 phút

Hướng dẫn này đưa backend lên chạy trên máy cá nhân với MongoDB và Redis trong Docker. Phần giải thích chi tiết nằm ở [local-development.md](local-development.md).

## Yêu cầu

| Công cụ | Phiên bản | Nguồn |
|---|---|---|
| Node.js | 24 (`.nvmrc` ghi `24.22.1`, `engines` yêu cầu `>=24`) | [.nvmrc](../../.nvmrc), [package.json](../../package.json) |
| npm | đi kèm Node | |
| Docker và Docker Compose | bản mới | để chạy MongoDB 7 và Redis 7 |

README gốc của repository đang ghi Node 20, nhưng `package.json` và `Dockerfile` đều dùng Node 24. Hãy dùng Node 24. Việc sửa README nằm trong kế hoạch migration.

## Các bước

```bash
# 1. Chọn đúng phiên bản Node
nvm use

# 2. Cài dependency
npm ci

# 3. Tạo file cấu hình rồi điền các giá trị bắt buộc (xem bên dưới)
cp .env.example .env

# 4. Chạy MongoDB và Redis
npm run docker:dev

# 5. Nạp dữ liệu mẫu, gồm tài khoản quản trị và nguồn tin ngoài
npm run seed

# 6. Chạy backend ở chế độ watch
npm run dev
```

Khi chạy thành công, API ở `http://localhost:8081/api/v1` và Swagger ở `http://localhost:8081/api`.

## Giá trị bắt buộc trong `.env`

Ứng dụng từ chối khởi động nếu thiếu các biến sau (kiểm tra trong [env.validation.ts](../../src/config/env.validation.ts)):

| Biến | Cách tạo giá trị |
|---|---|
| `MONGO_URL` | Chuỗi kết nối tới MongoDB. Dùng đúng giá trị mẫu trong `.env.example` để khớp với `docker-compose.yml` |
| `JWT_ACCESS_TOKEN_SECRET`, `JWT_REFRESH_TOKEN_SECRET` | Chuỗi ngẫu nhiên, ví dụ `openssl rand -hex 32` |
| `JWT_ACCESS_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN` | Thời hạn token, theo giá trị mẫu |
| `OTP_SECRET` | Chuỗi ngẫu nhiên, ví dụ `openssl rand -hex 32` |

Ở môi trường `production`, bắt buộc thêm `FE_URL` và `CORS_ORIGINS`.

Ngoài ra `.env.example` đánh dấu `GEMINI_API_KEY` và nhóm `AI_GROQ_*` là bắt buộc để dùng tính năng AI. Thiếu `GEMINI_API_KEY` thì `GeminiService` không khởi động. Mô tả đầy đủ các biến sẽ nằm ở `14-reference`.

Không commit file `.env`. File này đã nằm trong `.gitignore`.

## Kiểm tra nhanh

```bash
curl http://localhost:8081/api/v1/health
```

Endpoint kiểm tra kết nối MongoDB và Redis ([health.controller.ts](../../src/health/health.controller.ts)).

## Gặp sự cố

| Triệu chứng | Nguyên nhân thường gặp |
|---|---|
| `Missing required environment variables: ...` khi khởi động | Thiếu biến bắt buộc trong `.env` |
| Không kết nối được MongoDB hoặc Redis | Container chưa chạy. Dùng `npm run docker:logs` để xem |
| `npm run dev:services` báo lỗi không tìm thấy script | Xem mục Known Limitation trong [local-development.md](local-development.md#known-limitation-script-dev-bị-thiếu) |

## Trạng thái xác minh

| Hạng mục | Trạng thái |
|---|---|
| `npx tsc --noEmit` | Đã chạy, không có lỗi (2026-11-05) |
| `docker compose config` | Đã chạy, cấu hình hợp lệ |
| Chạy MongoDB, Redis, `npm run seed`, `npm run dev` | `Chưa xác minh`: Docker daemon không chạy trên máy tạo tài liệu, và `npm run seed` ghi dữ liệu nên chưa được chạy khi chưa có sự cho phép |
