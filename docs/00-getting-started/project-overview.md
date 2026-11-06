# Tổng quan dự án

DevLink là nền tảng tuyển dụng ngành IT tại Việt Nam. Repository này là **backend**: một ứng dụng NestJS cung cấp REST API, xử lý nền và kết nối với dịch vụ AI. Giao diện web nằm ở repository riêng và không thuộc phạm vi tài liệu này.

## Bài toán

Người tìm việc IT thường phải xem tin tuyển dụng rải rác trên nhiều trang, viết lại CV nhiều lần và khó biết mình phù hợp vị trí nào. Nhà tuyển dụng phải lọc nhiều hồ sơ thủ công. DevLink gom các việc này vào một hệ thống:

- Ứng viên tìm việc trong cả tin nội bộ lẫn tin lấy từ nguồn bên ngoài, lưu tin, theo dõi công ty, tạo CV trực tuyến và nộp hồ sơ.
- Nhà tuyển dụng (HR) đăng tin, nhận hồ sơ kèm điểm phù hợp tính tự động.
- Quản trị viên duyệt tin, quản lý người dùng và các nguồn tin bên ngoài.
- Trợ lý AI trả lời câu hỏi nghề nghiệp dựa trên dữ liệu trong hệ thống.

## Các nhóm người dùng

Vai trò được định nghĩa bởi enum `ERole` trong [role.enum.ts](../../src/casl/enums/role.enum.ts):

| Vai trò | Giá trị | Mô tả ngắn |
|---|---|---|
| Ứng viên | `NORMAL USER` | Tìm việc, lưu tin, ứng tuyển, chat với trợ lý AI |
| Nhà tuyển dụng | `HR` | Quản lý công ty và tin tuyển dụng của mình, xử lý hồ sơ |
| Quản trị viên | `SUPER ADMIN` | Quản trị toàn hệ thống |

Chi tiết quyền của từng vai trò sẽ được mô tả trong `01-product` sau khi đối chiếu với guard và CASL.

## Năng lực chính

| Nhóm | Mô tả | Nơi bắt đầu đọc trong source |
|---|---|---|
| Tài khoản và phiên | Đăng ký có OTP, đăng nhập, Google, refresh token, quên mật khẩu, xóa tài khoản | [src/auth/](../../src/auth/), [src/sessions/](../../src/sessions/) |
| Công ty và tin tuyển dụng | Quản lý công ty, đăng tin, duyệt tin | [src/companies/](../../src/companies/), [src/jobs/](../../src/jobs/) |
| Hồ sơ ứng tuyển và CV | Nộp hồ sơ, CV trực tuyến, đọc CV tự động | [src/resumes/](../../src/resumes/), [src/cv-profiles/](../../src/cv-profiles/), [src/cv-parser/](../../src/cv-parser/) |
| Chấm điểm phù hợp | Tính độ phù hợp giữa CV và tin tuyển dụng | [src/matching/](../../src/matching/) |
| Tin từ nguồn ngoài | Đồng bộ định kỳ và tìm kiếm hợp nhất | [src/job-ingestion/](../../src/job-ingestion/), [src/job-search/](../../src/job-search/) |
| Trợ lý AI | Chat có ngữ cảnh, giới hạn lượt dùng, trả lời dạng stream | [src/chat/](../../src/chat/), [src/ai/](../../src/ai/) |
| Thông báo và email | Thông báo thời gian thực, email, gợi ý việc làm định kỳ | [src/notifications/](../../src/notifications/), [src/mail/](../../src/mail/) |
| Thống kê | Số liệu theo vai trò | [src/statistics/](../../src/statistics/) |

## Đặc điểm kỹ thuật

- **Một ứng dụng NestJS duy nhất** (monolith theo module), không phải microservice. Xử lý nền chạy trong cùng tiến trình bằng BullMQ.
- **Dữ liệu** lưu trong MongoDB, **Redis** dùng cho hàng đợi, rate limit và một số cache.
- **AI** dùng Google Gemini và Groq, nhưng quy tắc nghiệp vụ và điểm số do backend quyết định. Xem [AGENTS.md](../../AGENTS.md).
- Mọi API có tiền tố `/api/v1` và trả về cấu trúc `{ statusCode, message, data }`.

Kiến trúc chi tiết: [architecture-overview.md](../02-architecture/architecture-overview.md).

## Đọc tiếp

- Muốn chạy thử: [quick-start.md](quick-start.md)
- Muốn phát triển: [local-development.md](local-development.md) và [project-structure.md](project-structure.md)
