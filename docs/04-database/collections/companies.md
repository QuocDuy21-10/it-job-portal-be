# Companies (`companies`)

Hồ sơ công ty tuyển dụng. HR thuộc về một công ty, và mỗi tin tuyển dụng gắn với một công ty.

- **Nguồn schema:** [company.schema.ts](../../../src/companies/schemas/company.schema.ts), tài liệu nhúng [company-snapshot.schema.ts](../../../src/companies/schemas/company-snapshot.schema.ts)
- **Phân loại dữ liệu:** thông tin doanh nghiệp, không có dữ liệu cá nhân của người dùng.
- **Soft-delete:** có.

## Data dictionary

| Field | Type | Required | Default | Ràng buộc | Ý nghĩa |
|---|---|---|---|---|---|
| `name` | String | Có | — | trim | Tên công ty |
| `address` | String | Có | — | trim | Địa chỉ công ty |
| `description` | String | Có | — | trim | Mô tả công ty |
| `website` | String | Không | `null` | trim | Địa chỉ website |
| `numberOfEmployees` | Number | Không | `0` | — | Số nhân viên |
| `logo` | String | Không | `null` | trim | Đường dẫn file logo trên đĩa (`public/`) |
| `createdAt` | Date | Không | — | — | Thời điểm tạo, do `timestamps` hoặc plugin |
| `updatedAt` | Date | Không | — | — | Thời điểm sửa gần nhất, do `timestamps` |
| `deletedAt` | Date | Không | — | — | Thời điểm xóa mềm |
| `isDeleted` | Boolean | Không | — | — | Cờ xóa mềm. `true` nghĩa là bản ghi đã bị xóa khỏi nghiệp vụ nhưng vẫn còn trong database |
| `createdBy` | Mixed | Không | `null` | — | Người tạo bản ghi, dạng `{ _id, email }` |
| `updatedBy` | Mixed | Không | `null` | — | Người sửa gần nhất, dạng `{ _id, email }` |
| `deletedBy` | Mixed | Không | `null` | — | Người xóa mềm, dạng `{ _id, email }` |

## Tài liệu nhúng `CompanySnapshot`

Schema `CompanySnapshot` không phải collection riêng. Đây là bản sao rút gọn của công ty, nhúng vào [users](users.md) (`company`) và [jobs](jobs.md) (`company`).

| Field | Type | Required | Default | Ý nghĩa |
|---|---|---|---|---|
| `_id` | ObjectId | Có | — | `_id` của công ty gốc trong collection `companies` |
| `name` | String (trim) | Có | — | Tên công ty tại thời điểm tạo snapshot |
| `logo` | String (trim) | Không | `null` | Đường dẫn logo tại thời điểm tạo snapshot |

Khai báo `{ _id: false, id: false }`: snapshot không tự sinh `_id` riêng, `_id` của nó chính là mã công ty gốc.

**Design Decision:** snapshot giúp liệt kê tin kèm tên và logo công ty mà không cần `$lookup`. Đánh đổi là dữ liệu có thể lệch khi công ty đổi tên hay logo. [companies.service.ts](../../../src/companies/companies.service.ts) không có đoạn nào cập nhật lại snapshot trong `jobs` hay `users` khi công ty được sửa (đã `grep` file này). Chưa kiểm tra các nơi khác trong `src/`, nên đây là **Known Limitation** ở mức `Chưa xác minh` toàn cục.

## Indexes

| Keys | Thuộc tính | Mục đích |
|---|---|---|
| `{ name: 1, isDeleted: 1 }` | — | Tra cứu và sắp xếp công ty theo tên |
| `{ createdAt: -1 }` | — | Liệt kê công ty mới nhất trước |

## Quan hệ

Công ty không tham chiếu collection nào. Các collection khác trỏ tới nó:

| Từ | Cách |
|---|---|
| `users.company` | Embedded snapshot |
| `users.companyFollowed` | Reference (mảng ObjectId) |
| `jobs.company` | Embedded snapshot |
| `resumes.companyId` | Reference (ObjectId) |

## Ví dụ document

```json
{
  "_id": "665f1a2b3c4d5e6f70819901",
  "name": "Example Software Co.",
  "address": "1 Example Street, Ho Chi Minh City",
  "description": "Product company building B2B tools.",
  "website": "https://example.com",
  "numberOfEmployees": 120,
  "logo": "images/company/example-logo.png",
  "createdBy": { "_id": "665f1a2b3c4d5e6f70819201", "email": "admin@example.com" },
  "isDeleted": false
}
```

## Vòng đời

- Logo tải lên được lưu trên đĩa. Cron `cleanup-orphaned-company-logos` (2 giờ sáng, múi giờ `Asia/Ho_Chi_Minh`) xóa các file logo không còn công ty nào tham chiếu ([companies.service.ts](../../../src/companies/companies.service.ts)).
- Số tin đang tuyển của công ty là giá trị tính khi truy vấn, không lưu trong schema này.
