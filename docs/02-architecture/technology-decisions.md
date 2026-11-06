# Công nghệ sử dụng và lý do lựa chọn

Tài liệu này liệt kê công nghệ chính và phân biệt hai loại lý do:

- **Có bằng chứng**: lấy từ comment trong code, cấu hình hoặc hành vi quan sát được.
- **Suy luận**: lý do hợp lý nhưng repository không ghi lại. Các mục này cần tác giả xác nhận trước khi được viết thành ADR `Accepted`.

Phiên bản lấy từ [package.json](../../package.json).

## Bảng tổng hợp

| Lớp | Công nghệ | Vai trò trong DevLink |
|---|---|---|
| Runtime | Node.js 24, TypeScript 5 | Môi trường chạy. `.nvmrc`, `engines` và `Dockerfile` đều dùng Node 24 |
| Framework | NestJS 10 (nền Express) | Module hóa, dependency injection, guard, interceptor |
| Cơ sở dữ liệu | MongoDB 7, Mongoose 7 | Lưu dữ liệu nghiệp vụ, truy vấn aggregation |
| Xóa mềm | `soft-delete-plugin-mongoose` | Gắn vào mọi kết nối Mongoose |
| Hàng đợi | BullMQ trên Redis | Xử lý nền, retry, giới hạn tốc độ |
| Cache và giới hạn | Redis (`ioredis`), `@nestjs/throttler` | Rate limit lưu trên Redis, OTP và quota |
| Xác thực | JWT, Passport (local, jwt, jwt-refresh), Google OAuth | Phiên đăng nhập |
| Phân quyền | `ERole` + `RolesGuard`, CASL | Kiểm tra vai trò và chính sách |
| AI | Google Gemini (`@google/genai`), Groq (`groq-sdk`) | Đọc CV, chat, tóm tắt |
| Thời gian thực | Socket.IO (`@nestjs/websockets`) | Thông báo |
| Email | Nodemailer qua `@nestjs-modules/mailer`, Handlebars | Gửi email theo template |
| File | Multer, `pdf-parse`, `mammoth` | Tải file, đọc PDF và DOCX |
| Log | `nestjs-pino` | Log JSON có request id |
| Lỗi | Sentry (`@sentry/nestjs`) | Báo cáo lỗi |
| Tài liệu API | `@nestjs/swagger` | OpenAPI tại `/api` |
| Kiểm thử | Jest, Supertest | Unit và e2e |
| Đóng gói | Docker, Docker Compose, GitHub Actions | Triển khai và CI |

## Các lựa chọn chính

### Một ứng dụng NestJS, không tách microservice

- **Có bằng chứng:** `AppModule` import toàn bộ module, processor BullMQ nằm trong cùng tiến trình ([queues.module.ts](../../src/queues/queues.module.ts)). `AGENTS.md` mô tả repository là một backend duy nhất, không phải monorepo.
- **Suy luận:** dự án có quy mô một nhóm nhỏ, nên một đơn vị triển khai giảm chi phí vận hành.
- **Đánh đổi:** tải xử lý nền cạnh tranh tài nguyên với API. Xem [scalability.md](scalability.md).

### MongoDB và Mongoose

- **Có bằng chứng:** schema dùng nhiều tài liệu lồng nhau, ví dụ `CvProfile` có hơn 50 đường dẫn field và `Job` nhúng snapshot công ty. Tìm kiếm hợp nhất dùng MongoDB aggregation `$unionWith` ([job-search-pipeline.ts](../../src/job-search/job-search-pipeline.ts) có kiểm thử riêng).
- **Suy luận:** dữ liệu dạng tài liệu (CV, tin tuyển dụng có cấu trúc thay đổi theo nguồn) khớp với mô hình document.
- **Đánh đổi:** MongoDB không ép khóa ngoại. Quan hệ tham chiếu do code giữ nhất quán. Xem tài liệu `04-database` (Phase 2).

### BullMQ cho xử lý nền

- **Có bằng chứng:** hàng đợi `resume-processing` có `limiter` 15 job mỗi 60 giây với comment "Mirror the current Gemini ... RPM ceiling" ([resume-queue.processor.ts](../../src/queues/processors/resume-queue.processor.ts)). Cấu hình mặc định cho mọi hàng đợi là 3 lần thử, backoff mũ bắt đầu từ 2 giây ([redis.module.ts](../../src/redis/redis.module.ts)).
- **Kết luận từ bằng chứng:** hàng đợi được dùng để giữ tốc độ gọi AI dưới trần của nhà cung cấp và để request HTTP không phải chờ.
- **Đánh đổi:** worker chung tiến trình với API.

### Hai nhà cung cấp AI với dự phòng

- **Có bằng chứng:** [ai.constants.ts](../../src/ai/ai.constants.ts) đặt Groq làm nhà cung cấp chính mặc định cho chat và tóm tắt, bật dự phòng sang Gemini mặc định. [ai.service.ts](../../src/ai/ai.service.ts) có logic nhận diện lỗi giới hạn tốc độ và lỗi đủ điều kiện chuyển dự phòng.
- **Suy luận:** dùng hai nhà cung cấp để giảm rủi ro khi một bên bị giới hạn hoặc lỗi. Lý do chọn Groq làm chính (tốc độ, chi phí) không được ghi trong repository.

### Quy tắc nghiệp vụ nằm ở backend, AI chỉ hỗ trợ

- **Có bằng chứng:** [AGENTS.md](../../AGENTS.md) ghi "models extract or generate content, but backend services own deterministic rules and final behavior". Module `matching` tính điểm bằng code riêng, không gọi AI.

### Xác thực: access token ngắn hạn, refresh token trong cookie

- **Có bằng chứng:** có hai secret và hai thời hạn riêng (`JWT_ACCESS_*`, `JWT_REFRESH_*`), route `GET /api/v1/auth/refresh` dùng chiến lược `jwt-refresh` và CORS bật `credentials: true`.
- **Chưa xác minh:** cách lưu refresh token và cơ chế thu hồi sẽ được mô tả ở `08-security` sau khi đọc `src/auth/` và `src/sessions/`.

### Validate cấu hình khi khởi động

- **Có bằng chứng:** [env.validation.ts](../../src/config/env.validation.ts) ném lỗi nếu thiếu biến bắt buộc, với comment "Fails fast at boot instead of at the first request that needs a missing key".

## Known Limitation: một số lý do lựa chọn không có trong repository

Repository không có ghi chú giải thích vì sao chọn MongoDB thay vì cơ sở dữ liệu quan hệ, Groq thay vì nhà cung cấp khác, hay Express thay vì Fastify. Các mục "suy luận" ở trên cần tác giả xác nhận. Khi có xác nhận, ghi thành ADR ở `12-decisions` với trạng thái `Accepted`.
