# API Users

Tiền tố `/api/v1/users`. Controller: [users.controller.ts](../../../src/users/users.controller.ts). Module: [users](../../03-modules/users.md).

Nhóm route quản trị (`POST`, danh sách, xem, sửa, khóa, xóa) chỉ cho `SUPER ADMIN`. Nhóm `save-job`, `follow-company` dành cho người dùng đã đăng nhập tự quản lý dữ liệu của mình.

## Danh sách route

| Route | Auth | Mô tả |
|---|---|---|
| `POST /api/v1/users` | Đăng nhập, vai trò: SUPER ADMIN | Tạo người dùng với vai trò tùy chọn (quản trị viên), có thể gắn công ty cho HR |
| `GET /api/v1/users` | Đăng nhập, vai trò: SUPER ADMIN | Liệt kê người dùng có phân trang, lọc và sắp xếp (quản trị viên) |
| `PATCH /api/v1/users/:id` | Đăng nhập, vai trò: SUPER ADMIN | Cập nhật thông tin người dùng (quản trị viên) |
| `POST /api/v1/users/save-job` | Đăng nhập (mọi vai trò) | Lưu một tin tuyển dụng vào danh sách của mình |
| `DELETE /api/v1/users/save-job` | Đăng nhập (mọi vai trò) | Bỏ lưu một tin tuyển dụng |
| `GET /api/v1/users/saved-jobs` | Đăng nhập (mọi vai trò) | Xem danh sách tin đã lưu |
| `POST /api/v1/users/follow-company` | Đăng nhập (mọi vai trò) | Theo dõi một công ty |
| `DELETE /api/v1/users/follow-company` | Đăng nhập (mọi vai trò) | Bỏ theo dõi một công ty |
| `GET /api/v1/users/following-companies` | Đăng nhập (mọi vai trò) | Xem danh sách công ty đang theo dõi |
| `GET /api/v1/users/:id` | Đăng nhập, vai trò: SUPER ADMIN | Xem một người dùng theo ID (quản trị viên) |
| `PATCH /api/v1/users/:id/lock` | Đăng nhập, vai trò: SUPER ADMIN | Khóa tài khoản và vô hiệu mọi phiên (quản trị viên) |
| `PATCH /api/v1/users/:id/unlock` | Đăng nhập, vai trò: SUPER ADMIN | Mở khóa tài khoản (quản trị viên) |
| `DELETE /api/v1/users/bulk` | Đăng nhập, vai trò: SUPER ADMIN | Xóa mềm nhiều người dùng (quản trị viên) |
| `DELETE /api/v1/users/:id` | Đăng nhập, vai trò: SUPER ADMIN | Xóa mềm một người dùng (quản trị viên) |

## Lọc và sắp xếp

`GET /users` đọc bộ lọc bằng `api-query-params` và lọc qua allowlist trường và toán tử ([users.service.ts](../../../src/users/users.service.ts)), xem [api-overview](../api-overview.md#lọc-và-sắp-xếp-bằng-query-string). Các trường lọc theo văn bản gồm `name`, `email`, `company.name`.

## Quy tắc

- Khóa: không tự khóa mình; không khóa tài khoản đã khóa; khóa xong vô hiệu mọi phiên ([users](../../03-modules/users.md#business-rules)).
- Mật khẩu của người dùng được băm bằng bcryptjs; response không được kỳ vọng chứa mật khẩu, nhưng việc loại field `password` khỏi response của `GET /users` chưa được kiểm tra. Trạng thái: `Chưa xác minh`.

## Chi tiết từng route

### `POST /api/v1/users`

Tạo người dùng với vai trò tùy chọn (quản trị viên), có thể gắn công ty cho HR

- **Auth:** Đăng nhập, vai trò: SUPER ADMIN
- **Handler:** `create` trong [users.controller.ts](../../../src/users/users.controller.ts)
- **Mã thành công:** 201, `message` = "Create a new user"

**Body: `CreateUserDto`** ([create-user.dto.ts](../../../src/users/dto/create-user.dto.ts))

| Field | Kiểu | Bắt buộc | Validation | Ví dụ |
|---|---|---|---|---|
| `name` | string | Có | IsNotEmpty, IsString, MaxLength(100) | 'Test' |
| `email` | string | Có | IsEmail, IsNotEmpty | 'user@example.com' |
| `password` | string | Có | IsNotEmpty | '123456' |
| `avatar` | string | Không | IsString, MaxLength(500) | 'https://example.com/avatar.jpg' |
| `company` | CompanyDto | Không | IsNotEmptyObject, IsObject, ValidateNested | — |
| `role` | ERole | Có | IsNotEmpty, IsEnum(ERole) | ERole.HR |

_Kiểu lồng `CompanyDto`_

| Field | Kiểu | Bắt buộc | Validation | Ví dụ |
|---|---|---|---|---|
| `_id` | string | Không | IsNotEmpty, IsMongoId | '507f1f77bcf86cd799439011' |
| `name` | string | Không | IsNotEmpty, IsString, MaxLength(100) | 'Tech Corp' |
| `logo` | string | Không | IsString | 'logo.png' |

### `GET /api/v1/users`

Liệt kê người dùng có phân trang, lọc và sắp xếp (quản trị viên)

- **Auth:** Đăng nhập, vai trò: SUPER ADMIN
- **Handler:** `findAll` trong [users.controller.ts](../../../src/users/users.controller.ts)
- **Mã thành công:** 200, `message` = "Get list users"

**Query**

| Tên | Bắt buộc | Mô tả | Ví dụ |
|---|---|---|---|
| `page` | Không | Page number (default: 1) | '1' |
| `limit` | Không | Number of items per page (default: 10) | '10' |
| *(toàn bộ query string)* | — | Đọc bằng `api-query-params`: hỗ trợ lọc và sắp xếp (xem [api-overview](../api-overview.md#phân-trang-lọc-và-sắp-xếp)) | |

### `PATCH /api/v1/users/:id`

Cập nhật thông tin người dùng (quản trị viên)

- **Auth:** Đăng nhập, vai trò: SUPER ADMIN
- **Handler:** `update` trong [users.controller.ts](../../../src/users/users.controller.ts)
- **Mã thành công:** 200, `message` = "Update user by id"

**Path params**

| Tên | Kiểu | Mô tả |
|---|---|---|
| `id` | string |  |

**Body: `UpdateUserDto`** ([update-user.dto.ts](../../../src/users/dto/update-user.dto.ts))

Kế thừa `OmitType(CreateUserDto, ['password'] as const)`.

_DTO không khai báo field riêng._

### `POST /api/v1/users/save-job`

Lưu một tin tuyển dụng vào danh sách của mình

- **Auth:** Đăng nhập (mọi vai trò)
- **Handler:** `saveJob` trong [users.controller.ts](../../../src/users/users.controller.ts)
- **Mã thành công:** HttpStatus.OK, `message` = "Job saved successfully"

**Body: `SaveJobDto`** ([save-job.dto.ts](../../../src/users/dto/save-job.dto.ts))

| Field | Kiểu | Bắt buộc | Validation | Ví dụ |
|---|---|---|---|---|
| `jobId` | string | Có | IsNotEmpty, IsMongoId | '507f1f77bcf86cd799439011' |

### `DELETE /api/v1/users/save-job`

Bỏ lưu một tin tuyển dụng

- **Auth:** Đăng nhập (mọi vai trò)
- **Handler:** `unsaveJob` trong [users.controller.ts](../../../src/users/users.controller.ts)
- **Mã thành công:** HttpStatus.OK, `message` = "Job unsaved successfully"

**Body: `SaveJobDto`** ([save-job.dto.ts](../../../src/users/dto/save-job.dto.ts))

| Field | Kiểu | Bắt buộc | Validation | Ví dụ |
|---|---|---|---|---|
| `jobId` | string | Có | IsNotEmpty, IsMongoId | '507f1f77bcf86cd799439011' |

### `GET /api/v1/users/saved-jobs`

Xem danh sách tin đã lưu

- **Auth:** Đăng nhập (mọi vai trò)
- **Handler:** `getSavedJobs` trong [users.controller.ts](../../../src/users/users.controller.ts)
- **Mã thành công:** 200, `message` = "Get saved jobs successfully"

**Query**

| Tên | Bắt buộc | Mô tả | Ví dụ |
|---|---|---|---|
| `page` | Không | Page number (default: 1) | 1 |
| `limit` | Không | Number of items per page (default: 10) | 10 |

### `POST /api/v1/users/follow-company`

Theo dõi một công ty

- **Auth:** Đăng nhập (mọi vai trò)
- **Handler:** `followCompany` trong [users.controller.ts](../../../src/users/users.controller.ts)
- **Mã thành công:** HttpStatus.OK, `message` = "Company followed successfully"

**Body: `FollowCompanyDto`** ([follow-company.dto.ts](../../../src/users/dto/follow-company.dto.ts))

| Field | Kiểu | Bắt buộc | Validation | Ví dụ |
|---|---|---|---|---|
| `companyId` | string | Có | IsNotEmpty, IsMongoId | '507f1f77bcf86cd799439011' |

### `DELETE /api/v1/users/follow-company`

Bỏ theo dõi một công ty

- **Auth:** Đăng nhập (mọi vai trò)
- **Handler:** `unfollowCompany` trong [users.controller.ts](../../../src/users/users.controller.ts)
- **Mã thành công:** HttpStatus.OK, `message` = "Company unfollowed successfully"

**Body: `FollowCompanyDto`** ([follow-company.dto.ts](../../../src/users/dto/follow-company.dto.ts))

| Field | Kiểu | Bắt buộc | Validation | Ví dụ |
|---|---|---|---|---|
| `companyId` | string | Có | IsNotEmpty, IsMongoId | '507f1f77bcf86cd799439011' |

### `GET /api/v1/users/following-companies`

Xem danh sách công ty đang theo dõi

- **Auth:** Đăng nhập (mọi vai trò)
- **Handler:** `getFollowingCompanies` trong [users.controller.ts](../../../src/users/users.controller.ts)
- **Mã thành công:** 200, `message` = "Get following companies successfully"

### `GET /api/v1/users/:id`

Xem một người dùng theo ID (quản trị viên)

- **Auth:** Đăng nhập, vai trò: SUPER ADMIN
- **Handler:** `findOne` trong [users.controller.ts](../../../src/users/users.controller.ts)
- **Mã thành công:** 200, `message` = "Get user by id"

**Path params**

| Tên | Kiểu | Mô tả |
|---|---|---|
| `id` | string |  |

### `PATCH /api/v1/users/:id/lock`

Khóa tài khoản và vô hiệu mọi phiên (quản trị viên)

- **Auth:** Đăng nhập, vai trò: SUPER ADMIN
- **Handler:** `lockUser` trong [users.controller.ts](../../../src/users/users.controller.ts)
- **Mã thành công:** 200, `message` = "User account locked successfully"

**Path params**

| Tên | Kiểu | Mô tả |
|---|---|---|
| `id` | string |  |

**Body: `LockUserDto`** ([lock-user.dto.ts](../../../src/users/dto/lock-user.dto.ts))

| Field | Kiểu | Bắt buộc | Validation | Ví dụ |
|---|---|---|---|---|
| `reason` | string | Không | IsString, MaxLength(500) | 'Violated community guidelines' |

### `PATCH /api/v1/users/:id/unlock`

Mở khóa tài khoản (quản trị viên)

- **Auth:** Đăng nhập, vai trò: SUPER ADMIN
- **Handler:** `unlockUser` trong [users.controller.ts](../../../src/users/users.controller.ts)
- **Mã thành công:** 200, `message` = "User account unlocked successfully"

**Path params**

| Tên | Kiểu | Mô tả |
|---|---|---|
| `id` | string |  |

### `DELETE /api/v1/users/bulk`

Xóa mềm nhiều người dùng (quản trị viên)

- **Auth:** Đăng nhập, vai trò: SUPER ADMIN
- **Handler:** `bulkRemove` trong [users.controller.ts](../../../src/users/users.controller.ts)
- **Mã thành công:** 200, `message` = "Bulk delete users"

**Body: `BulkDeleteDto`** ([bulk-delete.dto.ts](../../../src/utils/dto/bulk-delete.dto.ts))

| Field | Kiểu | Bắt buộc | Validation | Ví dụ |
|---|---|---|---|---|
| `ids` | string[] | Có | IsArray, ArrayMinSize(1), ArrayMaxSize(100), IsMongoId | ['507f1f77bcf86cd799439011', '507f1f77bcf86cd799439012'] |

### `DELETE /api/v1/users/:id`

Xóa mềm một người dùng (quản trị viên)

- **Auth:** Đăng nhập, vai trò: SUPER ADMIN
- **Handler:** `remove` trong [users.controller.ts](../../../src/users/users.controller.ts)
- **Mã thành công:** 200, `message` = "Delete user by id"

**Path params**

| Tên | Kiểu | Mô tả |
|---|---|---|
| `id` | string |  |
