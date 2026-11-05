# Module hạ tầng dùng chung

Gộp các module nhỏ không chứa nghiệp vụ: `redis`, `health`, `databases`, `profile-identity`, `config`. Mỗi module ngắn nên không tách thành file riêng.

## Redis (`src/redis/`)

[redis.module.ts](../../src/redis/redis.module.ts) là module toàn cục, cung cấp ba thứ khác nhau dễ bị nhầm:

| Provider | Công nghệ | Redis DB | Dùng cho |
|---|---|---|---|
| `BullModule` | BullMQ | `REDIS_QUEUE_DB` (mặc định 0) | Bảy hàng đợi |
| `REDIS_CLIENT` | ioredis | `REDIS_CACHE_DB` (mặc định 1) | OTP, quota chat, cache danh sách, health check, throttler (kết nối riêng cùng DB) |
| `CACHE_MANAGER` | `@nestjs/cache-manager` | Cấu hình ghi `db: 1` nhưng **thực tế chạy trong bộ nhớ** | Token đặt lại mật khẩu, token hủy xóa, cache chat, thống kê, kỹ năng |

Tùy chọn mặc định của mọi hàng đợi: 3 lần thử, backoff mũ bắt đầu 2 giây, giữ 100 job hoàn thành tối đa 1 giờ, giữ 500 job lỗi tối đa 24 giờ.

### Cache danh sách (`ListCacheService`)

Cache cho danh sách tin và công ty, dùng `REDIS_CLIENT` nên **thật sự nằm trong Redis**.

| Hạng mục | Chi tiết |
|---|---|
| Khóa | `list-cache:entry:<endpoint>:<sha256 của tham số>` |
| TTL | Tin 60 giây, công ty 3 phút ([list-cache.constants.ts](../../src/redis/list-cache.constants.ts)) |
| Thẻ (tag) | Mỗi mục gắn các thẻ như `list:jobs:company:<id>`; có tập chỉ mục thẻ trong Redis |
| Vô hiệu hóa | `reclaimByTags(tags)` xóa mọi mục gắn thẻ rồi dọn chỉ mục |
| Lỗi Redis | Đọc hoặc ghi lỗi chỉ log cảnh báo và gọi thẳng nguồn dữ liệu (fail-open) |
| Phạm vi | `public`, `super-admin`, `hr:<companyId>` để HR không thấy dữ liệu của người khác từ cache |

Chiến lược cache đầy đủ: `02-architecture/caching-strategy.md` (Phase 3).

## Health (`src/health/`)

`GET /api/v1/health` công khai, không giới hạn tốc độ, kiểm tra MongoDB (`pingCheck`) và Redis (`ping`). Chi tiết ở [observability](../02-architecture/observability.md#health-check).

## Databases (`src/databases/`)

| Thành phần | Vai trò |
|---|---|
| [seed.service.ts](../../src/databases/seeds/seed.service.ts) | `npm run seed`: kiểm tra biến môi trường, rồi tạo kỹ năng, nguồn tin, công ty, người dùng, tin, CV, hồ sơ mẫu theo đúng thứ tự phụ thuộc |
| [databases.controller.ts](../../src/databases/databases.controller.ts) | Controller **không có route nào** (chỉ khai báo `@Controller('databases')`) |
| `migrations/` | Thư mục rỗng |

Seed cần `EMAIL_ADMIN` và `INIT_PASSWORD` để tạo tài khoản quản trị. Seed ghi vào database nên chưa được chạy khi viết tài liệu. Tính idempotent (chạy lại có tạo trùng không): `Chưa xác minh`.

## Profile identity (`src/profile-identity/`)

[profile-identity-sync.service.ts](../../src/profile-identity/profile-identity-sync.service.ts) đồng bộ danh tính (`_id`, `name`, `email`, `avatar`) giữa `users` và `cvprofiles`, để họ tên, email và ảnh trong CV khớp tài khoản. Dùng bởi `users` và `cv-profiles`.

## Config (`src/config/`)

[env.validation.ts](../../src/config/env.validation.ts) chạy lúc khởi động qua `ConfigModule.forRoot({ validate })`. Thiếu `MONGO_URL`, `JWT_ACCESS_TOKEN_SECRET`, `JWT_REFRESH_TOKEN_SECRET`, `JWT_ACCESS_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN`, `OTP_SECRET` thì ném lỗi; ở `production` bắt buộc thêm `FE_URL` và `CORS_ORIGINS`. Hàm cũng đặt mặc định `PORT=8081`, `NODE_ENV=development`, `FE_URL=http://localhost:3000`. Có file test.

**Known Limitation:** hàm chỉ kiểm tra biến tồn tại, không kiểm tra định dạng hay độ mạnh (ví dụ độ dài secret JWT). `GEMINI_API_KEY` và `AI_GROQ_*` được `.env.example` ghi là bắt buộc nhưng do `GeminiService` và `AIService` tự kiểm tra, không nằm trong hàm này.

## Testing

`redis/` có 1 file test, `databases/` có 1 (builder dữ liệu seed), `profile-identity/` có 1, `config/` có 1. `health/` không có.

## Source References

[src/redis/](../../src/redis/), [src/health/](../../src/health/), [src/databases/](../../src/databases/), [src/profile-identity/](../../src/profile-identity/), [src/config/](../../src/config/).
