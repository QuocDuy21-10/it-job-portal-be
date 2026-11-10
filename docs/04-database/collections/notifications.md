# Notifications (`notifications`)

Thông báo trong ứng dụng gửi tới từng người dùng. Cùng với thông báo thời gian thực qua Socket.IO (`/notifications`), bản ghi này là bản lưu bền vững.

- **Nguồn schema:** [notification.schema.ts](../../../src/notifications/schemas/notification.schema.ts)
- **Phân loại dữ liệu:** có thể chứa dữ liệu cá nhân trong `title`, `message`, `data`.
- **Soft-delete:** có (schema tự khai báo `isDeleted`, `deletedAt`).

## Data dictionary

| Field | Type | Required | Default | Ràng buộc | Ý nghĩa |
|---|---|---|---|---|---|
| `userId` | ObjectId | Có | — | ref: `User` | Người nhận thông báo |
| `type` | String | Có | — | enum: `NEW_APPLICATION`, `APPLICATION_STATUS_CHANGE` | Loại thông báo |
| `title` | String | Có | — | — | Tiêu đề hiển thị |
| `message` | String | Có | — | — | Nội dung hiển thị |
| `data` | Mixed | Không | — | — | Dữ liệu kèm theo (Mixed), thường là mã đối tượng liên quan để giao diện điều hướng |
| `isRead` | Boolean | Không | `false` | — | Đã đọc hay chưa |
| `readAt` | Date | Không | — | — | Thời điểm đọc |
| `createdBy` | Mixed | Không | — | — | Người tạo bản ghi, dạng `{ _id, email }` |
| `updatedBy` | Mixed | Không | — | — | Người sửa gần nhất, dạng `{ _id, email }` |
| `deletedBy` | Mixed | Không | — | — | Người xóa mềm, dạng `{ _id, email }` |
| `isDeleted` | Boolean | Không | `false` | — | Cờ xóa mềm. `true` nghĩa là bản ghi đã bị xóa khỏi nghiệp vụ nhưng vẫn còn trong database |
| `deletedAt` | Date | Không | — | — | Thời điểm xóa mềm |
| `createdAt` | Date | Không | — | — | Thời điểm tạo, do `timestamps` hoặc plugin |
| `updatedAt` | Date | Không | — | — | Thời điểm sửa gần nhất, do `timestamps` |

## Indexes

| Keys | Thuộc tính | Mục đích |
|---|---|---|
| `{ isRead: 1 }` | — | Lọc theo trạng thái đọc |
| `{ userId: 1, isRead: 1, createdAt: -1 }` | — | Danh sách thông báo chưa đọc của một người, mới nhất trước |

## Quan hệ

| Field | Loại | Đích |
|---|---|---|
| `userId` | Reference (ObjectId) | `users`, người nhận thông báo |

## Loại thông báo

Giá trị của `type` lấy từ enum [notification-type.enum.ts](../../../src/notifications/enums/notification-type.enum.ts) và được tạo ở [application-notification.service.ts](../../../src/resumes/services/application-notification.service.ts):

| `type` | Khi nào |
|---|---|
| `NEW_APPLICATION` | Có hồ sơ ứng tuyển mới (gửi cho phía nhà tuyển dụng) |
| `APPLICATION_STATUS_CHANGE` | Trạng thái hồ sơ đổi (gửi cho ứng viên) |

Đối tượng nhận của từng loại suy từ tên và vị trí tạo, chưa đọc chi tiết. Trạng thái: `Chưa xác minh`.

## Ví dụ document

```json
{
  "_id": "665f1a2b3c4d5e6f70819601",
  "userId": "665f1a2b3c4d5e6f70819201",
  "type": "APPLICATION_STATUS_CHANGE",
  "title": "Cap nhat ho so",
  "message": "Ho so cua ban da chuyen sang trang thai REVIEWING",
  "data": { "resumeId": "665f1a2b3c4d5e6f70819701", "status": "REVIEWING" },
  "isRead": false,
  "isDeleted": false,
  "createdAt": "2026-10-02T03:00:00.000Z"
}
```

Cấu trúc của `data` trong ví dụ là minh họa, vì field là Mixed và nội dung thực tế do nơi tạo thông báo quyết định.

## Lưu ý

- **Known Limitation:** không có TTL, thông báo được giữ vô thời hạn trừ khi bị xóa mềm.
- Truy vấn chính "thông báo chưa đọc của người dùng, mới nhất trước" được phục vụ bởi index ghép `{ userId, isRead, createdAt }`.
