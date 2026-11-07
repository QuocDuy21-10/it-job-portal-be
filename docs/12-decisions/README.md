# Quyết định kiến trúc (ADR)

Mỗi ADR (Architecture Decision Record) ghi một quyết định kiến trúc đang có trong repository, **kèm bằng chứng** (commit, comment, code). Quy ước:

- `Accepted`: quyết định có bằng chứng trực tiếp trong code hoặc lịch sử git.
- `Proposed`: dùng cho phần **lý do** hoặc quyết định chỉ suy luận được; cần tác giả xác nhận.
- Không có ADR nào mô tả điều chưa triển khai.

| ADR | Quyết định | Trạng thái |
|---|---|---|
| [0001](0001-modular-monolith.md) | Một ứng dụng NestJS module hóa, worker chạy cùng tiến trình | Accepted |
| [0002](0002-roles-as-enum.md) | Vai trò là enum `ERole`, không phải entity Role | Accepted |
| [0003](0003-bullmq-background-processing.md) | BullMQ cho xử lý nền, điều tiết theo hạn mức nhà cung cấp | Accepted |
| [0004](0004-hybrid-matching.md) | AI chỉ trích xuất, điểm phù hợp tính bằng code tất định | Accepted |
| [0005](0005-external-job-lifecycle.md) | Vòng đời tin ngoài ACTIVE, STALE, CLOSED kèm chống đóng nhầm | Accepted |
| [0006](0006-source-display-policy.md) | Chính sách hiển thị theo nguồn, mặc định hạn chế nhất | Accepted |
| [0007](0007-reservation-based-chat-quota.md) | Hạn mức chat bằng đặt chỗ nguyên tử trong Redis | Accepted |
| [0008](0008-redis-tagged-list-cache.md) | Cache danh sách trong Redis có thẻ và vô hiệu hóa theo thẻ | Accepted |
| [0009](0009-confirmed-tool-actions.md) | Hành động do AI đề xuất phải được người dùng xác nhận | Accepted |

## Quyết định chưa có ADR vì thiếu bằng chứng về lý do

Các lựa chọn sau có trong code nhưng repository không ghi lý do; ghi ở [technology-decisions](../02-architecture/technology-decisions.md) dưới dạng suy luận: MongoDB với Mongoose và xóa mềm bằng plugin, NestJS trên Express, Groq làm nhà cung cấp chính và Gemini dự phòng, JWT với refresh token trong cookie. Khi tác giả xác nhận lý do, thêm ADR với trạng thái `Accepted`.

## Cách thêm ADR

Đặt tên `NNNN-<chủ-đề>.md`, thêm vào bảng trên, ghi bằng chứng cụ thể (commit, đường dẫn). Không ghi `Accepted` cho quyết định chỉ suy luận.
