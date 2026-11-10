# Sessions (`sessions`)

Mỗi bản ghi là một phiên đăng nhập trên một thiết bị, gắn với một refresh token. Cho phép đăng nhập nhiều thiết bị, thu hồi từng phiên và giới hạn số phiên.

- **Nguồn schema:** [session.schema.ts](../../../src/sessions/schemas/session.schema.ts)
- **Phân loại dữ liệu:** có dữ liệu cá nhân gián tiếp (`ipAddress`, `userAgent`) và giá trị băm của refresh token.
- **Soft-delete:** schema không khai báo, nhưng plugin thêm `isDeleted` và `deletedAt` vào mọi schema. Phiên bị xóa thật bằng `deleteOne` hoặc `deleteMany` ([sessions.service.ts](../../../src/sessions/sessions.service.ts)), không dùng xóa mềm.

## Data dictionary

| Field | Type | Required | Default | Ràng buộc | Ý nghĩa |
|---|---|---|---|---|---|
| `userId` | ObjectId | Có | — | ref: `User` | Người sở hữu phiên |
| `refreshToken` | String | Có | — | ẩn mặc định khi truy vấn; unique | Cùng giá trị với `refreshTokenHash` (HMAC-SHA256 của refresh token), không phải token thô. Giữ lại tên field cũ |
| `refreshTokenHash` | String | Có | — | — | HMAC-SHA256 của refresh token, dùng để tra cứu phiên |
| `userAgent` | String | Có | — | — | Chuỗi User-Agent của thiết bị đăng nhập |
| `ipAddress` | String | Có | — | — | Địa chỉ IP lúc đăng nhập |
| `expiresAt` | Date | Có | — | — | Thời điểm phiên hết hạn |
| `isActive` | Boolean | Không | `true` | — | `false` khi phiên bị vô hiệu hóa nhưng chưa bị xóa |
| `lastUsedAt` | Date | Không | `(fn)` | — | Lần dùng gần nhất, dùng để chọn phiên cũ nhất khi vượt giới hạn |
| `createdAt` | Date | Không | — | — | Thời điểm tạo, do `timestamps` |
| `updatedAt` | Date | Không | — | — | Thời điểm sửa gần nhất, do `timestamps` |
| `isDeleted` | Boolean | Có | `false` | thêm bởi plugin xóa mềm | Cờ xóa mềm do plugin thêm vào, xem [database-overview](../database-overview.md#xóa-mềm) |
| `deletedAt` | Date | Không | `null` | thêm bởi plugin xóa mềm | Cờ xóa mềm do plugin thêm vào, xem [database-overview](../database-overview.md#xóa-mềm) |

## Indexes

| Keys | Thuộc tính | Mục đích |
|---|---|---|
| `{ refreshToken: 1 }` | unique | Ràng buộc unique trên token đã băm |
| `{ refreshTokenHash: 1 }` | — | Tra cứu phiên theo hash (khai báo thường, xem Known Limitation) |
| `{ expiresAt: 1 }` | — | Index thường từ `index: true` (xem Known Limitation) |
| `{ userId: 1, isActive: 1 }` | — | Đếm và liệt kê phiên đang hoạt động của người dùng |
| `{ userId: 1, expiresAt: 1 }` | — | Liệt kê phiên còn hạn của người dùng |
| `{ expiresAt: 1 }` | TTL 0s | Khai báo TTL `expireAfterSeconds: 0` (xem Known Limitation) |
| `{ refreshTokenHash: 1 }` | unique, sparse | Khai báo unique sparse (xem Known Limitation) |

### Known Limitation: index trùng key pattern

Schema khai báo hai cặp index cùng key nhưng khác option:

| Key | Khai báo 1 (từ `index: true` trên field) | Khai báo 2 (gọi `SessionSchema.index`) |
|---|---|---|
| `{ expiresAt: 1 }` | index thường | TTL `expireAfterSeconds: 0` |
| `{ refreshTokenHash: 1 }` | index thường | `unique: true, sparse: true` |

MongoDB không cho hai index cùng key pattern với option khác nhau cùng tồn tại. Một trong hai lần tạo sẽ lỗi, và index nào thắng phụ thuộc thứ tự Mongoose gửi lệnh tạo. Hệ quả có thể là **TTL không tồn tại** (phiên hết hạn không tự bị xóa) hoặc **không có ràng buộc unique** trên `refreshTokenHash`.

Trạng thái: `Chưa xác minh`. Cần chạy `db.sessions.getIndexes()` trên database thật. Code có hàm xóa phiên hết hạn thủ công (`expiresAt: { $lt: now }` ở [sessions.service.ts](../../../src/sessions/sessions.service.ts)) nên rủi ro bị giảm nhẹ, nhưng chưa kiểm tra có được gọi định kỳ không.

## Quan hệ

| Field | Loại | Đích |
|---|---|---|
| `userId` | Reference (ObjectId) | `users` |

## Ví dụ document

```json
{
  "_id": "665f1a2b3c4d5e6f70819401",
  "userId": "665f1a2b3c4d5e6f70819201",
  "refreshTokenHash": "<hmac-sha256-hex>",
  "userAgent": "Mozilla/5.0 (Macintosh) Example",
  "ipAddress": "203.0.113.10",
  "expiresAt": "2026-10-08T03:00:00.000Z",
  "isActive": true,
  "lastUsedAt": "2026-10-01T03:00:00.000Z",
  "isDeleted": false
}
```

## Vòng đời

- **Tạo:** khi đăng nhập thành công. Giá trị lưu là HMAC-SHA256 của refresh token, khóa là secret của refresh token ([sessions.service.ts](../../../src/sessions/sessions.service.ts)). Token thô không được lưu.
- **Dùng:** tra cứu theo hash, điều kiện `isActive: true` và `expiresAt` chưa qua. Hàm `updateLastUsedAt` cập nhật `lastUsedAt`.
- **Giới hạn:** `enforceSessionLimit` mặc định giữ tối đa 5 phiên đang hoạt động mỗi người, xóa các phiên có `lastUsedAt` cũ nhất.
- **Kết thúc:** đăng xuất (`deleteSession` hoặc `deactivateSession`), thu hồi toàn bộ phiên của người dùng (`isActive: false`), hoặc hết hạn.
