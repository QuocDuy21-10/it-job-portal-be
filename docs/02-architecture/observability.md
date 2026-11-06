# Quan sát hệ thống: log, lỗi, health check

Tài liệu này mô tả những gì backend hiện có để theo dõi hoạt động khi chạy. Hướng dẫn xử lý sự cố nằm ở `11-operations` (Phase 4).

## Tóm tắt

| Khả năng | Trạng thái | Nguồn |
|---|---|---|
| Log có cấu trúc | Có, `nestjs-pino` | [app.module.ts](../../src/app.module.ts) |
| Request id xuyên suốt | Có, gắn vào log, header phản hồi và Sentry | [request-id.helper.ts](../../src/utils/helpers/request-id.helper.ts) |
| Che thông tin nhạy cảm trong log | Có, ba header | [app.module.ts](../../src/app.module.ts) |
| Báo cáo lỗi | Có, Sentry, tắt khi không có DSN | [instrument.ts](../../src/instrument.ts) |
| Health check | Có, `GET /api/v1/health` | [health.controller.ts](../../src/health/health.controller.ts) |
| Metric (Prometheus, v.v.) | Không có trong dependency | [package.json](../../package.json) |
| Tracing phân tán | Chỉ Sentry tracing, tỷ lệ mặc định 0 | [instrument.ts](../../src/instrument.ts) |

## Log

Cấu hình `pinoHttp` trong `AppModule`:

| Hạng mục | Giá trị |
|---|---|
| Mức log | `LOG_LEVEL`, nếu trống thì `info` ở production và `debug` ở môi trường khác |
| Định dạng | JSON ở production. Ngoài production dùng `pino-pretty` một dòng |
| Mức theo mã phản hồi | lỗi hoặc `>= 500` là `error`, `>= 400` là `warn`, còn lại `info` |
| Bỏ qua | Request có URL bắt đầu bằng `/api/v1/health`, vì Docker gọi mỗi 30 giây |
| Che | `req.headers.authorization`, `req.headers.cookie`, `res.headers["set-cookie"]` |

`Current Implementation`: việc che chỉ áp dụng cho ba đường dẫn trên trong log HTTP của pino. Các lệnh `Logger` trong service có thể ghi nội dung khác. Quy tắc dữ liệu cá nhân không được ghi vào log sẽ nằm ở `08-security/data-protection.md` (Phase 4).

## Request id

`resolveRequestId` xử lý `X-Request-Id`:

1. Nếu header do proxy gửi khớp mẫu `^[\w-]{1,128}$` thì dùng lại.
2. Nếu không thì sinh UUID mới.
3. Đặt giá trị vào header phản hồi `X-Request-Id` và gắn tag `request_id` cho Sentry.

Lý do kiểm tra mẫu được ghi trong comment: header do client kiểm soát, chỉ dùng lại giá trị không làm hỏng dòng log JSON.

## Sentry

- `instrument.ts` được import đầu tiên trong `main.ts` vì Sentry vá module khi chúng được nạp.
- `SENTRY_DSN` trống thì SDK tắt, phù hợp với phát triển và test.
- `SENTRY_TRACES_SAMPLE_RATE` mặc định 0, theo ghi chú trong `.env.example` là để giữ hạn mức miễn phí cho lỗi.
- `SentryGlobalFilter` được đăng ký là `APP_FILTER`. Theo comment trong `AppModule`, lỗi `HttpException` (4xx) bị bỏ qua và nội dung phản hồi không đổi.

## Health check

`GET /api/v1/health` công khai (`@Public()`, `@SkipThrottle()`), kiểm tra:

| Chỉ số | Cách kiểm tra |
|---|---|
| `database` | `MongooseHealthIndicator.pingCheck` |
| `redis` | `redis.ping()` trên `REDIS_CLIENT` |

`Dockerfile` ở stage `production` có `HEALTHCHECK` chu kỳ 30 giây, timeout 5 giây, thời gian khởi động 40 giây, thử lại 3 lần.

Health check **không** kiểm tra hàng đợi BullMQ, dịch vụ AI hay SMTP. Một worker bị kẹt không làm health check thất bại.

## Known Limitation

- Không có metric về độ dài hàng đợi hay job thất bại ngoài việc đọc trực tiếp BullMQ. Controller `resumes` và `mail` có endpoint trả số liệu hàng đợi (`getQueueStats` và `getQueueMetrics` trong service), nhưng chưa phải hệ thống giám sát tự động. Chưa đối chiếu quyền truy cập của các endpoint này.
- Nội dung Sentry có thể chứa dữ liệu từ request. Chưa xác minh cấu hình `sendDefaultPii` và bộ lọc dữ liệu cá nhân, vì `Sentry.init` trong `instrument.ts` không đặt tùy chọn này và dùng giá trị mặc định của SDK.

## Future Improvement

- Health check riêng cho hàng đợi (độ trễ, số job thất bại).
- Xuất metric để dựng dashboard cảnh báo.
