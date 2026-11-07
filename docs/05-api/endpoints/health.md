# API Health

Tiền tố `/api/v1/health`. Controller: [health.controller.ts](../../../src/health/health.controller.ts). Xem [observability](../../02-architecture/observability.md#health-check).

Công khai (`@Public`) và không giới hạn tốc độ (`@SkipThrottle`). Log HTTP bỏ qua đường dẫn này.

## Danh sách route

| Route | Auth | Mô tả |
|---|---|---|
| `GET /api/v1/health` | Công khai | Kiểm tra kết nối MongoDB và Redis |

## Ghi chú

- Kiểm tra `database` (MongoDB `pingCheck`) và `redis` (`ping`).
- Dùng `@nestjs/terminus`. Route không có `@SkipTransform` (chỉ hai route stream chat có), nên kết quả của Terminus nằm trong `data` của envelope `{ statusCode, message, data }`, với `message` là `null`. Chưa chạy thử để xác nhận cấu trúc bên trong `data`.
- Không kiểm tra hàng đợi BullMQ, dịch vụ AI hay SMTP.
- Docker `HEALTHCHECK` gọi route này mỗi 30 giây ([Dockerfile](../../../Dockerfile)).

## Chi tiết từng route

### `GET /api/v1/health`

Kiểm tra kết nối MongoDB và Redis

- **Auth:** Công khai
- **Handler:** `check` trong [health.controller.ts](../../../src/health/health.controller.ts)
- **Mã thành công:** 200
