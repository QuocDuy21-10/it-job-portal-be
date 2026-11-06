# API Notifications

Tiền tố `/api/v1/notifications`. Controller: [notifications.controller.ts](../../../src/notifications/notifications.controller.ts). Module: [notifications-and-mail](../../03-modules/notifications-and-mail.md). Collection: [notifications](../../04-database/collections/notifications.md).

Mọi route cần đăng nhập và chỉ thao tác trên thông báo của chính người gọi (truy vấn luôn gắn `userId`). Thông báo mới còn được đẩy realtime qua sự kiện `notification:new`, xem [realtime](../realtime.md).

## Danh sách route

| Route | Auth | Mô tả |
|---|---|---|
| `GET /api/v1/notifications` | Đăng nhập (mọi vai trò) | Danh sách thông báo của tôi, có phân trang |
| `GET /api/v1/notifications/unread-count` | Đăng nhập (mọi vai trò) | Số thông báo chưa đọc của tôi |
| `PATCH /api/v1/notifications/:id/read` | Đăng nhập (mọi vai trò) | Đánh dấu một thông báo đã đọc |
| `PATCH /api/v1/notifications/read-all` | Đăng nhập (mọi vai trò) | Đánh dấu mọi thông báo đã đọc |
| `DELETE /api/v1/notifications/:id` | Đăng nhập (mọi vai trò) | Xóa mềm một thông báo của tôi |

## Ghi chú

- Danh sách dùng `api-query-params` **không** có allowlist; `userId` được gán lại sau khi parse nên không thể đọc thông báo của người khác, nhưng `populate` và `projection` không bị giới hạn ([api-overview](../api-overview.md#lọc-và-sắp-xếp-bằng-query-string)).
- Không có route tạo thông báo; thông báo do hệ thống tạo khi nộp hồ sơ hoặc đổi trạng thái hồ sơ.

## Chi tiết từng route

### `GET /api/v1/notifications`

Danh sách thông báo của tôi, có phân trang

- **Auth:** Đăng nhập (mọi vai trò)
- **Handler:** `findAll` trong [notifications.controller.ts](../../../src/notifications/notifications.controller.ts)
- **Mã thành công:** 200, `message` = "Notifications retrieved successfully"

**Query**

| Tên | Bắt buộc | Mô tả | Ví dụ |
|---|---|---|---|
| `page` | Không |  |  |
| `limit` | Không |  |  |
| *(toàn bộ query string)* | — | Đọc bằng `api-query-params`: hỗ trợ lọc và sắp xếp (xem [api-overview](../api-overview.md#phân-trang-lọc-và-sắp-xếp)) | |

### `GET /api/v1/notifications/unread-count`

Số thông báo chưa đọc của tôi

- **Auth:** Đăng nhập (mọi vai trò)
- **Handler:** `getUnreadCount` trong [notifications.controller.ts](../../../src/notifications/notifications.controller.ts)
- **Mã thành công:** 200, `message` = "Unread count retrieved successfully"

### `PATCH /api/v1/notifications/:id/read`

Đánh dấu một thông báo đã đọc

- **Auth:** Đăng nhập (mọi vai trò)
- **Handler:** `markAsRead` trong [notifications.controller.ts](../../../src/notifications/notifications.controller.ts)
- **Mã thành công:** 200, `message` = "Notification marked as read"

**Path params**

| Tên | Kiểu | Mô tả |
|---|---|---|
| `id` | string |  |

### `PATCH /api/v1/notifications/read-all`

Đánh dấu mọi thông báo đã đọc

- **Auth:** Đăng nhập (mọi vai trò)
- **Handler:** `markAllAsRead` trong [notifications.controller.ts](../../../src/notifications/notifications.controller.ts)
- **Mã thành công:** 200, `message` = "All notifications marked as read"

### `DELETE /api/v1/notifications/:id`

Xóa mềm một thông báo của tôi

- **Auth:** Đăng nhập (mọi vai trò)
- **Handler:** `remove` trong [notifications.controller.ts](../../../src/notifications/notifications.controller.ts)
- **Mã thành công:** 200, `message` = "Notification deleted successfully"

**Path params**

| Tên | Kiểu | Mô tả |
|---|---|---|
| `id` | string |  |
