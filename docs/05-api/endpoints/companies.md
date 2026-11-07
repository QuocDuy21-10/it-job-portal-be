# API Companies

Tiền tố `/api/v1/companies`. Controller: [companies.controller.ts](../../../src/companies/companies.controller.ts). Module: [companies](../../03-modules/companies.md).

Các route `GET` công khai (`@OptionalAuth`). Với HR, danh sách và chi tiết bị thu hẹp về công ty của mình. Danh sách công ty được cache 3 phút trong Redis.

## Danh sách route

| Route | Auth | Mô tả |
|---|---|---|
| `POST /api/v1/companies` | Đăng nhập, vai trò: SUPER ADMIN | Tạo công ty (quản trị viên), từ chối nếu trùng tên |
| `POST /api/v1/companies/cleanup-orphaned-logos` | Đăng nhập, vai trò: SUPER ADMIN | Chạy tay việc dọn logo mồ côi, cùng việc cron 2 giờ sáng làm (quản trị viên) |
| `GET /api/v1/companies` | Tùy chọn (khách hoặc đã đăng nhập) | Danh sách công ty có phân trang, lọc, sắp xếp. HR chỉ thấy công ty của mình |
| `GET /api/v1/companies/top-hiring` | Tùy chọn (khách hoặc đã đăng nhập) | Công ty tuyển dụng nhiều nhất cho trang chủ |
| `GET /api/v1/companies/:id` | Tùy chọn (khách hoặc đã đăng nhập) | Chi tiết công ty. HR chỉ xem công ty của mình |
| `PATCH /api/v1/companies/:id` | Đăng nhập, vai trò: SUPER ADMIN, HR | Cập nhật công ty (quản trị viên, hoặc HR của công ty đó) |
| `DELETE /api/v1/companies/bulk` | Đăng nhập, vai trò: SUPER ADMIN | Xóa mềm nhiều công ty (quản trị viên) |
| `DELETE /api/v1/companies/:id` | Đăng nhập, vai trò: SUPER ADMIN | Xóa mềm một công ty (quản trị viên) |

## Quy tắc

- Tạo công ty: chỉ `SUPER ADMIN`, tên không được trùng.
- Sửa công ty: `SUPER ADMIN` hoặc `HR` của chính công ty đó.
- `top-hiring`: `limit` mặc định 8, tối đa 12 theo mô tả Swagger; cache 5 phút.
- Tên và logo công ty được **sao chép** vào tin tuyển dụng; sửa công ty không cập nhật các bản sao này ([companies](../../04-database/collections/companies.md#tài-liệu-nhúng-companysnapshot)).

## Chi tiết từng route

### `POST /api/v1/companies`

Tạo công ty (quản trị viên), từ chối nếu trùng tên

- **Auth:** Đăng nhập, vai trò: SUPER ADMIN
- **Handler:** `create` trong [companies.controller.ts](../../../src/companies/companies.controller.ts)
- **Mã thành công:** 201, `message` = "Create a new company"

**Body: `CreateCompanyDto`** ([create-company.dto.ts](../../../src/companies/dto/create-company.dto.ts))

| Field | Kiểu | Bắt buộc | Validation | Ví dụ |
|---|---|---|---|---|
| `name` | string | Có | IsNotEmpty, IsString, MaxLength(100) | 'Google' |
| `address` | string | Có | IsNotEmpty, IsString, MaxLength(200) | 'Ha Noi' |
| `description` | string | Có | IsNotEmpty, IsString, MaxLength(3000) | 'Google ...' |
| `logo` | string | Không | IsNotEmpty, IsString | 'logo.png' |
| `website` | string | Có | IsNotEmpty, IsString, MaxLength(100) | 'https://google.com' |
| `numberOfEmployees` | number | Không | IsNumber | 5000 |

### `POST /api/v1/companies/cleanup-orphaned-logos`

Chạy tay việc dọn logo mồ côi, cùng việc cron 2 giờ sáng làm (quản trị viên)

- **Auth:** Đăng nhập, vai trò: SUPER ADMIN
- **Handler:** `cleanupOrphanedLogos` trong [companies.controller.ts](../../../src/companies/companies.controller.ts)
- **Mã thành công:** 201, `message` = "Orphaned logo cleanup completed"

### `GET /api/v1/companies`

Danh sách công ty có phân trang, lọc, sắp xếp. HR chỉ thấy công ty của mình

- **Auth:** Tùy chọn (khách hoặc đã đăng nhập)
- **Handler:** `findAll` trong [companies.controller.ts](../../../src/companies/companies.controller.ts)
- **Mã thành công:** 200, `message` = "Get list companies"

**Query**

| Tên | Bắt buộc | Mô tả | Ví dụ |
|---|---|---|---|
| `page` | Không | Page number (default: 1) | '1' |
| `limit` | Không | Number of items per page (default: 10) | '10' |
| *(toàn bộ query string)* | — | Đọc bằng `api-query-params`: hỗ trợ lọc và sắp xếp (xem [api-overview](../api-overview.md#phân-trang-lọc-và-sắp-xếp)) | |

### `GET /api/v1/companies/top-hiring`

Công ty tuyển dụng nhiều nhất cho trang chủ

- **Auth:** Tùy chọn (khách hoặc đã đăng nhập)
- **Handler:** `findTopHiringCompanies` trong [companies.controller.ts](../../../src/companies/companies.controller.ts)
- **Mã thành công:** 200, `message` = "Get top hiring companies"

**Query**

| Tên | Bắt buộc | Mô tả | Ví dụ |
|---|---|---|---|
| `limit` | Không | Maximum number of companies to return (default: 8, max: 12) | 8 |
| *(toàn bộ query string)* | — | DTO `TopHiringCompaniesQueryDto` | |

**Query: `TopHiringCompaniesQueryDto`** ([top-hiring-company.dto.ts](../../../src/companies/dto/top-hiring-company.dto.ts))

| Field | Kiểu | Bắt buộc | Validation | Ví dụ |
|---|---|---|---|---|
| `limit` | number | Không | — | 10 |

### `GET /api/v1/companies/:id`

Chi tiết công ty. HR chỉ xem công ty của mình

- **Auth:** Tùy chọn (khách hoặc đã đăng nhập)
- **Handler:** `findOne` trong [companies.controller.ts](../../../src/companies/companies.controller.ts)
- **Mã thành công:** 200, `message` = "Get company by id"

**Path params**

| Tên | Kiểu | Mô tả |
|---|---|---|
| `id` | string |  |

### `PATCH /api/v1/companies/:id`

Cập nhật công ty (quản trị viên, hoặc HR của công ty đó)

- **Auth:** Đăng nhập, vai trò: SUPER ADMIN, HR
- **Handler:** `update` trong [companies.controller.ts](../../../src/companies/companies.controller.ts)
- **Mã thành công:** 200, `message` = "Update company by id"

**Path params**

| Tên | Kiểu | Mô tả |
|---|---|---|
| `id` | string |  |

**Body: `UpdateCompanyDto`** ([update-company.dto.ts](../../../src/companies/dto/update-company.dto.ts))

Kế thừa `PartialType(CreateCompanyDto)`.

_DTO không khai báo field riêng._

### `DELETE /api/v1/companies/bulk`

Xóa mềm nhiều công ty (quản trị viên)

- **Auth:** Đăng nhập, vai trò: SUPER ADMIN
- **Handler:** `bulkRemove` trong [companies.controller.ts](../../../src/companies/companies.controller.ts)
- **Mã thành công:** 200, `message` = "Bulk delete companies"

**Body: `BulkDeleteDto`** ([bulk-delete.dto.ts](../../../src/utils/dto/bulk-delete.dto.ts))

| Field | Kiểu | Bắt buộc | Validation | Ví dụ |
|---|---|---|---|---|
| `ids` | string[] | Có | IsArray, ArrayMinSize(1), ArrayMaxSize(100), IsMongoId | ['507f1f77bcf86cd799439011', '507f1f77bcf86cd799439012'] |

### `DELETE /api/v1/companies/:id`

Xóa mềm một công ty (quản trị viên)

- **Auth:** Đăng nhập, vai trò: SUPER ADMIN
- **Handler:** `remove` trong [companies.controller.ts](../../../src/companies/companies.controller.ts)
- **Mã thành công:** 200, `message` = "Delete company by id"

**Path params**

| Tên | Kiểu | Mô tả |
|---|---|---|
| `id` | string |  |
