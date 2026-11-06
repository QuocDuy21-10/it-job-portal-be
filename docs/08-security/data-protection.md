# Bảo mật: bảo vệ dữ liệu cá nhân

Phân loại dữ liệu, nơi dữ liệu đi qua, và những gì **không được** ghi vào log hay ví dụ. Tài liệu không đánh giá tuân thủ pháp luật; nó mô tả hành vi quan sát được để người chịu trách nhiệm đối chiếu.

## Phân loại dữ liệu theo collection

| Collection | Dữ liệu cá nhân | Mức nhạy cảm |
|---|---|---|
| [users](../04-database/collections/users.md) | Tên, email, ảnh, `googleId`, mật khẩu băm | Cao |
| [cv-profiles](../04-database/collections/cv-profiles.md) | Họ tên, điện thoại, email, ngày sinh, giới tính, địa chỉ, học vấn, kinh nghiệm | **Rất cao** |
| [resumes](../04-database/collections/resumes.md) | Bản sao CV (`cvStructuredData`, `parsedData`), email, đường dẫn file CV | **Rất cao** |
| [sessions](../04-database/collections/sessions.md) | Địa chỉ IP, user agent | Trung bình |
| [chat-messages](../04-database/collections/chat-messages.md) | Nội dung người dùng gõ | Cao |
| [subscribers](../04-database/collections/subscribers.md), [notifications](../04-database/collections/notifications.md) | Email, tên, nội dung thông báo | Trung bình |
| [ai-usage-logs](../04-database/collections/ai-usage-logs.md) | `userId` và số liệu, không nội dung | Thấp |

## Không được ghi vào log, ví dụ công khai hay Sentry

Họ tên, email, điện thoại, địa chỉ, nội dung CV, nội dung chat, mật khẩu, token, OTP, `refresh_token`, khóa API, chuỗi kết nối. Ví dụ trong tài liệu dùng `@example.com` và mã giả.

## Dữ liệu rời hệ thống

| Tới | Dữ liệu | Ghi chú |
|---|---|---|
| Google Gemini | Văn bản CV đã làm sạch (đọc CV); khi chat dự phòng: tin nhắn và ngữ cảnh | Bên thứ ba; chính sách của họ ngoài repository |
| Groq | Tin nhắn người dùng, hồ sơ (gồm **email**, kỹ năng, số năm kinh nghiệm), tin phù hợp, 10 tin lịch sử; văn bản trả lời để phân loại chủ đề | [ai-providers](../07-integrations/ai-providers.md#dữ-liệu-gửi-đi) |
| SMTP | Email người nhận, nội dung email | |
| Sentry | Lỗi và ngữ cảnh request; cấu hình PII chưa kiểm tra | [sentry](../07-integrations/sentry.md) |
| Nguồn tin ngoài | Không gửi dữ liệu người dùng | Chỉ tải tin tuyển dụng |

## Nơi dữ liệu cá nhân xuất hiện trong log (Known Limitation)

| Nơi | Nội dung | Nguồn |
|---|---|---|
| Đọc CV | `this.logger.log('cleanedText:', cleanedText)` có thể ghi **toàn bộ văn bản CV** | [resume-queue.processor.ts](../../src/queues/processors/resume-queue.processor.ts) |
| Xóa tài khoản | Email gốc của người dùng ở hai dòng log | [account-deletion-queue.processor.ts](../../src/queues/processors/account-deletion-queue.processor.ts) |
| Nhiều processor | Ghi `job.data` có thể chứa mã tham chiếu | Các processor khác |
| Log HTTP | Header `authorization`, `cookie`, `set-cookie` được che; **body** request không được log | [app.module.ts](../../src/app.module.ts) |

Đã đọc mã; chưa kiểm tra đầu ra log thật. Log được ghi ra `stdout` của container và `docker` giữ 5 file 10 MB cho mỗi container ([docker-compose.prod.yml](../../docker-compose.prod.yml)).

## File tải lên

- Tên file do server đặt bằng `randomUUID()` và đuôi lấy từ bảng MIME ([multer.config.ts](../../src/files/multer.config.ts)), nên không lộ tên gốc và khó đoán.
- Kiểm tra: thư mục `folder_type`, MIME, đuôi file, tối đa 5 MB ([upload-policy.ts](../../src/files/constants/upload-policy.ts)).
- **Phục vụ tĩnh không xác thực:** `useStaticAssets(public)` trả file ở `/images/<thư mục>/<tên>` cho bất kỳ ai có URL, không qua `JwtAuthGuard`. Đây là mô hình "URL là khóa"; CV và ảnh có thể truy cập nếu URL bị lộ (qua API trả `url`, log, hay trình duyệt).
- Không thấy quét virus hay kiểm tra nội dung thật (magic bytes) ngoài MIME và đuôi file.
- File nằm trên đĩa, sao lưu riêng ([backup-and-recovery](../11-operations/backup-and-recovery.md)).

## Lưu giữ và xóa

| Dữ liệu | Thời hạn giữ |
|---|---|
| Tài khoản chưa xác thực | 15 phút (TTL) |
| Phiên | Đến `expiresAt` (TTL có thể không tồn tại, xem [sessions](../04-database/collections/sessions.md#known-limitation-index-trùng-key-pattern)) |
| `crawl_runs` | 90 ngày (TTL) |
| `chat_*`, `ai_usage_logs`, `notifications`, `resumes` | Vô thời hạn (không TTL) |
| Sau yêu cầu xóa tài khoản | Xóa 30 ngày sau; xóa không triệt để |

**Xóa không triệt để:** sau khi xóa tài khoản, `resumes` còn `parsedData`, `cvStructuredData`, đường dẫn file; file CV và ảnh còn trên đĩa; `notifications`, `chat_tool_actions`, `ai_usage_logs` không bị xóa ([account-deletion](../06-workflows/use-cases/account-deletion.md#dữ-liệu-sau-khi-xóa)).

## Sao lưu

Bản sao lưu MongoDB và thư mục tải lên chứa toàn bộ dữ liệu trên, kể cả của tài khoản đã xóa vào thời điểm sao lưu. Repository không mô tả mã hóa sao lưu hay thời hạn giữ; đặt thuộc nhóm `Future Improvement`.

## Future Improvement

Đề xuất, chưa có trong code: bỏ log `cleanedText`; che email trong log; phục vụ file CV qua route có xác thực hoặc URL ký có hạn; hoàn thiện ẩn danh và xóa file khi xóa tài khoản; đặt TTL cho `chat_*` và `ai_usage_logs`; bỏ email khỏi prompt gửi nhà cung cấp AI.
