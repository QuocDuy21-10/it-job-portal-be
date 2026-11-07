# API Jobs

Tiền tố `/api/v1/jobs`. Controller: [jobs.controller.ts](../../../src/jobs/jobs.controller.ts). Module: [jobs](../../03-modules/jobs.md). Collection: [jobs](../../04-database/collections/jobs.md).

## Ai thấy tin nào

`GET /jobs` và `GET /jobs/:id` công khai (`@OptionalAuth`), kết quả phụ thuộc người gọi:

| Người gọi | Thấy |
|---|---|
| Khách hoặc `NORMAL USER` | Tin `isActive`, `APPROVED`, chưa quá `endDate` (hoặc không có `endDate`) |
| `HR` có công ty | Mọi tin của công ty mình, mọi trạng thái |
| `SUPER ADMIN` | Tất cả |

Danh sách được cache 60 giây trong Redis, tách theo phạm vi (`public`, `super-admin`, `hr:<companyId>`).

## Danh sách route

| Route | Auth | Mô tả |
|---|---|---|
| `POST /api/v1/jobs` | Đăng nhập, vai trò: SUPER ADMIN, HR | Tạo tin tuyển dụng, trạng thái duyệt mặc định `PENDING` (quản trị viên hoặc HR) |
| `GET /api/v1/jobs` | Tùy chọn (khách hoặc đã đăng nhập) | Danh sách tin có phân trang, lọc, sắp xếp và tìm theo `keyword`. Kết quả phụ thuộc người gọi |
| `GET /api/v1/jobs/:id` | Tùy chọn (khách hoặc đã đăng nhập) | Chi tiết một tin |
| `PATCH /api/v1/jobs/:id` | Đăng nhập, vai trò: SUPER ADMIN, HR | Cập nhật tin. HR chỉ sửa tin công ty mình |
| `DELETE /api/v1/jobs/bulk` | Đăng nhập, vai trò: SUPER ADMIN, HR | Xóa mềm nhiều tin |
| `DELETE /api/v1/jobs/:id` | Đăng nhập, vai trò: SUPER ADMIN, HR | Xóa mềm một tin |
| `PATCH /api/v1/jobs/:id/approve` | Đăng nhập, vai trò: SUPER ADMIN | Duyệt hoặc từ chối tin (quản trị viên) |

## Lọc, tìm kiếm và sắp xếp

- `keyword` tìm trên tên tin, kỹ năng và tên công ty.
- Bộ lọc khác đọc từ query string bằng `api-query-params`, **chỉ** các trường: `name`, `skills`, `location`, `locationCode`, `salary`, `quantity`, `level`, `formOfWork`, `isActive`, `approvalStatus`, `company._id`, `startDate`, `endDate`, `createdAt`. Trường khác bị bỏ qua.
- Sắp xếp **chỉ** theo các trường trong `ALLOWED_SORT_FIELDS` (ví dụ `name`, `salary`, `createdAt`, `updatedAt`, `level`, `location`), giá trị `1` hoặc `-1`.
- `skills` được chuẩn hóa qua danh mục kỹ năng; giá trị không có trong danh mục làm yêu cầu bị `400`.

## Quy tắc ghi

- `POST` và `PATCH`: kỹ năng và địa điểm được chuẩn hóa; `company._id` quyết định snapshot công ty.
- `PATCH /jobs/:id/approve`: chỉ `SUPER ADMIN`, đặt `approvalStatus`, `approvalNote`, `approvedBy`, `approvedAt`. Không kiểm tra trạng thái hiện tại, nhưng DTO chỉ nhận `APPROVED` hoặc `REJECTED` (không quay lại `PENDING`).
- Tạo tin luôn đưa việc "tin mới" vào hàng đợi báo người theo dõi công ty, **trước khi tin được duyệt** ([jobs](../../03-modules/jobs.md#known-limitation)).
- `approvalStatus` không nằm trong `CreateJobDto` hay `UpdateJobDto`, nên không đặt được qua `POST`/`PATCH`; tin mới luôn `PENDING`.

## Chi tiết từng route

### `POST /api/v1/jobs`

Tạo tin tuyển dụng, trạng thái duyệt mặc định `PENDING` (quản trị viên hoặc HR)

- **Auth:** Đăng nhập, vai trò: SUPER ADMIN, HR
- **Handler:** `create` trong [jobs.controller.ts](../../../src/jobs/jobs.controller.ts)
- **Mã thành công:** 201, `message` = "Create a new job"

**Body: `CreateJobDto`** ([create-job.dto.ts](../../../src/jobs/dto/create-job.dto.ts))

| Field | Kiểu | Bắt buộc | Validation | Ví dụ |
|---|---|---|---|---|
| `name` | string | Có | IsNotEmpty, IsString, MaxLength(100) | 'Senior Backend Engineer' |
| `skills` | string[] | Có | IsNotEmpty, IsArray, ArrayMinSize(1), IsString, MaxLength(100) | ['NestJS', 'MongoDB', 'TypeScript', 'Docker'] |
| `company` | CompanyDto | Có | IsNotEmptyObject, IsObject, ValidateNested | — |
| `locationCode` | string | Không | IsString, MaxLength(100) | 'ha-noi' |
| `location` | string | Không | IsString, MaxLength(200) | 'Hà Nội' |
| `salary` | number | Có | IsNotEmpty, IsNumber, IsPositive | 25000000 |
| `quantity` | number | Có | IsNotEmpty, IsInt, Min(1), Max(1000) | 5 |
| `level` | EJobLevel | Có | IsNotEmpty, IsEnum(EJobLevel), IsString, MaxLength(50) | EJobLevel.SENIOR |
| `formOfWork` | string | Có | IsNotEmpty, IsString, IsEnum(EJobFormOfWork) | EJobFormOfWork.FULL_TIME |
| `description` | string | Có | IsNotEmpty, IsString, MaxLength(5000) | 'We are looking for an experienced backend engineer to join … |
| `startDate` | Date | Có | IsNotEmpty, IsDate | '2025-11-01' |
| `endDate` | Date | Có | IsNotEmpty, IsDate, IsAfter | '2025-12-31' |
| `isActive` | boolean | Có | IsNotEmpty, IsBoolean | true |

_Kiểu lồng `CompanyDto`_

| Field | Kiểu | Bắt buộc | Validation | Ví dụ |
|---|---|---|---|---|
| `_id` | string | Không | IsNotEmpty, IsMongoId | '507f1f77bcf86cd799439011' |
| `name` | string | Không | IsNotEmpty, IsString, MaxLength(100) | 'Tech Corp' |
| `logo` | string | Không | IsString | 'logo.png' |

### `GET /api/v1/jobs`

Danh sách tin có phân trang, lọc, sắp xếp và tìm theo `keyword`. Kết quả phụ thuộc người gọi

- **Auth:** Tùy chọn (khách hoặc đã đăng nhập)
- **Handler:** `findAll` trong [jobs.controller.ts](../../../src/jobs/jobs.controller.ts)
- **Mã thành công:** 200, `message` = "Get list jobs"

**Query**

| Tên | Bắt buộc | Mô tả | Ví dụ |
|---|---|---|---|
| `page` | Không | Page number (starts from 1) | 1 |
| `limit` | Không | Number of items per page | 10 |
| `keyword` | Không | Search keyword — matches job title, skills, and company name | 'React' |
| *(toàn bộ query string)* | — | Đọc bằng `api-query-params`: hỗ trợ lọc và sắp xếp (xem [api-overview](../api-overview.md#phân-trang-lọc-và-sắp-xếp)) | |

### `GET /api/v1/jobs/:id`

Chi tiết một tin

- **Auth:** Tùy chọn (khách hoặc đã đăng nhập)
- **Handler:** `findOne` trong [jobs.controller.ts](../../../src/jobs/jobs.controller.ts)
- **Mã thành công:** 200, `message` = "Get job by id"

**Path params**

| Tên | Kiểu | Mô tả |
|---|---|---|
| `id` | string |  |

### `PATCH /api/v1/jobs/:id`

Cập nhật tin. HR chỉ sửa tin công ty mình

- **Auth:** Đăng nhập, vai trò: SUPER ADMIN, HR
- **Handler:** `update` trong [jobs.controller.ts](../../../src/jobs/jobs.controller.ts)
- **Mã thành công:** 200, `message` = "Update job by id"

**Path params**

| Tên | Kiểu | Mô tả |
|---|---|---|
| `id` | string |  |

**Body: `UpdateJobDto`** ([update-job.dto.ts](../../../src/jobs/dto/update-job.dto.ts))

Kế thừa `PartialType(CreateJobDto)`.

_DTO không khai báo field riêng._

### `DELETE /api/v1/jobs/bulk`

Xóa mềm nhiều tin

- **Auth:** Đăng nhập, vai trò: SUPER ADMIN, HR
- **Handler:** `bulkRemove` trong [jobs.controller.ts](../../../src/jobs/jobs.controller.ts)
- **Mã thành công:** 200, `message` = "Bulk delete jobs"

**Body: `BulkDeleteDto`** ([bulk-delete.dto.ts](../../../src/utils/dto/bulk-delete.dto.ts))

| Field | Kiểu | Bắt buộc | Validation | Ví dụ |
|---|---|---|---|---|
| `ids` | string[] | Có | IsArray, ArrayMinSize(1), ArrayMaxSize(100), IsMongoId | ['507f1f77bcf86cd799439011', '507f1f77bcf86cd799439012'] |

### `DELETE /api/v1/jobs/:id`

Xóa mềm một tin

- **Auth:** Đăng nhập, vai trò: SUPER ADMIN, HR
- **Handler:** `remove` trong [jobs.controller.ts](../../../src/jobs/jobs.controller.ts)
- **Mã thành công:** 200, `message` = "Delete job by id"

**Path params**

| Tên | Kiểu | Mô tả |
|---|---|---|
| `id` | string |  |

### `PATCH /api/v1/jobs/:id/approve`

Duyệt hoặc từ chối tin (quản trị viên)

- **Auth:** Đăng nhập, vai trò: SUPER ADMIN
- **Handler:** `approveJob` trong [jobs.controller.ts](../../../src/jobs/jobs.controller.ts)
- **Mã thành công:** 200, `message` = "Job approval status updated"

**Path params**

| Tên | Kiểu | Mô tả |
|---|---|---|
| `id` | string |  |

**Body: `ApproveJobDto`** ([approve-job.dto.ts](../../../src/jobs/dto/approve-job.dto.ts))

| Field | Kiểu | Bắt buộc | Validation | Ví dụ |
|---|---|---|---|---|
| `status` | EJobApprovalStatus | Có | IsNotEmpty, IsEnum(ALLOWED_STATUSES) | EJobApprovalStatus.APPROVED |
| `approvalNote` | string | Không | IsString, MaxLength(500) | 'Job description does not meet content guidelines.' |
