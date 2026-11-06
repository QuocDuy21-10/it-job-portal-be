# Môi trường phát triển local

Tài liệu này giải thích cách thiết lập và chạy backend khi phát triển. Nếu chỉ cần chạy thử nhanh, xem [quick-start.md](quick-start.md).

## Các thành phần cần có

Backend cần MongoDB và Redis đang chạy. Có hai cách:

| Cách | Lệnh | Backend chạy ở đâu |
|---|---|---|
| Chỉ chạy dịch vụ nền (khuyến nghị) | `npm run docker:dev` | Trên máy, bằng `npm run dev` |
| Chạy cả backend trong Docker | `npm run docker:full` | Trong container, có hot reload |

`docker-compose.yml` chỉ mở cổng của MongoDB và Redis trên `127.0.0.1`, nên không truy cập được từ mạng ngoài. Dữ liệu lưu trong các volume Docker `mongodb_data` và `redis_data`.

| Dịch vụ | Image | Cổng local | Kiểm tra sức khỏe |
|---|---|---|---|
| MongoDB | `mongo:7.0` | `127.0.0.1:27017` | `db.adminCommand('ping')` |
| Redis | `redis:7-alpine` | `127.0.0.1:6379` | `redis-cli ping` |
| Backend (profile `full`) | build từ `Dockerfile`, target `development` | `127.0.0.1:${PORT:-8081}` | |

Nguồn: [docker-compose.yml](../../docker-compose.yml).

## Cấu hình môi trường

Sao chép `.env.example` thành `.env` rồi điền giá trị. Danh sách biến bắt buộc nằm ở [quick-start.md](quick-start.md#giá-trị-bắt-buộc-trong-env). Nhóm biến theo chức năng:

| Nhóm | Ví dụ biến | Ghi chú |
|---|---|---|
| Ứng dụng | `PORT`, `NODE_ENV`, `FE_URL`, `CORS_ORIGINS`, `TRUST_PROXY`, `SWAGGER_ENABLED` | `FE_URL` được dùng làm danh sách CORS khi `CORS_ORIGINS` trống |
| MongoDB | `MONGO_URL`, `MONGO_INITDB_*` | `MONGO_INITDB_*` chỉ dùng cho container |
| Redis | `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `REDIS_QUEUE_DB`, `REDIS_CACHE_DB`, `REDIS_TTL` | Hàng đợi dùng DB 0, cache và rate limit dùng DB 1 theo mặc định trong code |
| Xác thực | `JWT_*`, `OTP_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | |
| Email | `SMTP_HOST`, `SMTP_EMAIL`, `SMTP_PASSWORD` | |
| AI | `GEMINI_API_KEY`, `GROQ_API_KEY`, `GROQ_*_MODEL`, `AI_GROQ_*` | |
| Giám sát | `LOG_LEVEL`, `SENTRY_DSN`, `SENTRY_TRACES_SAMPLE_RATE` | Không có `SENTRY_DSN` thì Sentry tắt |
| Dữ liệu mẫu | `EMAIL_ADMIN`, `INIT_PASSWORD` | Tài khoản quản trị tạo bởi `npm run seed` |

## Các lệnh trong `package.json`

| Lệnh | Tác dụng | Trạng thái |
|---|---|---|
| `npm run dev` | Chạy backend ở chế độ watch (`nest start --watch`) | |
| `npm run build` | Biên dịch vào `dist/` | |
| `npm run start:prod` | Chạy bản đã build (`node dist/main`) | |
| `npm run lint` | ESLint, **tự sửa** lỗi (`--fix`) | |
| `npm test` | Chạy toàn bộ unit test (Jest) | |
| `npm run test:cov` | Unit test kèm coverage | |
| `npm run test:e2e` | Chạy e2e với `test/jest-e2e.json` | |
| `npm run docker:dev`, `docker:full`, `docker:down`, `docker:logs` | Quản lý container | |
| `npm run seed` | Nạp dữ liệu mẫu bằng `src/databases/seeds/run-seed.ts` | Ghi vào database |
| `npm run dev:services`, `npm run dev:stop` | Gọi `./scripts/dev-start.sh`, `./scripts/dev-stop.sh` | Hỏng, xem bên dưới |
| `npm run migrate:locations` | Gọi `src/databases/migrations/run-location-standardization.ts` | Hỏng, xem bên dưới |

`npm run lint` có cờ `--fix` nên sẽ sửa file ngay trong working tree. Hãy commit hoặc stash thay đổi trước khi chạy nếu muốn xem riêng thay đổi do ESLint tạo ra.

## Known Limitation: script dev bị thiếu

Ba script trong `package.json` trỏ tới file không tồn tại trong repository:

| Script | File được gọi | Tình trạng |
|---|---|---|
| `dev:services` | `./scripts/dev-start.sh` | Thư mục `scripts/` không tồn tại. `.gitignore` có dòng `/scripts` nên thư mục này không được commit |
| `dev:stop` | `./scripts/dev-stop.sh` | Như trên |
| `migrate:locations` | `src/databases/migrations/run-location-standardization.ts` | Thư mục `src/databases/migrations/` rỗng |

Hãy dùng `npm run docker:dev` và `npm run docker:down` thay cho `dev:services` và `dev:stop`. Việc sửa các script này nằm ngoài phạm vi dự án tài liệu và chưa được thực hiện.

## Swagger

Swagger UI ở `http://localhost:8081/api`. Swagger bật khi `NODE_ENV` khác `production`, hoặc khi đặt `SWAGGER_ENABLED=true` ([main.ts](../../src/main.ts)). Xem thêm quy ước API ở `05-api` (sẽ bổ sung ở Phase 3).

## Kiểm thử

- Unit test nằm cạnh file nguồn, tên `*.spec.ts`. Chạy bằng `npm test`.
- E2E cấu hình ở `test/jest-e2e.json` và dùng `configureApp` từ [app.setup.ts](../../src/app.setup.ts) để chạy cùng pipeline với production. Thư mục `test/` hiện chưa được commit.

Chi tiết sẽ nằm ở `10-testing` (Phase 4).

## Quy ước khi phát triển

Quy ước code, đặt tên và kiến trúc service nằm trong các tài liệu tham khảo của thư mục `agent_docs/`:

- [code_conventions.md](../../agent_docs/code_conventions.md)
- [NAMING_CONVENTIONS.md](../../agent_docs/NAMING_CONVENTIONS.md)
- [SENIOR_BACKEND_PRACTICES.md](../../agent_docs/SENIOR_BACKEND_PRACTICES.md)

## Trạng thái xác minh

| Hạng mục | Trạng thái |
|---|---|
| Danh sách script, cổng, image Docker | Đã đối chiếu với `package.json` và `docker-compose.yml` |
| Ba script bị thiếu file | Đã xác minh bằng `ls` và `git check-ignore` |
| `npx tsc --noEmit` | Đã chạy, không có lỗi (2026-11-05) |
| Chạy thực tế cùng MongoDB và Redis | `Chưa xác minh`: Docker daemon không chạy trên máy tạo tài liệu |
