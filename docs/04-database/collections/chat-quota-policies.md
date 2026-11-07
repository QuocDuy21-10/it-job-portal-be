# Chat Quota Policies (`chat_quota_policies`)

Cấu hình giới hạn số lượt chat mỗi ngày theo vai trò. Có thể thay đổi giới hạn mà không cần triển khai lại.

- **Nguồn schema:** [chat-quota-policy.schema.ts](../../../src/chat/schemas/chat-quota-policy.schema.ts)
- **Phân loại dữ liệu:** cấu hình hệ thống, không có dữ liệu cá nhân.
- **Soft-delete:** plugin thêm `isDeleted` và `deletedAt`.

## Data dictionary

| Field | Type | Required | Default | Ràng buộc | Ý nghĩa |
|---|---|---|---|---|---|
| `roleName` | String | Có | — | — | Tên vai trò áp dụng, trùng giá trị `ERole` |
| `dailyLimit` | Number | Không | `null` | — | Số lượt chat tối đa mỗi ngày. `null` là không giới hạn |
| `timezone` | String | Có | `"Asia/Ho_Chi_Minh"` | — | Múi giờ xác định thời điểm đặt lại bộ đếm, mặc định `Asia/Ho_Chi_Minh` |
| `isActive` | Boolean | Không | `true` | — | Chính sách đang áp dụng |
| `createdAt` | Date | Không | — | immutable | Thời điểm tạo, do `timestamps` hoặc plugin |
| `updatedAt` | Date | Không | — | — | Thời điểm sửa gần nhất, do `timestamps` |
| `isDeleted` | Boolean | Có | `false` | thêm bởi plugin xóa mềm | Cờ xóa mềm. `true` nghĩa là bản ghi đã bị xóa khỏi nghiệp vụ nhưng vẫn còn trong database |
| `deletedAt` | Date | Không | `null` | thêm bởi plugin xóa mềm | Thời điểm xóa mềm |

## Indexes

| Keys | Thuộc tính | Mục đích |
|---|---|---|
| `{ roleName: 1 }` | — | Tìm chính sách theo vai trò |
| `{ isActive: 1 }` | — | Lọc chính sách đang bật |
| `{ roleName: 1, isActive: 1 }` | — | Truy vấn chính: chính sách đang bật của một vai trò |

## Cách quota hoạt động

Collection này chỉ giữ **chính sách**. Bộ đếm lượt dùng nằm ở **Redis**, không ở MongoDB ([chat-quota.service.ts](../../../src/chat/chat-quota.service.ts)):

1. Chọn chính sách theo vai trò. `SUPER ADMIN` luôn không giới hạn (`limit = null`).
2. Tìm bản ghi `{ roleName, isActive: true }`. Chính sách được nhớ trong bộ nhớ tiến trình một thời gian.
3. Nếu không có bản ghi, dùng giá trị mặc định trong code.
4. Đếm bằng script Lua trên Redis (`INCR` kèm hạn `PEXPIRE` đến hết ngày theo múi giờ của chính sách) để chiếm chỗ nguyên tử. Nếu lượt chat thất bại có thể hoàn lại bằng `DECR`.

| Vai trò | Mặc định trong code (khi không có bản ghi) | Cấu hình ghi đè |
|---|---|---|
| `NORMAL USER` | 30 lượt/ngày | `CHAT_QUOTA_NORMAL_USER_DAILY_LIMIT` |
| `HR` | 100 lượt/ngày | `CHAT_QUOTA_HR_DAILY_LIMIT` |
| `SUPER ADMIN` | Không giới hạn | — |

`dailyLimit = null` trong bản ghi nghĩa là không giới hạn cho vai trò đó. Nếu giá trị khác `null` nhưng không hợp lệ, dùng giá trị dự phòng ở bảng trên (`normalizePolicyLimit`).

## Quan hệ

`roleName` là chuỗi trùng giá trị của `ERole`, không phải tham chiếu.

## Ví dụ document

```json
{
  "_id": "665f1a2b3c4d5e6f7081a001",
  "roleName": "NORMAL USER",
  "dailyLimit": 30,
  "timezone": "Asia/Ho_Chi_Minh",
  "isActive": true,
  "isDeleted": false
}
```

## Lưu ý

- **Known Limitation:** schema không ràng buộc duy nhất `roleName` với `isActive: true`. Nếu có hai bản ghi cùng bật cho một vai trò, `findOne` lấy bản ghi nào trước là không xác định.
- Việc ghi vào collection này (API hay seed) chưa được kiểm tra. Trạng thái: `Chưa xác minh`.
- Bộ đếm Redis mất khi Redis mất dữ liệu, dẫn đến người dùng có thể được đếm lại từ 0 trong ngày.
