# Cấu trúc dự án

Repository là **một ứng dụng NestJS duy nhất**, không phải monorepo. Tài liệu này giúp tìm đúng thư mục khi cần đọc hoặc sửa một tính năng.

## Thư mục gốc

| Đường dẫn | Vai trò |
|---|---|
| [src/](../../src/) | Toàn bộ mã nguồn backend |
| [test/](../../test/) | Cấu hình và test e2e (chưa commit tại thời điểm viết) |
| [docs/](../README.md) | Tài liệu dự án |
| [agent_docs/](../../agent_docs/) | Ghi chú kỹ thuật cho công cụ AI và developer |
| [public/](../../public/) | File tĩnh và ảnh tải lên, được serve trực tiếp |
| [Dockerfile](../../Dockerfile), [docker-compose.yml](../../docker-compose.yml), [docker-compose.prod.yml](../../docker-compose.prod.yml) | Đóng gói và triển khai |
| [.github/workflows/ci.yml](../../.github/workflows/ci.yml) | CI |
| [DEPLOYMENT.md](../../DEPLOYMENT.md) | Hướng dẫn triển khai lên VPS |

## Điểm vào của ứng dụng

| File | Vai trò |
|---|---|
| [src/main.ts](../../src/main.ts) | Khởi tạo ứng dụng, Swagger, logger, shutdown hook |
| [src/app.setup.ts](../../src/app.setup.ts) | `configureApp`: pipeline HTTP dùng chung cho production và e2e (helmet, CORS, guard, pipe, interceptor, versioning) |
| [src/app.module.ts](../../src/app.module.ts) | Module gốc: cấu hình, logging, rate limit, MongoDB và import toàn bộ module nghiệp vụ |
| [src/instrument.ts](../../src/instrument.ts) | Khởi tạo Sentry, phải được import đầu tiên |

## Bản đồ `src/`

| Thư mục | Nhóm | Vai trò |
|---|---|---|
| `auth/` | Danh tính | Đăng ký, đăng nhập, Google, refresh token, OTP, quên mật khẩu, xóa tài khoản |
| `users/` | Danh tính | Quản lý người dùng, tin đã lưu, công ty theo dõi |
| `sessions/` | Danh tính | Phiên đăng nhập theo thiết bị |
| `profile-identity/` | Danh tính | Đồng bộ tên, email, ảnh đại diện giữa `User` và `CvProfile` |
| `casl/` | Phân quyền | `ERole`, `RolesGuard`, decorator `@Roles`, `@CheckPolicies` |
| `companies/` | Tuyển dụng | Công ty, snapshot công ty nhúng trong tin |
| `jobs/` | Tuyển dụng | Tin tuyển dụng nội bộ và vòng đời duyệt tin |
| `resumes/` | Tuyển dụng | Hồ sơ ứng tuyển |
| `cv-profiles/` | Tuyển dụng | CV trực tuyến có cấu trúc |
| `skills/` | Tuyển dụng | Danh mục kỹ năng |
| `subscribers/` | Tuyển dụng | Đăng ký nhận gợi ý việc làm qua email |
| `job-ingestion/` | Tin ngoài | Nguồn tin, đồng bộ, vòng đời tin bên ngoài |
| `job-search/` | Tin ngoài | Tìm kiếm hợp nhất tin nội bộ và tin ngoài |
| `cv-parser/` | AI | Đọc nội dung CV từ file |
| `matching/` | AI | Chấm điểm phù hợp giữa CV và tin |
| `ai/`, `gemini/`, `groq/` | AI | Lớp chọn nhà cung cấp AI và hai client |
| `chat/` | AI | Trợ lý AI: phiên, tin nhắn, ngữ cảnh, quota, công cụ |
| `queues/` | Bất đồng bộ | Bảy hàng đợi BullMQ và processor |
| `notifications/` | Hạ tầng | Thông báo, WebSocket gateway |
| `mail/` | Hạ tầng | Gửi email, cron gợi ý việc làm hằng tuần |
| `files/` | Hạ tầng | Tải file lên |
| `statistics/` | Hạ tầng | Số liệu thống kê |
| `redis/` | Hạ tầng | Kết nối Redis, BullMQ, cache |
| `health/` | Hạ tầng | Kiểm tra sức khỏe |
| `databases/` | Hạ tầng | Seed dữ liệu mẫu và controller `databases` |
| `config/` | Hạ tầng | Kiểm tra biến môi trường khi khởi động |
| `utils/` | Dùng chung | Decorator, interceptor, helper, danh mục địa điểm |
| `scripts/` | Công cụ | Script benchmark hiệu năng |

Chi tiết từng module sẽ nằm trong `03-modules` (Phase 2 và 3). Quan hệ phụ thuộc giữa module: [module-dependencies.md](../02-architecture/module-dependencies.md).

## Cấu trúc một module điển hình

```text
src/<feature>/
├── <feature>.module.ts       # kết nối: MongooseModule.forFeature, imports, exports
├── <feature>.controller.ts   # mỏng: route, decorator auth, DTO, gọi service
├── <feature>.service.ts      # nghiệp vụ
├── dto/                      # DTO kiểm tra đầu vào bằng class-validator
├── schemas/                  # Mongoose schema
├── enums/, interfaces/       # kiểu dữ liệu
└── *.spec.ts                 # unit test đặt cạnh file nguồn
```

Không phải module nào cũng có đủ các phần này. Ví dụ `cv-parser/` chỉ có module và service.

## Known Limitation: thư mục còn sót

| Đường dẫn | Tình trạng |
|---|---|
| `src/roles/` | Chỉ có hai thư mục con rỗng `dto/` và `schemas/`, không có file, không có module và không có chỗ nào import. Có vẻ là phần còn lại của một module cũ. Vai trò thực tế nằm ở `casl/` |
| `src/databases/migrations/` | Thư mục rỗng. Xem [local-development.md](local-development.md#known-limitation-script-dev-bị-thiếu) |
| `scripts/` (gốc repo) | Không tồn tại dù `package.json` tham chiếu |

Đây là nhận xét từ việc đọc cây thư mục, chưa kiểm tra lịch sử git để biết lý do.
