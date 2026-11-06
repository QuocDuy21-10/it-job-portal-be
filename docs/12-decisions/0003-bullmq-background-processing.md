# ADR-0003: BullMQ cho xử lý nền, điều tiết theo hạn mức nhà cung cấp

- **Trạng thái:** Accepted
- **Bằng chứng:** [resume-queue.processor.ts](../../src/queues/processors/resume-queue.processor.ts) (`limiter` 15 mỗi 60 giây, comment "Mirror the current Gemini ... RPM ceiling"); [redis.module.ts](../../src/redis/redis.module.ts) (tùy chọn mặc định); bảy hàng đợi trong [queues.constants.ts](../../src/queues/queues.constants.ts).

## Bối cảnh

Đọc CV bằng AI chậm và chịu giới hạn tốc độ; đồng bộ nguồn ngoài mất vài chục giây đến vài phút; email phụ thuộc SMTP; xóa tài khoản cần hẹn giờ 30 ngày.

## Quyết định

Dùng BullMQ trên Redis cho việc nền, mặc định 3 lần thử với backoff mũ. Hàng đợi đọc CV được giới hạn tốc độ khớp trần RPM của Gemini; khi hết quota thì lên lịch lại thay vì báo lỗi.

## Hệ quả

Phản hồi tức thì cho người dùng, điều tiết gọi AI, retry tự động. Đánh đổi: hầu hết hàng đợi thiếu `jobId` chống trùng, một số giữ việc lỗi vô thời hạn, worker chung tiến trình ([queues](../03-modules/queues.md)).

## Mức tin cậy của lý do

Cấu hình và comment trong code là bằng chứng cho việc điều tiết theo trần của nhà cung cấp. Ý định thiết kế tổng thể không được ghi riêng.
