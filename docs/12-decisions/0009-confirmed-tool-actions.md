# ADR-0009: Hành động do AI đề xuất phải được người dùng xác nhận

- **Trạng thái:** Accepted
- **Bằng chứng:** [chat-tool-action.service.ts](../../src/chat/chat-tool-action.service.ts); schema [chat-tool-actions](../04-database/collections/chat-tool-actions.md); commit `696a1dd` "only return job IDs accepted through recommend_jobs"; `validateRecommendedJobIds` trong [chat.service.ts](../../src/chat/chat.service.ts).

## Bối cảnh

Mô hình có thể đề xuất thay đổi dữ liệu người dùng (lưu tin) và có thể bịa mã tin.

## Quyết định

Mô hình chỉ **đề xuất** hành động (`pending`, hết hạn sau 15 phút); chỉ khi người dùng gọi xác nhận thì mới thực hiện. Mã tin gợi ý chỉ được giữ nếu nằm trong tập tin đã đưa vào ngữ cảnh.

## Hệ quả

Mô hình không tự thay đổi dữ liệu và không đưa tin không có thật. Đánh đổi: thêm một bước tương tác; hết hạn xử lý lười nên bản ghi quá hạn vẫn ở `pending`.

## Mức tin cậy của lý do

Cơ chế và hai commit/hàm kiểm tra là bằng chứng. Ý định bảo mật cụ thể suy ra từ thiết kế (`Proposed`).
