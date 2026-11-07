# API Skills

Tiền tố `/api/v1/skills`. Controller: [skills.controller.ts](../../../src/skills/skills.controller.ts). Module: [skills](../../03-modules/skills.md). Collection: [skills](../../04-database/collections/skills.md).

`catalog` và `popular` công khai để giao diện hiển thị danh mục và gợi ý. Các route còn lại chỉ cho `SUPER ADMIN`.

## Danh sách route

| Route | Auth | Mô tả |
|---|---|---|
| `GET /api/v1/skills/catalog` | Công khai | Danh mục kỹ năng đang hoạt động (công khai), có thể tìm theo `search` |
| `GET /api/v1/skills/popular` | Công khai | Kỹ năng được yêu cầu nhiều nhất (công khai) |
| `POST /api/v1/skills` | Đăng nhập, vai trò: SUPER ADMIN | Tạo kỹ năng trong danh mục (quản trị viên) |
| `GET /api/v1/skills` | Đăng nhập, vai trò: SUPER ADMIN | Liệt kê kỹ năng có phân trang (quản trị viên) |
| `GET /api/v1/skills/:id` | Đăng nhập, vai trò: SUPER ADMIN | Xem một kỹ năng (quản trị viên) |
| `PATCH /api/v1/skills/:id` | Đăng nhập, vai trò: SUPER ADMIN | Cập nhật kỹ năng (quản trị viên) |
| `DELETE /api/v1/skills/bulk` | Đăng nhập, vai trò: SUPER ADMIN | Xóa mềm nhiều kỹ năng (quản trị viên) |
| `DELETE /api/v1/skills/:id` | Đăng nhập, vai trò: SUPER ADMIN | Xóa mềm một kỹ năng (quản trị viên) |

## Quy tắc

- `label` và `slug` không được trùng (kiểm tra ở ứng dụng, không có unique index).
- `slug` sinh tự động từ `label`.
- `aliases` tối đa 30 phần tử, mỗi phần tử tối đa 100 ký tự; alias trùng `label` bị bỏ.
- `GET /skills` (quản trị) dùng `api-query-params` **không** có allowlist trường lọc, xem [api-overview](../api-overview.md#lọc-và-sắp-xếp-bằng-query-string).
- `catalog` và `popular` được cache trong bộ nhớ tiến trình ([data-flow](../../02-architecture/data-flow.md#known-limitation-cache_manager-chạy-trong-bộ-nhớ-không-phải-redis)).

## Chi tiết từng route

### `GET /api/v1/skills/catalog`

Danh mục kỹ năng đang hoạt động (công khai), có thể tìm theo `search`

- **Auth:** Công khai
- **Handler:** `getCatalog` trong [skills.controller.ts](../../../src/skills/skills.controller.ts)
- **Mã thành công:** 200, `message` = "Get active skills catalog"

**Query**

| Tên | Bắt buộc | Mô tả | Ví dụ |
|---|---|---|---|
| `search` | Không |  | 'node' |
| `limit` | Không |  | 100 |

### `GET /api/v1/skills/popular`

Kỹ năng được yêu cầu nhiều nhất (công khai)

- **Auth:** Công khai
- **Handler:** `getPopular` trong [skills.controller.ts](../../../src/skills/skills.controller.ts)
- **Mã thành công:** 200, `message` = "Get popular skills"

**Query**

| Tên | Bắt buộc | Mô tả | Ví dụ |
|---|---|---|---|
| `limit` | Không |  | 20 |

### `POST /api/v1/skills`

Tạo kỹ năng trong danh mục (quản trị viên)

- **Auth:** Đăng nhập, vai trò: SUPER ADMIN
- **Handler:** `create` trong [skills.controller.ts](../../../src/skills/skills.controller.ts)
- **Mã thành công:** 201, `message` = "Skill created successfully"

**Body: `CreateSkillDto`** ([create-skill.dto.ts](../../../src/skills/dto/create-skill.dto.ts))

| Field | Kiểu | Bắt buộc | Validation | Ví dụ |
|---|---|---|---|---|
| `label` | string | Có | IsNotEmpty, IsString, MaxLength(100) | 'Node.js' |
| `aliases` | string[] | Không | IsArray, ArrayMaxSize(30), IsString, MaxLength(100) | ['node', 'nodejs', 'node js'] |
| `category` | string | Không | IsString, MaxLength(100) | 'Backend' |
| `description` | string | Không | IsString, MaxLength(500) | 'JavaScript runtime commonly used for backend development' |
| `isActive` | boolean | Có | IsNotEmpty, IsBoolean | true |

### `GET /api/v1/skills`

Liệt kê kỹ năng có phân trang (quản trị viên)

- **Auth:** Đăng nhập, vai trò: SUPER ADMIN
- **Handler:** `findAll` trong [skills.controller.ts](../../../src/skills/skills.controller.ts)
- **Mã thành công:** 200, `message` = "Skills have been retrieved successfully"

**Query**

| Tên | Bắt buộc | Mô tả | Ví dụ |
|---|---|---|---|
| `page` | Không |  |  |
| `limit` | Không |  |  |
| *(toàn bộ query string)* | — | Đọc bằng `api-query-params`: hỗ trợ lọc và sắp xếp (xem [api-overview](../api-overview.md#phân-trang-lọc-và-sắp-xếp)) | |

### `GET /api/v1/skills/:id`

Xem một kỹ năng (quản trị viên)

- **Auth:** Đăng nhập, vai trò: SUPER ADMIN
- **Handler:** `findOne` trong [skills.controller.ts](../../../src/skills/skills.controller.ts)
- **Mã thành công:** 200, `message` = "Skill has been retrieved successfully"

**Path params**

| Tên | Kiểu | Mô tả |
|---|---|---|
| `id` | string |  |

### `PATCH /api/v1/skills/:id`

Cập nhật kỹ năng (quản trị viên)

- **Auth:** Đăng nhập, vai trò: SUPER ADMIN
- **Handler:** `update` trong [skills.controller.ts](../../../src/skills/skills.controller.ts)
- **Mã thành công:** 200, `message` = "Skill updated successfully"

**Path params**

| Tên | Kiểu | Mô tả |
|---|---|---|
| `id` | string |  |

**Body: `UpdateSkillDto`** ([update-skill.dto.ts](../../../src/skills/dto/update-skill.dto.ts))

Kế thừa `PartialType(CreateSkillDto)`.

_DTO không khai báo field riêng._

### `DELETE /api/v1/skills/bulk`

Xóa mềm nhiều kỹ năng (quản trị viên)

- **Auth:** Đăng nhập, vai trò: SUPER ADMIN
- **Handler:** `bulkRemove` trong [skills.controller.ts](../../../src/skills/skills.controller.ts)
- **Mã thành công:** 200, `message` = "Bulk delete skills"

**Body: `BulkDeleteDto`** ([bulk-delete.dto.ts](../../../src/utils/dto/bulk-delete.dto.ts))

| Field | Kiểu | Bắt buộc | Validation | Ví dụ |
|---|---|---|---|---|
| `ids` | string[] | Có | IsArray, ArrayMinSize(1), ArrayMaxSize(100), IsMongoId | ['507f1f77bcf86cd799439011', '507f1f77bcf86cd799439012'] |

### `DELETE /api/v1/skills/:id`

Xóa mềm một kỹ năng (quản trị viên)

- **Auth:** Đăng nhập, vai trò: SUPER ADMIN
- **Handler:** `remove` trong [skills.controller.ts](../../../src/skills/skills.controller.ts)
- **Mã thành công:** 200, `message` = "Skill deleted successfully"

**Path params**

| Tên | Kiểu | Mô tả |
|---|---|---|
| `id` | string |  |
