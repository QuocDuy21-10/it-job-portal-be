# ADR-0007: Hạn mức chat bằng đặt chỗ nguyên tử trong Redis

- **Trạng thái:** Accepted
- **Bằng chứng:** Commit `af88e53` (2026-05-15) "add reservation-based quota system with policy support"; [chat-quota.service.ts](../../src/chat/chat-quota.service.ts) (script Lua `INCR`/`DECR`).

## Bối cảnh

Chat AI tốn chi phí và có hạn mức nhà cung cấp; cần giới hạn lượt theo vai trò mà không tạo điều kiện chạy đua giữa các request.

## Quyết định

Đặt chỗ (`reserve`) một lượt bằng script Lua nguyên tử trước khi gọi AI, hoàn lại (`rollback`) nếu lỗi trước khi có token. Chính sách theo vai trò đọc từ MongoDB (`chat_quota_policies`) với giá trị dự phòng trong code. Cache FAQ không tiêu hạn mức.

## Hệ quả

Không vượt hạn mức khi nhiều request đồng thời; thay đổi hạn mức không cần triển khai lại. Đánh đổi: bộ đếm nằm ở Redis nên mất khi Redis mất dữ liệu ([chat-quota-policies](../04-database/collections/chat-quota-policies.md)).

## Mức tin cậy của lý do

Có bằng chứng qua commit và code.
