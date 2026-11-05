# Khả năng mở rộng

Tài liệu này chỉ ra những điểm trong code hiện tại ảnh hưởng đến việc chạy nhiều instance hoặc tăng tải. Mỗi điểm có bằng chứng từ source. Đây không phải đánh giá hiệu năng: **chưa có số liệu tải thực tế** trong repository để khẳng định giới hạn.

## Kiến trúc triển khai hiện tại

Một container `backend` duy nhất làm cả API, worker và cron ([container-diagram.md](container-diagram.md)). `docker-compose.prod.yml` định nghĩa đúng một service `backend`, không có cấu hình nhân bản.

## Điểm cần lưu ý khi chạy nhiều instance

| Thành phần | Hành vi hiện tại | Hệ quả khi có nhiều instance | Mức chắc chắn |
|---|---|---|---|
| Cron | `@Cron` chạy trên mọi instance, không có khóa phân tán trong 4 hàm cron | Mỗi lịch chạy N lần với N instance | Đã xác minh bằng grep: không thấy cơ chế khóa trong các file có cron |
| Cron đồng bộ nguồn tin | Mỗi lần chạy enqueue với `jobId = sync-<sourceKey>` | BullMQ bỏ qua `add()` nếu `jobId` đã tồn tại, nên bản trùng bị loại | Đã đọc [job-ingestion-queue.service.ts](../../src/queues/services/job-ingestion-queue.service.ts) |
| Cron tắt tin hết hạn, dọn logo | Thao tác trực tiếp trên dữ liệu | Chạy lặp. Với `updateMany` đặt `isActive = false` thì lặp là vô hại về kết quả. Chưa đánh giá cho việc dọn logo | Suy luận từ code |
| Cron gợi ý việc làm | Đưa vào hàng `job-recommendation` từ `mail.controller.ts` | Có thể gửi trùng nếu không có `jobId` cố định | `Chưa xác minh` |
| Socket.IO | `NotificationsGateway` giữ `userSockets` trong `Map` của tiến trình, không có adapter Redis | Thông báo chỉ tới được socket kết nối với đúng instance phát | Đã xác minh: không có `IoAdapter` hay `redis-adapter` trong `src/` và `package.json` |
| `CACHE_MANAGER` | Chạy trong bộ nhớ, xem [data-flow.md](data-flow.md#known-limitation-cache_manager-có-vẻ-đang-chạy-trong-bộ-nhớ) | Không chia sẻ giữa instance | Đọc mã, chưa chạy thực nghiệm |
| File tải lên | Ghi vào `public/` trên đĩa cục bộ (`diskStorage` trong [multer.config.ts](../../src/files/multer.config.ts)) | Instance khác không thấy file nếu không dùng volume dùng chung | Đã xác minh |
| Rate limit | Lưu trên Redis (`ThrottlerStorageRedisService`) | Dùng chung giữa instance | Đã xác minh |
| Hàng đợi | BullMQ trên Redis | Nhiều worker cùng lấy việc từ một hàng, không trùng việc | Đặc tính của BullMQ |

## Giới hạn tốc độ do nhà cung cấp AI

Hàng đợi `resume-processing` chạy `concurrency: 1` và `limiter` 15 job mỗi 60 giây ([resume-queue.processor.ts](../../src/queues/processors/resume-queue.processor.ts)). Trần này khớp với hạn mức RPM của Gemini theo comment trong code. Hệ quả: thông lượng đọc CV tối đa khoảng 15 hồ sơ mỗi phút trên mỗi hàng đợi, bất kể có thêm instance hay không, vì BullMQ áp dụng `limiter` ở cấp hàng đợi. Con số này là phép suy ra từ cấu hình, chưa đo.

## Ghi chú khác

- Lưu trữ phiên và quota dùng Redis, nên không ràng buộc vào một instance. Chi tiết sẽ được xác nhận ở `08-security` và `caching-strategy.md`.
- Kết nối MongoDB dùng cấu hình mặc định của Mongoose, không đặt `maxPoolSize` trong [app.module.ts](../../src/app.module.ts).

## Future Improvement

Các hướng dưới đây là đề xuất, chưa có trong code và chưa được tác giả xác nhận:

- Tách worker BullMQ thành tiến trình riêng để scale độc lập với API.
- Khóa phân tán hoặc bộ lập lịch riêng cho cron khi chạy nhiều instance.
- Adapter Redis cho Socket.IO.
- Lưu file tải lên vào object storage thay vì đĩa cục bộ.
- Chuyển `CACHE_MANAGER` sang Redis thật bằng cấu hình `stores` phù hợp phiên bản thư viện.
