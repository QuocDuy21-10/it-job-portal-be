# Subscribers (`subscribers`)

Mỗi bản ghi là một đăng ký nhận gợi ý việc làm qua email theo kỹ năng và địa điểm. Mỗi lần gửi do cron hằng tuần hoặc thao tác của quản trị viên kích hoạt (xem [data-flow](../../02-architecture/data-flow.md#cron)).

- **Nguồn schema:** [subscriber.schema.ts](../../../src/subscribers/schemas/subscriber.schema.ts)
- **Phân loại dữ liệu:** có dữ liệu cá nhân (`email`, `name`).
- **Soft-delete:** có.

## Data dictionary

| Field | Type | Required | Default | Ràng buộc | Ý nghĩa |
|---|---|---|---|---|---|
| `email` | String | Có | — | — | Email nhận gợi ý việc làm |
| `name` | String | Có | — | — | Tên người đăng ký |
| `skills` | [Mixed] | Có | — | — | Danh sách kỹ năng muốn nhận gợi ý, dạng tên chuỗi |
| `location` | String | Không | — | trim | Tên địa điểm mong muốn |
| `locationCode` | String | Không | — | lowercase; trim | Mã địa điểm đã chuẩn hóa, chữ thường, dùng để khớp với tin tuyển dụng |
| `createdBy` | Mixed | Không | — | — | Người tạo bản ghi, dạng `{ _id, email }` |
| `updatedBy` | Mixed | Không | — | — | Người sửa gần nhất, dạng `{ _id, email }` |
| `deletedBy` | Mixed | Không | — | — | Người xóa mềm, dạng `{ _id, email }` |
| `createdAt` | Date | Không | — | — | Thời điểm tạo, do `timestamps` hoặc plugin |
| `updatedAt` | Date | Không | — | — | Thời điểm sửa gần nhất, do `timestamps` |
| `isDeleted` | Boolean | Không | — | — | Cờ xóa mềm. `true` nghĩa là bản ghi đã bị xóa khỏi nghiệp vụ nhưng vẫn còn trong database |
| `deletedAt` | Date | Không | — | — | Thời điểm xóa mềm |

`skills` khai báo bằng `string[]` không kèm `type` tường minh, nên Mongoose suy ra mảng Mixed: không ép kiểu phần tử về chuỗi.

## Indexes

| Keys | Thuộc tính | Mục đích |
|---|---|---|
| `{ email: 1, isDeleted: 1 }` | — | Kiểm tra giới hạn đăng ký và dọn dẹp khi xóa tài khoản |
| `{ createdBy._id: 1, isDeleted: 1, createdAt: -1 }` | — | Liệt kê đăng ký của một chủ sở hữu, mới nhất trước |
| `{ locationCode: 1, isDeleted: 1 }` | — | Lọc người đăng ký theo địa điểm |

## Quan hệ

Không có tham chiếu ObjectId. `skills` là danh sách tên kỹ năng dạng chuỗi, không phải tham chiếu tới [skills](skills.md). Chủ sở hữu được xác định qua `createdBy._id` (Mixed).

## Quy tắc nghiệp vụ

- Mỗi người dùng được tối đa **3 đăng ký đang hoạt động**. Vượt quá sẽ báo `Subscription limit reached` ([subscribers.service.ts](../../../src/subscribers/subscribers.service.ts)).
- Phải có `locationCode` hợp lệ hoặc `location` để suy ra mã. Thiếu cả hai sẽ báo `A valid locationCode or location is required`.
- Danh sách phân trang, `limit` tối đa 100, mặc định 10.

## Ví dụ document

```json
{
  "_id": "665f1a2b3c4d5e6f70819501",
  "email": "candidate@example.com",
  "name": "Nguyen Van A",
  "skills": ["TypeScript", "NestJS"],
  "location": "Ho Chi Minh",
  "locationCode": "ho-chi-minh",
  "createdBy": { "_id": "665f1a2b3c4d5e6f70819201", "email": "candidate@example.com" },
  "isDeleted": false
}
```

Giá trị `locationCode` trong ví dụ là minh họa, mã thật lấy từ danh mục địa điểm ở [location-catalog.ts](../../../src/utils/location-catalog.ts).

## Lưu ý

- Khi tài khoản bị xóa, đăng ký theo `email` được dọn dẹp (theo comment của index `{ email, isDeleted }`).
- Tài liệu chưa kiểm tra cách cron chọn người nhận. Xem `Chưa xác minh` ở `queues.md` (Phase 3).
