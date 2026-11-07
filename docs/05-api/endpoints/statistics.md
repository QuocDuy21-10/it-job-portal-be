# API Statistics

Tiền tố `/api/v1/statistics`. Controller: [statistics.controller.ts](../../../src/statistics/statistics.controller.ts). Module: [statistics](../../03-modules/statistics.md).

## Danh sách route

| Route | Auth | Mô tả |
|---|---|---|
| `GET /api/v1/statistics/admin-dashboard` | Đăng nhập, vai trò: SUPER ADMIN | Số liệu tổng hợp toàn hệ thống (quản trị viên) |
| `GET /api/v1/statistics/hr-dashboard` | Đăng nhập, vai trò: HR | Số liệu tổng hợp theo công ty của HR |

## Ghi chú

- `admin-dashboard` chỉ `SUPER ADMIN`, cache 15 phút. `hr-dashboard` chỉ `HR` (quản trị viên **không** gọi được), cache 3 phút theo công ty.
- Cache nằm trong bộ nhớ tiến trình, nên số liệu có thể khác nhau giữa các instance ([data-flow](../../02-architecture/data-flow.md#known-limitation-cache_manager-chạy-trong-bộ-nhớ-không-phải-redis)).
- Cấu trúc phản hồi được định nghĩa bởi `AdminDashboardStatsDto` và `HrDashboardStatsDto` trong [src/statistics/dto/](../../../src/statistics/dto/); chưa liệt kê field ở đây. Xem Swagger để có ví dụ.

## Chi tiết từng route

### `GET /api/v1/statistics/admin-dashboard`

Số liệu tổng hợp toàn hệ thống (quản trị viên)

- **Auth:** Đăng nhập, vai trò: SUPER ADMIN
- **Handler:** `getAdminDashboardStats` trong [statistics.controller.ts](../../../src/statistics/statistics.controller.ts)
- **Mã thành công:** 200, `message` = "Get admin dashboard statistics"

**Phản hồi theo Swagger**

| Mã | Mô tả |
|---|---|
| 200 | Admin dashboard statistics retrieved successfully |
| 401 | Unauthorized - Invalid or missing token |

### `GET /api/v1/statistics/hr-dashboard`

Số liệu tổng hợp theo công ty của HR

- **Auth:** Đăng nhập, vai trò: HR
- **Handler:** `getHrDashboardStats` trong [statistics.controller.ts](../../../src/statistics/statistics.controller.ts)
- **Mã thành công:** 200, `message` = "Get HR dashboard statistics"

**Phản hồi theo Swagger**

| Mã | Mô tả |
|---|---|
| 200 | HR dashboard statistics retrieved successfully |
| 403 | Forbidden - HR account is not associated with a company |
