# API Subscribers

Tiền tố `/api/v1/subscribers`. Controller: [subscribers.controller.ts](../../../src/subscribers/subscribers.controller.ts). Module: [notifications-and-mail](../../03-modules/notifications-and-mail.md#subscribers). Collection: [subscribers](../../04-database/collections/subscribers.md).

Mọi route cần đăng nhập và **chỉ thao tác trên đăng ký của chính người gọi** (truy cập theo chủ sở hữu `createdBy._id`). Chưa có route nào mở cho vai trò khác xem đăng ký của người khác.

## Danh sách route

| Route | Auth | Mô tả |
|---|---|---|
| `POST /api/v1/subscribers` | Đăng nhập (mọi vai trò) | Đăng ký nhận gợi ý việc làm theo kỹ năng và địa điểm |
| `GET /api/v1/subscribers` | Đăng nhập (mọi vai trò) | Danh sách đăng ký của tôi, có phân trang, lọc theo địa điểm và kỹ năng |
| `PATCH /api/v1/subscribers/:id` | Đăng nhập (mọi vai trò) | Cập nhật một đăng ký của tôi |
| `DELETE /api/v1/subscribers/:id` | Đăng nhập (mọi vai trò) | Xóa một đăng ký của tôi |
| `POST /api/v1/subscribers/skills` | Đăng nhập (mọi vai trò) | Lấy các kỹ năng đã đăng ký của chính người gọi, theo email tài khoản (dùng POST, không nhận email từ client) |
| `GET /api/v1/subscribers/by-user` | Đăng nhập (mọi vai trò) | Bí danh của danh sách đăng ký của tôi |
| `GET /api/v1/subscribers/:id` | Đăng nhập (mọi vai trò) | Xem một đăng ký của tôi |

## Quy tắc

- Tối đa **3** đăng ký đang hoạt động mỗi người; vượt quá bị `400` "Subscription limit reached".
- Cần `locationCode` hợp lệ hoặc `location` để suy ra mã; thiếu cả hai bị `400`.
- `skills` tối thiểu 1, tối đa 20 phần tử, được chuẩn hóa qua danh mục kỹ năng.
- `limit` danh sách tối đa 100, mặc định 10.
- `GET /subscribers/by-user` là bí danh của danh sách của tôi (theo mô tả Swagger "alias").

## Chi tiết từng route

### `POST /api/v1/subscribers`

Đăng ký nhận gợi ý việc làm theo kỹ năng và địa điểm

- **Auth:** Đăng nhập (mọi vai trò)
- **Handler:** `create` trong [subscribers.controller.ts](../../../src/subscribers/subscribers.controller.ts)
- **Mã thành công:** 201, `message` = "Create a subscriber"

**Body: `CreateSubscriberDto`** ([create-subscriber.dto.ts](../../../src/subscribers/dto/create-subscriber.dto.ts))

| Field | Kiểu | Bắt buộc | Validation | Ví dụ |
|---|---|---|---|---|
| `name` | string | Có | IsNotEmpty, IsString, MinLength(2), MaxLength(100), Matches | 'Nguyen Van Duy' |
| `skills` | string[] | Có | IsNotEmpty, IsArray, ArrayMinSize(1), ArrayMaxSize(20), IsString | ['JavaScript', 'TypeScript', 'NestJS'] |
| `locationCode` | string | Không | IsString, MaxLength(100) | 'ha-noi' |
| `location` | string | Không | IsString, MaxLength(100) | 'Hà Nội' |

### `GET /api/v1/subscribers`

Danh sách đăng ký của tôi, có phân trang, lọc theo địa điểm và kỹ năng

- **Auth:** Đăng nhập (mọi vai trò)
- **Handler:** `findAll` trong [subscribers.controller.ts](../../../src/subscribers/subscribers.controller.ts)
- **Mã thành công:** 200, `message` = "Fetch subscribers with paginate"

**Query**

| Tên | Bắt buộc | Mô tả | Ví dụ |
|---|---|---|---|
| *(toàn bộ query string)* | — | DTO `GetSubscribersQueryDto` | |

**Query: `GetSubscribersQueryDto`** ([get-subscribers-query.dto.ts](../../../src/subscribers/dto/get-subscribers-query.dto.ts))

| Field | Kiểu | Bắt buộc | Validation | Ví dụ |
|---|---|---|---|---|
| `page` | number | Không | IsInt, Min(1) | 1 |
| `limit` | number | Không | IsInt, Min(1), Max(100) | 10 |
| `locationCode` | string | Không | IsString, MaxLength(100) | 'ha-noi' |
| `location` | string | Không | IsString, MaxLength(100) | 'Hà Nội' |
| `skill` | string | Không | IsString, MaxLength(100) | 'TypeScript' |
| `sortBy` | 'createdAt' \| 'updatedAt' \| 'name' | Không | IsIn | 'createdAt' |
| `sortOrder` | 'asc' \| 'desc' | Không | IsIn | 'desc' |

### `PATCH /api/v1/subscribers/:id`

Cập nhật một đăng ký của tôi

- **Auth:** Đăng nhập (mọi vai trò)
- **Handler:** `update` trong [subscribers.controller.ts](../../../src/subscribers/subscribers.controller.ts)
- **Mã thành công:** 200, `message` = "Update a subscriber"

**Path params**

| Tên | Kiểu | Mô tả |
|---|---|---|
| `id` | string |  |

**Body: `UpdateSubscriberDto`** ([update-subscriber.dto.ts](../../../src/subscribers/dto/update-subscriber.dto.ts))

Kế thừa `PartialType(CreateSubscriberDto)`.

_DTO không khai báo field riêng._

### `DELETE /api/v1/subscribers/:id`

Xóa một đăng ký của tôi

- **Auth:** Đăng nhập (mọi vai trò)
- **Handler:** `remove` trong [subscribers.controller.ts](../../../src/subscribers/subscribers.controller.ts)
- **Mã thành công:** 200, `message` = "Delete a subscriber"

**Path params**

| Tên | Kiểu | Mô tả |
|---|---|---|
| `id` | string |  |

### `POST /api/v1/subscribers/skills`

Lấy các kỹ năng đã đăng ký của chính người gọi, theo email tài khoản (dùng POST, không nhận email từ client)

- **Auth:** Đăng nhập (mọi vai trò)
- **Handler:** `getUserSkills` trong [subscribers.controller.ts](../../../src/subscribers/subscribers.controller.ts)
- **Mã thành công:** 201, `message` = "Get subscriber skills by email"

### `GET /api/v1/subscribers/by-user`

Bí danh của danh sách đăng ký của tôi

- **Auth:** Đăng nhập (mọi vai trò)
- **Handler:** `getMySubscriptions` trong [subscribers.controller.ts](../../../src/subscribers/subscribers.controller.ts)
- **Mã thành công:** 200, `message` = "Fetch my subscriptions"

### `GET /api/v1/subscribers/:id`

Xem một đăng ký của tôi

- **Auth:** Đăng nhập (mọi vai trò)
- **Handler:** `findOne` trong [subscribers.controller.ts](../../../src/subscribers/subscribers.controller.ts)
- **Mã thành công:** 200, `message` = "Fetch subscriber by id"

**Path params**

| Tên | Kiểu | Mô tả |
|---|---|---|
| `id` | string |  |
