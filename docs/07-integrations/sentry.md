# Tích hợp Sentry

Báo cáo lỗi tới Sentry bằng `@sentry/nestjs`. Mô tả đầy đủ cùng log và health check: [observability](../02-architecture/observability.md).

## Cấu hình

| Biến | Tác dụng |
|---|---|
| `SENTRY_DSN` | Trống thì SDK tắt (dev, test) |
| `SENTRY_TRACES_SAMPLE_RATE` | Tỷ lệ trace, mặc định 0 |
| `NODE_ENV` | Dùng làm `environment` |

Khởi tạo ở [instrument.ts](../../src/instrument.ts), import đầu tiên trong `main.ts`.

## Hành vi

- `SentryGlobalFilter` (`APP_FILTER`) báo lỗi không phải `HttpException`; lỗi 4xx bị bỏ qua và nội dung phản hồi không đổi.
- Mỗi request gắn tag `request_id` từ `X-Request-Id`.
- Không đặt `sendDefaultPii` hay bộ lọc dữ liệu nhạy cảm trong `Sentry.init`; dùng mặc định của SDK. Dữ liệu cá nhân nằm trong lỗi hoặc request có thể được gửi đi: `Chưa xác minh`, cần kiểm tra cấu hình dự án Sentry.
- Lỗi trong processor hàng đợi và cron có đi qua `SentryGlobalFilter` hay không: bộ lọc là của HTTP; cách SDK bắt lỗi nền: `Chưa xác minh`.
