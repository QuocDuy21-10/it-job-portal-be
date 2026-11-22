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
| `{ userId: 1, isActive: 1 }` | — | Đếm và liệt kê phiên đang hoạt động của người dùng |
| `{ userId: 1, expiresAt: 1 }` | — | Liệt kê phiên còn hạn của người dùng |
| `{ expiresAt: 1 }` | TTL 0s | MongoDB tự xóa phiên khi hết hạn |
| `{ refreshTokenHash: 1 }` | unique | Tra cứu phiên theo hash, mỗi hash một phiên |

### Known Limitation: index trùng key pattern

**Đã sửa ngày 2026-11-22.** Trước đây schema khai báo `expiresAt` và `refreshTokenHash` hai lần (`index: true` trên field và `SessionSchema.index(...)` với TTL hoặc unique). Hai khai báo có cùng tên tự sinh, nên Mongoose tạo index thường trước và lần tạo TTL/unique lỗi im lặng. Production (kiểm tra ngày 2026-11-21) có `expiresAt_1` không TTL và `refreshTokenHash_1` không unique; phiên hết hạn vẫn nằm lại.

Nay mỗi trường chỉ khai báo một lần ([session.schema.ts](../../../src/sessions/schemas/session.schema.ts), có test). Database đã tồn tại cần chạy một lần migration [session-indexes.ts](../../../src/databases/migrations/session-indexes.ts) (`npm run migrate:session-indexes`, hoặc `node dist/databases/migrations/session-indexes.js` trong container backend). Migration dùng `collMod` để đổi index tại chỗ, chạy lại không làm gì, và dừng lại báo cáo nếu có hash trùng thay vì xóa dữ liệu.

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
