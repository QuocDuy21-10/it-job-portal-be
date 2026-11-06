# Thuật ngữ

| Thuật ngữ | Giải thích |
|---|---|
| ADR | Architecture Decision Record: bản ghi một quyết định kiến trúc ([12-decisions](../12-decisions/README.md)) |
| Access token | JWT ngắn hạn gửi trong header `Authorization: Bearer` |
| Adapter | Lớp lấy dữ liệu từ một nhà cung cấp tin tuyển dụng cụ thể ([job-ingestion](../03-modules/job-ingestion.md)) |
| `aqp` | Thư viện `api-query-params`, đọc bộ lọc và sắp xếp từ query string |
| ATS | Applicant Tracking System: hệ thống quản lý tuyển dụng của công ty (Greenhouse, Lever) |
| Backoff mũ | Thời gian chờ giữa các lần thử lại tăng theo cấp số nhân |
| BullMQ | Thư viện hàng đợi dùng Redis ([queues](../03-modules/queues.md)) |
| `CACHE_MANAGER` | Provider cache của NestJS; trong dự án chạy trong bộ nhớ, không phải Redis |
| CASL | Thư viện khai báo quyền; có trong code nhưng không được thực thi trên route |
| C4 | Mô hình sơ đồ kiến trúc nhiều mức (context, container, component) |
| Collection | Tập hợp document trong MongoDB, tương tự bảng trong cơ sở dữ liệu quan hệ |
| Cron | Công việc chạy theo lịch (`@Cron`) |
| CV profile | CV trực tuyến có cấu trúc, một bản cho mỗi người dùng |
| Document | Một bản ghi dạng JSON trong MongoDB |
| DTO | Data Transfer Object: lớp mô tả và kiểm tra dữ liệu vào/ra của API |
| Embedded | Dữ liệu sao chép nằm bên trong document khác, không phải tham chiếu |
| Envelope | Cấu trúc bọc phản hồi `{ statusCode, message, data }` |
| `ERole` | Enum vai trò: `SUPER ADMIN`, `HR`, `NORMAL USER` |
| Fail-open | Khi thành phần kiểm tra lỗi thì cho qua thay vì chặn |
| Guardrail | Lớp lọc đầu vào và đầu ra của chat AI |
| Hybrid matching | AI trích xuất dữ liệu CV, điểm số tính bằng code tất định |
| Idempotent | Xử lý nhiều lần cho cùng kết quả như một lần |
| Ingestion | Đồng bộ tin tuyển dụng từ nguồn ngoài |
| Intent | Ý định của câu hỏi chat (`job_advisor`, `cv_review`, ...) |
| JSON-LD | Dữ liệu có cấu trúc nhúng trong trang web, ví dụ `JobPosting` của schema.org |
| `LINK_ONLY` | Chính sách hiển thị: chỉ giữ liên kết, không lưu hay trả mô tả |
| Mixed | Kiểu Mongoose không kiểm tra cấu trúc |
| Module (NestJS) | Đơn vị đóng gói provider, controller; xem [module-dependencies](../02-architecture/module-dependencies.md) |
| OTP | One-Time Password: mã 6 chữ số xác thực email |
| Processor | Worker lấy việc từ hàng đợi và xử lý |
| Quota | Hạn mức; chat theo ngày, Gemini theo phút và ngày |
| Refresh token | JWT dài hạn trong cookie `httpOnly`, dùng để lấy access token mới |
| Reference | Lưu `_id` của document khác; MongoDB không ép ràng buộc |
| Resume | Hồ sơ ứng tuyển của một ứng viên cho một tin |
| SSE | Server-Sent Events: luồng văn bản `text/event-stream` |
| `STALE` | Trạng thái tin ngoài vắng khỏi danh sách đầy đủ, đang trong thời gian ân hạn |
| Snapshot | Bản sao dữ liệu tại một thời điểm, như `CompanySnapshot` |
| Soft delete | Đánh dấu đã xóa (`isDeleted`) thay vì xóa khỏi database |
| `SUSPECT` | Lần đồng bộ có danh sách nguồn co bất thường, không đóng tin vì vắng mặt |
| Throttler | Bộ giới hạn tốc độ request của NestJS |
| TTL index | Index MongoDB tự xóa document khi quá hạn |
| Tool action | Hành động do AI đề xuất, chờ người dùng xác nhận |
| `$unionWith` | Stage aggregation MongoDB ghép kết quả từ collection khác |
