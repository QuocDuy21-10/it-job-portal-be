# Jobs (`jobs`)

Tin tuyển dụng **nội bộ** do HR hoặc quản trị viên đăng. Tin lấy từ nguồn bên ngoài nằm ở collection riêng [external-jobs](external-jobs.md). Tìm kiếm hợp nhất ghép hai collection này.

- **Nguồn schema:** [job.schema.ts](../../../src/jobs/schemas/job.schema.ts)
- **Phân loại dữ liệu:** thông tin tuyển dụng công khai, cộng thêm `createdBy` và `approvedBy` chứa email người dùng.
- **Soft-delete:** có.

## Data dictionary

| Field | Type | Required | Default | Ràng buộc | Ý nghĩa |
|---|---|---|---|---|---|
| `name` | String | Có | — | trim | Tên vị trí tuyển dụng |
| `skills` | [Mixed] | Có | — | — | Danh sách tên kỹ năng yêu cầu |
| `company` | Subdoc | Có | — | — | Snapshot công ty đăng tin. Embedded |
| `company._id` | ObjectId | Có | — | — | `_id` công ty gốc |
| `company.name` | String | Có | — | trim | Tên công ty tại thời điểm lưu |
| `company.logo` | String | Không | `null` | trim | Logo công ty tại thời điểm lưu |
| `location` | String | Có | — | trim | Tên địa điểm làm việc |
| `locationCode` | String | Có | — | lowercase; trim | Mã địa điểm đã chuẩn hóa, chữ thường, dùng để lọc |
| `salary` | Number | Có | — | trim | Mức lương (số). Đơn vị không được ghi trong schema |
| `quantity` | Number | Có | — | — | Số lượng cần tuyển |
| `level` | String | Có | — | enum: `Manager`, `Lead`, `Senior`, `Mid`, `Junior`, `Internship`; trim | Cấp bậc yêu cầu |
| `formOfWork` | String | Không | — | enum: `Other`, `Hybrid`, `Remote`, `Internship`, `Freelance`, `Part-time`, `Full-time`; trim | Hình thức làm việc |
| `description` | String | Không | — | — | Mô tả công việc, nội dung dạng văn bản hoặc HTML |
| `startDate` | Date | Không | — | — | Ngày bắt đầu nhận hồ sơ |
| `endDate` | Date | Không | — | — | Hạn nhận hồ sơ. Quá hạn thì cron đặt `isActive = false` |
| `isActive` | Boolean | Có | `true` | — | Tin còn mở. `false` khi hết hạn hoặc bị tắt |
| `approvalStatus` | String | Có | `"PENDING"` | enum: `REJECTED`, `APPROVED`, `PENDING` | Trạng thái duyệt của quản trị viên. Mặc định `PENDING` |
| `approvalNote` | String | Không | — | — | Ghi chú của người duyệt |
| `approvedBy` | Mixed | Không | — | — | Người duyệt, dạng `{ _id, email }` |
| `approvedAt` | Date | Không | — | — | Thời điểm duyệt |
| `createdBy` | Mixed | Không | — | — | Người tạo bản ghi, dạng `{ _id, email }` |
| `updatedBy` | Mixed | Không | — | — | Người sửa gần nhất, dạng `{ _id, email }` |
| `deletedBy` | Mixed | Không | — | — | Người xóa mềm, dạng `{ _id, email }` |
| `createdAt` | Date | Không | — | — | Thời điểm tạo, do `timestamps` hoặc plugin |
| `updatedAt` | Date | Không | — | — | Thời điểm sửa gần nhất, do `timestamps` |
| `isDeleted` | Boolean | Không | — | — | Cờ xóa mềm. `true` nghĩa là bản ghi đã bị xóa khỏi nghiệp vụ nhưng vẫn còn trong database |
| `deletedAt` | Date | Không | — | — | Thời điểm xóa mềm |

Hai điểm khai báo kiểu cần lưu ý:

- `skills` khai báo `string[]` không có `type` tường minh, nên Mongoose suy ra mảng Mixed. Giá trị được chuẩn hóa chuỗi trước khi lưu bởi `SkillsService.normalizeControlledSkills` ([jobs.service.ts](../../../src/jobs/jobs.service.ts)), không phải bởi schema.
- `salary` có `trim: true` nhưng kiểu là Number, nên `trim` không có tác dụng.

## Indexes

| Keys | Thuộc tính | Mục đích |
|---|---|---|
| `{ company._id: 1, isActive: 1, isDeleted: 1 }` | — | Liệt kê tin đang mở của một công ty |
| `{ isActive: 1, endDate: 1, isDeleted: 1 }` | — | Cron tìm tin hết hạn |
| `{ approvalStatus: 1, isActive: 1, isDeleted: 1, endDate: 1, company._id: 1 }` | — | Truy vấn công khai: tin đã duyệt, đang mở, còn hạn, theo công ty |
| `{ skills: 1 }` | — | Lọc theo kỹ năng |
| `{ level: 1 }` | — | Lọc theo cấp bậc |
| `{ location: 1 }` | — | Lọc theo tên địa điểm |
| `{ locationCode: 1 }` | — | Lọc theo mã địa điểm |
| `{ createdAt: -1 }` | — | Sắp xếp mới nhất trước |
| `{ approvalStatus: 1 }` | — | Lọc theo trạng thái duyệt |
| `{ approvalStatus: 1, isActive: 1, isDeleted: 1 }` | — | Lọc tin theo duyệt và đang mở |
| `{ name: text, description: text }` | text | Tìm kiếm toàn văn theo tên và mô tả |
| `{ name: 1 }` | — | Sắp xếp và lọc theo tên |
| `{ company.name: 1 }` | — | Lọc theo tên công ty |

Collection có 13 index. Nhiều index trùng tiền tố (ví dụ `approvalStatus` đơn lẻ và các index ghép bắt đầu bằng `approvalStatus`). Chưa đo xem tất cả có được dùng hay không. Trạng thái: `Chưa xác minh`.

## Quan hệ

| Field | Loại | Đích |
|---|---|---|
| `company` | Embedded (`CompanySnapshot`) | Bản sao `_id`, `name`, `logo` của công ty, xem [companies](companies.md#tài-liệu-nhúng-companysnapshot) |
| `skills` | Chuỗi tên, không phải tham chiếu | Tên kỹ năng khớp danh mục [skills](skills.md) |

Snapshot công ty được tạo khi tạo tin, và khi cập nhật tin có gửi `company._id` mới (`getCompanySnapshot`).

## Quy tắc nghiệp vụ

**Duyệt tin.** Tin mới có `approvalStatus` mặc định `PENDING`. `PATCH /jobs/:id/approve` của `SUPER ADMIN` đặt `approvalStatus`, `approvalNote`, `approvedBy`, `approvedAt` ([jobs.service.ts](../../../src/jobs/jobs.service.ts)). Code không kiểm tra trạng thái hiện tại, nên `APPROVED` sang `REJECTED` và ngược lại đều được chấp nhận; tuy vậy `ApproveJobDto` chỉ nhận `APPROVED` hoặc `REJECTED`, nên **không thể quay về `PENDING`** (xem [job-approval](../../06-workflows/state-machines/job-approval.md)).

**Ai thấy tin nào** (`findAll`):

| Người gọi | Thấy |
|---|---|
| Khách hoặc `NORMAL USER` | Tin `isActive`, `APPROVED`, chưa quá `endDate` hoặc không có `endDate` |
| `HR` có công ty | Mọi tin của công ty mình, mọi trạng thái |
| `SUPER ADMIN` | Tất cả |

**Hết hạn.** Cron `deactivate-expired-jobs` chạy mỗi giờ (`Asia/Ho_Chi_Minh`), đặt `isActive = false` cho tin có `endDate` đã qua và xóa cache liên quan. Sau đó, với mỗi tin có `createdBy.email`, cron đưa một việc vào hàng đợi `job-expiration-notification` để báo cho người tạo tin (xem [data-flow](../../02-architecture/data-flow.md#bảy-hàng-đợi)).

## Ví dụ document

```json
{
  "_id": "665f1a2b3c4d5e6f70819301",
  "name": "Senior Backend Engineer",
  "skills": ["Node.js", "MongoDB"],
  "company": { "_id": "665f1a2b3c4d5e6f70819901", "name": "Example Software Co.", "logo": "images/company/example-logo.png" },
  "location": "Ho Chi Minh",
  "locationCode": "ho-chi-minh",
  "salary": 3000,
  "quantity": 2,
  "level": "Senior",
  "formOfWork": "Full-time",
  "description": "<p>Build and operate APIs.</p>",
  "startDate": "2026-10-01T00:00:00.000Z",
  "endDate": "2026-12-31T00:00:00.000Z",
  "isActive": true,
  "approvalStatus": "APPROVED",
  "approvedBy": { "_id": "665f1a2b3c4d5e6f70819202", "email": "admin@example.com" },
  "isDeleted": false
}
```

Đơn vị tiền của `salary` không được ghi trong schema. Trạng thái: `Chưa xác minh`.

## Lưu ý

- **Known Limitation:** sửa tin không đặt lại `approvalStatus` về `PENDING`. `UpdateJobDto` mở rộng `CreateJobDto` và không chứa `approvalStatus`, cộng với `ValidationPipe({ whitelist: true })` nên client không tự đổi được trạng thái duyệt qua API sửa tin. Nhưng nội dung tin đã duyệt có thể được HR sửa mà không qua duyệt lại. Đã đọc `update` trong [jobs.service.ts](../../../src/jobs/jobs.service.ts) và `grep` DTO.
- Sơ đồ vòng đời duyệt: [job-approval](../../06-workflows/state-machines/job-approval.md). Duyệt không có lịch sử, chỉ lần duyệt cuối được giữ.
