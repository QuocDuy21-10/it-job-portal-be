# Tổng quan cơ sở dữ liệu

DevLink dùng **MongoDB 7** qua **Mongoose 7**. MongoDB là cơ sở dữ liệu tài liệu: dữ liệu nằm trong *collection* (tập hợp) gồm các *document* (bản ghi dạng JSON), không có bảng, khóa ngoại hay JOIN bắt buộc như cơ sở dữ liệu quan hệ.

## Danh sách collection

17 collection, mỗi collection có một data dictionary riêng. Tên collection lấy từ model Mongoose thực tế: 8 collection khai báo `collection:` tường minh, phần còn lại do Mongoose tự đặt (chữ thường, số nhiều).

| Nhóm | Collection | Nội dung |
|---|---|---|
| Tài khoản | [users](collections/users.md) | Người dùng ba vai trò |
| | [sessions](collections/sessions.md) | Phiên đăng nhập theo thiết bị |
| | [notifications](collections/notifications.md) | Thông báo trong ứng dụng |
| | [subscribers](collections/subscribers.md) | Đăng ký nhận gợi ý việc làm |
| Tuyển dụng | [companies](collections/companies.md) | Công ty, kèm tài liệu nhúng `CompanySnapshot` |
| | [jobs](collections/jobs.md) | Tin tuyển dụng nội bộ |
| | [resumes](collections/resumes.md) | Hồ sơ ứng tuyển và điểm phù hợp |
| | [cv-profiles](collections/cv-profiles.md) | CV trực tuyến (tên thật `cvprofiles`) |
| | [skills](collections/skills.md) | Danh mục kỹ năng |
| Tin ngoài | [job-sources](collections/job-sources.md) | Cấu hình nguồn tin |
| | [external-jobs](collections/external-jobs.md) | Tin lấy từ nguồn ngoài |
| | [crawl-runs](collections/crawl-runs.md) | Nhật ký đồng bộ |
| Chat AI | [chat-sessions](collections/chat-sessions.md) | Phiên chat |
| | [chat-messages](collections/chat-messages.md) | Tin nhắn |
| | [chat-tool-actions](collections/chat-tool-actions.md) | Hành động chờ xác nhận |
| | [chat-quota-policies](collections/chat-quota-policies.md) | Chính sách giới hạn lượt chat |
| | [ai-usage-logs](collections/ai-usage-logs.md) | Nhật ký dùng AI |

Quan hệ giữa các collection: [collection-relationships.md](collection-relationships.md).

## Quy ước chung

| Quy ước | Chi tiết |
|---|---|
| Kết nối | `MongooseModule.forRootAsync` trong [app.module.ts](../../src/app.module.ts), chuỗi kết nối `MONGO_URL` |
| `timestamps` | Hầu hết schema bật `timestamps: true`, Mongoose tự quản `createdAt`, `updatedAt`. Ngoại lệ: `crawl_runs` |
| Audit | Nhiều collection có `createdBy`, `updatedBy`, `deletedBy` dạng `{ _id, email }`, khai báo `type: Object` nên Mongoose coi là Mixed (không kiểm tra cấu trúc) |
| Snapshot | `CompanySnapshot` nhúng vào `users.company` và `jobs.company` để tránh truy vấn nối |
| Kỹ năng | Lưu **tên** dạng chuỗi (`jobs.skills`, `subscribers.skills`, ...), không lưu tham chiếu tới [skills](collections/skills.md) |
| Địa điểm | `location` kèm `locationCode` chuẩn hóa chữ thường, danh mục ở [location-catalog.ts](../../src/utils/location-catalog.ts) |

## Xóa mềm

*Xóa mềm* (soft delete) nghĩa là đánh dấu bản ghi đã xóa thay vì xóa khỏi database, để giữ lịch sử và có thể khôi phục.

Plugin [soft-delete-plugin-mongoose](https://www.npmjs.com/package/soft-delete-plugin-mongoose) 1.0.17 được gắn cho **mọi kết nối** trong `connectionFactory` của `AppModule`. Đọc mã nguồn plugin cho thấy:

| Hành vi | Chi tiết |
|---|---|
| Field thêm vào **mọi** schema | `isDeleted` (Boolean, `required`, mặc định `false`) và `deletedAt` (Date, mặc định `null`), kể cả schema không tự khai báo |
| Tự lọc | Chỉ `find`, `count`, `countDocuments`: thêm `isDeleted: { $ne: true }` nếu truy vấn không tự đặt `isDeleted: true` |
| Hàm thêm | `softDelete`, `restore`, `findDeleted` |

### Known Limitation: xóa mềm không tự áp dụng cho mọi loại truy vấn

Plugin **không** móc vào `findOne`, `findOneAndUpdate`, `updateOne`, `updateMany`, `aggregate`. Truy vấn thuộc các loại này phải tự thêm điều kiện `isDeleted`. Biểu hiện trong code: nhiều index và truy vấn có `isDeleted` tường minh (ví dụ `jobs` dùng `isDeleted: { $ne: true }` trong pipeline thống kê). Truy vấn mới viết mà quên điều kiện sẽ trả cả bản ghi đã xóa.

### Collection không dùng xóa mềm trên thực tế

| Collection | Cách xóa |
|---|---|
| [sessions](collections/sessions.md) | Xóa thật (`deleteOne`, `deleteMany`) |
| [cv-profiles](collections/cv-profiles.md) | Xóa thật (`deleteOne`) |
| [crawl-runs](collections/crawl-runs.md) | TTL 90 ngày |

## Kiểu ObjectId thực tế

Schema dùng hai cách khai báo khác nhau cho tham chiếu, và chúng cho kết quả khác nhau:

| Khai báo | Kiểu Mongoose thực tế | Dùng ở |
|---|---|---|
| `type: mongoose.Schema.Types.ObjectId` | `ObjectId` (ép kiểu và validate) | `sessions.userId`, `notifications.userId`, `resumes.*`, `users.savedJobs`, ... |
| `type: Types.ObjectId` (import từ `mongoose`) | **`Mixed`** | `cv-profiles.userId`, `chat_sessions.userId`, `chat_messages.{sessionId,userId}`, `chat_tool_actions.{userId,sessionId}`, `ai_usage_logs.{userId,sessionId,conversationId}` |

Đã kiểm tra bằng cách nạp schema thật: với `Types.ObjectId` qua `@nestjs/mongoose`, `schema.path('userId').instance` là `Mixed`, và `Model.find({ userId: '<chuỗi>' }).cast()` giữ nguyên **chuỗi** thay vì chuyển sang ObjectId. (Mongoose thuần với `Types.ObjectId` vẫn cho ObjectId, nên lỗi nằm ở cách `@nestjs/mongoose` xử lý khai báo này.)

**Hệ quả:** truy vấn bằng chuỗi sẽ không khớp dữ liệu lưu dạng ObjectId. Code hiện tại tránh được vì luôn bọc `new Types.ObjectId(...)` khi ghi và khi truy vấn (ví dụ [cv-profiles.service.ts](../../src/cv-profiles/cv-profiles.service.ts), [ai-usage.service.ts](../../src/chat/ai-usage.service.ts)). Rủi ro nằm ở truy vấn mới viết sau này. Tác động lên `populate` chưa được kiểm tra: `Chưa xác minh`.

## Index

### TTL index

| Collection | Key | Thời gian | Ghi chú |
|---|---|---|---|
| `users` | `verificationExpires` | 0 giây sau thời điểm đó, chỉ với `isActive: false` | Xóa tài khoản chưa xác thực (hạn 15 phút) |
| `sessions` | `expiresAt` | 0 giây sau thời điểm đó | Có thể không được tạo, xem bên dưới |
| `crawl_runs` | `startedAt` | 90 ngày | |

Không collection nào khác có TTL: `chat_*`, `ai_usage_logs`, `notifications`, `resumes` được giữ vô thời hạn.

### Known Limitation: khai báo index trùng key pattern

Ba collection khai báo cùng một key pattern hai lần với option khác nhau, vì kết hợp `index: true` hoặc `unique: true` trên field với lời gọi `Schema.index(...)`:

| Collection | Key | Chi tiết |
|---|---|---|
| `sessions` | `expiresAt`, `refreshTokenHash` | Xem [sessions](collections/sessions.md#known-limitation-index-trùng-key-pattern) |
| `cvprofiles` | `userId` | Xem [cv-profiles](collections/cv-profiles.md#known-limitation-index-userid-bị-khai-báo-hai-lần) |
| `chat_sessions` | `legacyConversationId` | Xem [chat-sessions](collections/chat-sessions.md) |

MongoDB không cho hai index cùng key pattern với option khác nhau cùng tồn tại. Trạng thái: `Chưa xác minh`, cần `db.<collection>.getIndexes()` trên database thật.

## Tham chiếu tới model không tồn tại

`chat_sessions.legacyConversationId` và `ai_usage_logs.conversationId` khai báo `ref: 'Conversation'`, nhưng không có schema `Conversation` trong source. Đây là dấu vết của cấu trúc chat cũ.

## Migration

- Repository **không có framework migration**. Thư mục `src/databases/migrations/` rỗng, và script `npm run migrate:locations` trỏ tới file không tồn tại, xem [local-development.md](../00-getting-started/local-development.md#known-limitation-script-dev-bị-thiếu).
- Dữ liệu mẫu nạp bằng `npm run seed` ([src/databases/seeds/](../../src/databases/seeds/)).
- Khi thêm field mới: Mongoose trả `undefined` cho bản ghi cũ, nên cần xử lý giá trị thiếu trong code hoặc viết script nạp bù.
- Khi thêm index `unique` lên collection đã có dữ liệu trùng: việc tạo index sẽ thất bại.
- Mongoose mặc định tự tạo index khi khởi động (`autoIndex`). Repository không tắt tùy chọn này trong [app.module.ts](../../src/app.module.ts), nên thay đổi index trong schema được áp dụng khi triển khai. Điều này cần cân nhắc với collection lớn ở production. Trạng thái: suy ra từ cấu hình, `Chưa xác minh` trên môi trường thật.

## Ví dụ và dữ liệu cá nhân

Mọi ví dụ document trong thư mục này dùng dữ liệu giả (`@example.com`, mã ObjectId minh họa). Các collection chứa dữ liệu cá nhân: `users`, `sessions` (IP, user agent), `resumes`, `cv-profiles`, `chat_messages`, `subscribers`, `notifications`. Quy tắc bảo vệ dữ liệu sẽ nằm ở `08-security` (Phase 4).
