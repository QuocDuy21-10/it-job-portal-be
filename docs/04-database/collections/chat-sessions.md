# Chat Sessions (`chat_sessions`)

Một cuộc hội thoại giữa người dùng và trợ lý AI. Tin nhắn nằm ở [chat-messages](chat-messages.md), hành động cần xác nhận ở [chat-tool-actions](chat-tool-actions.md).

- **Nguồn schema:** [chat-session.schema.ts](../../../src/chat/schemas/chat-session.schema.ts)
- **Phân loại dữ liệu:** có dữ liệu cá nhân gián tiếp: `title` và `summary` được tạo từ nội dung hội thoại.
- **Soft-delete:** plugin thêm `isDeleted` và `deletedAt`. Cờ `isActive` là cơ chế "đóng" phiên chat riêng, khác với xóa mềm.

## Data dictionary

| Field | Type | Required | Default | Ràng buộc | Ý nghĩa |
|---|---|---|---|---|---|
| `userId` | Mixed | Có | — | ref: `User` | Chủ phiên chat |
| `userRole` | String | Có | `"UNKNOWN"` | — | Vai trò của chủ phiên lúc tạo, mặc định `UNKNOWN` |
| `type` | String | Không | `"general"` | enum: `general`, `recruiter_support`, `job_matching`, `cv_review`, `job_advisor` | Loại phiên chat |
| `title` | String | Không | — | — | Tiêu đề phiên, tạo từ nội dung hội thoại |
| `summary` | String | Không | — | — | Bản tóm tắt hội thoại dùng làm ngữ cảnh cho các lượt sau |
| `isActive` | Boolean | Không | `true` | — | Phiên còn mở. `false` khi đã đóng |
| `lastMessageAt` | Date | Không | `(fn)` | — | Thời điểm tin nhắn gần nhất, dùng để sắp xếp danh sách phiên |
| `legacyConversationId` | Mixed | Không | — | ref: `Conversation` | Mã hội thoại ở cấu trúc cũ. Model đích không còn tồn tại |
| `createdAt` | Date | Không | — | — | Thời điểm tạo |
| `updatedAt` | Date | Không | — | — | Thời điểm sửa gần nhất |
| `isDeleted` | Boolean | Có | `false` | thêm bởi plugin xóa mềm | Cờ xóa mềm. `true` nghĩa là bản ghi đã bị xóa khỏi nghiệp vụ nhưng vẫn còn trong database |
| `deletedAt` | Date | Không | `null` | thêm bởi plugin xóa mềm | Thời điểm xóa mềm |

## Indexes

| Keys | Thuộc tính | Mục đích |
|---|---|---|
| `{ userId: 1 }` | — | Tìm phiên theo chủ |
| `{ userRole: 1 }` | — | Lọc theo vai trò |
| `{ type: 1 }` | — | Lọc theo loại phiên |
| `{ isActive: 1 }` | — | Lọc phiên đang mở |
| `{ lastMessageAt: 1 }` | — | Sắp xếp theo hoạt động gần nhất |
| `{ legacyConversationId: 1 }` | — | Tra cứu phiên theo mã hội thoại cũ |
| `{ userId: 1, isActive: 1, lastMessageAt: -1 }` | — | Danh sách phiên đang mở của một người, hoạt động gần nhất trước |
| `{ legacyConversationId: 1 }` | sparse | Khai báo sparse, cùng key với `index: true` trên field |

## Quan hệ

| Field | Loại | Đích |
|---|---|---|
| `userId` | Reference, `ref: 'User'` | `users`. Kiểu Mongoose là **Mixed**, xem bên dưới |
| `legacyConversationId` | Reference, `ref: 'Conversation'` | Model `Conversation` **không tồn tại** trong 17 collection hiện tại |

**Known Limitation:** `userId` khai báo `type: Types.ObjectId` nên Mongoose coi là Mixed và không ép kiểu truy vấn, xem [database-overview](../database-overview.md#kiểu-objectid-thực-tế). Code chat luôn bọc `new Types.ObjectId(...)` khi ghi.

**Known Limitation:** `legacyConversationId` trỏ tới model `Conversation` không còn trong source, nên `populate` sẽ không hoạt động. Field này cùng index sparse tương ứng là dấu vết của lần chuyển từ cấu trúc hội thoại cũ sang `ChatSession`. Chưa kiểm tra lịch sử git.

## Loại phiên (`type`)

Giá trị từ enum `EChatSessionType`: `general` (mặc định), `recruiter_support`, `job_matching`, `cv_review`, `job_advisor`. Việc mỗi loại thay đổi hành vi chat thế nào: `Chưa xác minh`, xem `ai-chat.md` (Phase 3).

## Ví dụ document

```json
{
  "_id": "665f1a2b3c4d5e6f70819e01",
  "userId": "665f1a2b3c4d5e6f70819201",
  "userRole": "NORMAL USER",
  "type": "general",
  "title": "Tim viec backend",
  "isActive": true,
  "lastMessageAt": "2026-10-03T03:00:00.000Z",
  "isDeleted": false
}
```

## Lưu ý

- **Known Limitation:** không có TTL, hội thoại được giữ vô thời hạn. Chưa kiểm tra chính sách xóa khi người dùng xóa tài khoản.
- `legacyConversationId` có hai khai báo index cùng key (`index: true` trên field và `{ sparse: true }`). Cùng loại vấn đề như [sessions](sessions.md#known-limitation-index-trùng-key-pattern): một trong hai có thể không được tạo. Trạng thái: `Chưa xác minh`.
- `userRole` lưu vai trò tại thời điểm tạo phiên, mặc định `UNKNOWN`. Vai trò đổi sau đó không cập nhật lại.
