# Biến môi trường

Tham chiếu mọi biến môi trường trong [.env.example](../../.env.example) và các biến mà code đọc thêm. **Không có giá trị thật nào** trong tài liệu này; không đọc file `.env`. Cột "Mặc định" là giá trị trong code khi không đặt biến.

Cách nạp: `ConfigModule.forRoot({ envFilePath: '.env', isGlobal: true, validate: validateEnv })` ([app.module.ts](../../src/app.module.ts)). Biến đặt trong môi trường tiến trình được ưu tiên hơn file `.env`. Hàm kiểm tra [env.validation.ts](../../src/config/env.validation.ts) kiểm tra **tồn tại**; riêng `METRICS_PORT` được kiểm tra định dạng.

Ký hiệu cột "Bắt buộc": `Boot` = thiếu thì ứng dụng không khởi động; `Prod` = bắt buộc thêm ở `NODE_ENV=production`; `Seed` = bắt buộc khi chạy `npm run seed`; `Compose` = bắt buộc bởi `docker-compose.prod.yml`; `Không` = tùy chọn.

## Ứng dụng

| Biến | Bắt buộc | Mặc định | Dùng cho |
|---|---|---|---|
| `PORT` | Không | `8081` | Cổng HTTP |
| `NODE_ENV` | Không | `development` | `production` bật cookie `Secure`, tắt Swagger, log JSON, yêu cầu thêm biến |
| `FE_URL` | Prod | `http://localhost:3000` | Liên kết trong email; danh sách CORS khi không có `CORS_ORIGINS` |
| `CORS_ORIGINS` | Prod | rơi về `FE_URL` | Danh sách origin cho phép, cách nhau bằng dấu phẩy |
| `TRUST_PROXY` | Không | không đặt | Số bước proxy tin cậy (số nguyên) hoặc giá trị Express; cần khi chạy sau nginx |
| `SWAGGER_ENABLED` | Không | tắt ở production | `true` để mở Swagger ở production |
| `IMAGE_TAG` | Không | `latest` | Chỉ dùng bởi `docker-compose.prod.yml` (tag image backend); đặt trong `.env.production`, xem [rollback](../11-operations/rollback.md) |

## Log và giám sát

| Biến | Bắt buộc | Mặc định | Dùng cho |
|---|---|---|---|
| `LOG_LEVEL` | Không | `info` (production), `debug` | Mức log pino |
| `SENTRY_DSN` | Không | trống: tắt Sentry | Đích báo lỗi |
| `SENTRY_TRACES_SAMPLE_RATE` | Không | `0` | Tỷ lệ trace |
| `METRICS_PORT` | Không | trống: tắt | Port server `/metrics` nội bộ; phải là số nguyên 1–65535. Compose production đặt `9464` |

## MongoDB

| Biến | Bắt buộc | Mặc định | Dùng cho |
|---|---|---|---|
| `MONGO_URL` | Boot | không | Chuỗi kết nối. Compose prod ghi đè bằng URL dựng từ các biến `MONGO_INITDB_*` |
| `MONGO_INITDB_ROOT_USERNAME` | Compose | `root` (compose dev) | Khởi tạo tài khoản root của container |
| `MONGO_INITDB_ROOT_PASSWORD` | Compose | `123456` (compose dev) | Mật khẩu root; production phải đặt mạnh, dạng hex để không phá URI |
| `MONGO_INITDB_DATABASE` | Không | `my-job-portal` | Tên database |

Ứng dụng không đọc ba biến `MONGO_INITDB_*`; chỉ Docker Compose dùng chúng.

## Redis

| Biến | Bắt buộc | Mặc định | Dùng cho |
|---|---|---|---|
| `REDIS_HOST` | Không | `localhost` | Máy chủ Redis (compose prod ghi đè `redis`) |
| `REDIS_PORT` | Không | `6379` | Cổng |
| `REDIS_PASSWORD` | Compose | không | Mật khẩu; compose prod bắt buộc |
| `REDIS_QUEUE_DB` | Không | `0` | DB cho hàng đợi BullMQ |
| `REDIS_CACHE_DB` | Không | `1` | DB cho cache danh sách, OTP, quota, rate limit |
| `REDIS_TTL` | Không | `3600000` | TTL mặc định truyền cho `CacheModule`; lưu ý `CACHE_MANAGER` thực tế chạy trong bộ nhớ ([data-flow](../02-architecture/data-flow.md#known-limitation-cache_manager-chạy-trong-bộ-nhớ-không-phải-redis)) |

## Xác thực

| Biến | Bắt buộc | Mặc định | Dùng cho |
|---|---|---|---|
| `JWT_ACCESS_TOKEN_SECRET` | Boot | không | Ký access token; cũng dùng xác minh token của Socket.IO. Production: tối thiểu 32 ký tự |
| `JWT_ACCESS_EXPIRES_IN` | Boot | không | Thời hạn access token (`.env.example` mẫu `15m`) |
| `JWT_REFRESH_TOKEN_SECRET` | Boot | không | Ký refresh token và tính HMAC lưu phiên. Production: tối thiểu 32 ký tự, phải khác `JWT_ACCESS_TOKEN_SECRET` |
| `JWT_REFRESH_EXPIRES_IN` | Boot | không | Thời hạn refresh token và cookie (mẫu `7d`) |
| `OTP_SECRET` | Boot | không | Khóa HMAC cho OTP. Production: tối thiểu 32 ký tự |
| `GOOGLE_CLIENT_ID` | Không | không | `audience` khi xác minh Google ID token |
| `GOOGLE_CLIENT_SECRET` | Không | không | **Không có chỗ nào trong `src/` đọc biến này** |

Tạo secret bằng `openssl rand -hex 32`. Không đưa vào git.

## Dữ liệu mẫu

| Biến | Bắt buộc | Mặc định | Dùng cho |
|---|---|---|---|
| `EMAIL_ADMIN` | Seed | không | Email tài khoản quản trị tạo bởi seed |
| `INIT_PASSWORD` | Seed | không | Mật khẩu của **mọi** tài khoản do seed tạo (admin, 20 HR, 75 ứng viên) |

## Email

| Biến | Bắt buộc | Mặc định | Dùng cho |
|---|---|---|---|
| `SMTP_HOST` | Không | không | Máy chủ SMTP |
| `SMTP_EMAIL` | Không | không | Tên đăng nhập SMTP |
| `SMTP_PASSWORD` | Không | không | Mật khẩu SMTP |

Thiếu cấu hình SMTP không làm ứng dụng từ chối khởi động nhưng gửi email sẽ lỗi.

## Nhà cung cấp AI

| Biến | Bắt buộc | Mặc định | Dùng cho |
|---|---|---|---|
| `GEMINI_API_KEY` | Không (thực tế có) | không | Khóa Gemini; `GeminiService` không khởi động nếu thiếu theo `.env.example` |
| `GEMINI_MODEL` | Không | `gemini-3.1-flash-lite` | Mô hình Gemini |
| `GROQ_API_KEY` | Không | không | Khóa Groq; thiếu thì Groq không khả dụng |
| `GROQ_CHAT_MODEL` | Không | `openai/gpt-oss-20b` | Mô hình chat |
| `GROQ_SUMMARY_MODEL` | Không | như mô hình chat | Mô hình tóm tắt |
| `GROQ_TIMEOUT_MS` | Không | `30000` | Thời gian chờ của SDK |
| `GROQ_MAX_RETRIES` | Không | `2` | Số lần SDK thử lại |
| `AI_CHAT_PRIMARY_PROVIDER` | Không | `groq` | Nhà cung cấp chính cho chat (`gemini` hoặc `groq`) |
| `AI_CHAT_GEMINI_FALLBACK_ENABLED` | Không | bật | Cho phép dự phòng Gemini khi chat |
| `AI_SUMMARY_PRIMARY_PROVIDER` | Không | `groq` | Nhà cung cấp chính cho tóm tắt |
| `AI_SUMMARY_GEMINI_FALLBACK_ENABLED` | Không | bật | Cho phép dự phòng Gemini khi tóm tắt |
| `AI_COST_GROQ_PROMPT_USD_PER_1K` | Không | `0` | Đơn giá token đầu vào để ước tính chi phí (mẫu khác: `AI_COST_PROMPT_USD_PER_1K`) |
| `AI_COST_GROQ_COMPLETION_USD_PER_1K` | Không | `0` | Đơn giá token đầu ra |

## Ngân sách ngữ cảnh gửi Groq

`.env.example` ghi nhóm này là bắt buộc và `AIService` kiểm tra; trong code có giá trị mặc định ([ai.constants.ts](../../src/ai/ai.constants.ts)).

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `AI_GROQ_HISTORY_LIMIT` | `6` | Số tin lịch sử |
| `AI_GROQ_MAX_INPUT_TOKENS` | `6000` | Trần token đầu vào |
| `AI_GROQ_MAX_MATCHING_JOBS` | `3` | Số tin phù hợp đưa vào prompt |
| `AI_GROQ_MAX_SEARCH_RESULTS` | `3` | Số kết quả tìm kiếm |
| `AI_GROQ_MAX_COMPANY_ITEMS` | `2` | Số công ty |
| `AI_GROQ_MAX_TOP_SKILLS` | `5` | Số kỹ năng hàng đầu |
| `AI_GROQ_MAX_TOP_COMPANIES` | `5` | Số công ty hàng đầu |
| `AI_GROQ_MAX_SUMMARY_CHARS` | `400` | Độ dài tóm tắt |

## Quota Gemini

Mọi biến tùy chọn; mặc định ở [gemini-quota.constants.ts](../../src/gemini/gemini-quota.constants.ts) và [gemini-quota.service.ts](../../src/gemini/gemini-quota.service.ts). Cơ chế: [cv-parsing-and-matching](../03-modules/cv-parsing-and-matching.md#giữ-quota-gemini).

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `GEMINI_RPM` | `15` | Giới hạn mỗi phút |
| `GEMINI_DAILY_BUDGET` | `450` | Ngân sách mỗi ngày |
| `GEMINI_DAILY_ALERT_THRESHOLDS` | `70,85,95` | Ngưỡng cảnh báo (phần trăm) |
| `GEMINI_PARSE_MINUTE_RESERVE`, `GEMINI_PARSE_DAILY_RESERVE` | `0`, `0` | Phần chừa của việc đọc CV |
| `GEMINI_SUMMARY_MINUTE_RESERVE`, `GEMINI_SUMMARY_DAILY_RESERVE` | `4`, `50` | Phần chừa của tóm tắt |
| `GEMINI_CHAT_FALLBACK_MINUTE_RESERVE`, `GEMINI_CHAT_FALLBACK_DAILY_RESERVE` | `2`, `25` | Phần chừa của chat dự phòng |
| `GEMINI_QUOTA_RETRY_JITTER_MS` | `1000` | Nhiễu ngẫu nhiên khi lên lịch lại việc đọc CV |

## Chat

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `CHAT_QUOTA_NORMAL_USER_DAILY_LIMIT` | `30` | Lượt mỗi ngày cho `NORMAL USER` khi không có bản ghi chính sách |
| `CHAT_QUOTA_HR_DAILY_LIMIT` | `100` | Lượt mỗi ngày cho `HR` |
| `CHAT_CONTEXT_CACHE_TTL_MS` | 10 phút | TTL cache ngữ cảnh chat |
| `CHAT_FAQ_CACHE_TTL_MS` | 24 giờ | TTL cache FAQ |
| `CHAT_TOOL_ACTION_EXPIRY_MS` | 15 phút | Thời hạn xác nhận hành động |

## Bí mật cần bảo vệ

`JWT_ACCESS_TOKEN_SECRET`, `JWT_REFRESH_TOKEN_SECRET`, `OTP_SECRET`, `MONGO_INITDB_ROOT_PASSWORD`, `REDIS_PASSWORD`, `SMTP_PASSWORD`, `GOOGLE_CLIENT_SECRET`, `GEMINI_API_KEY`, `GROQ_API_KEY`, `INIT_PASSWORD`, `SENTRY_DSN`. Danh sách trước khi mở production: [production-security-checklist](../08-security/production-security-checklist.md).
