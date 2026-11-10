# Health check, log và giám sát

Mô tả nền tảng nằm ở [observability](../02-architecture/observability.md). Tài liệu này là hướng dẫn vận hành: cách quan sát hệ thống đang chạy.

## Health check

| Cách | Lệnh | Ý nghĩa |
|---|---|---|
| Liveness | `curl -s http://127.0.0.1:8081/api/v1/health/live` | Process còn phục vụ HTTP |
| Readiness | `curl -s http://127.0.0.1:8081/api/v1/health/ready` | MongoDB (`database`) và Redis (`redis`); 503 nếu một trong hai lỗi |
| Docker | `docker compose -f docker-compose.prod.yml ps` | `healthy` của `backend` dựa trên liveness |
| Giám sát ngoài | Trỏ uptime monitor tới `https://<domain-api>/api/v1/health/ready` | Báo khi cả VPS chết |

Health check **không** phản ánh hàng đợi BullMQ, dịch vụ AI, SMTP, nguồn tin ngoài; hàng đợi được theo dõi qua metric và alert `QueueBacklog`, `QueueFailedJobs`.

## Log

- Log JSON ra `stdout` ở production; `pino-pretty` một dòng ở môi trường khác.
- Mức mặc định: `info` ở production, `debug` nơi khác; đổi bằng `LOG_LEVEL`.
- Mỗi request có `req.id` (từ `X-Request-Id` hợp lệ hoặc UUID), cũng trả về client trong header `X-Request-Id`.
- Docker giữ 5 file mỗi file 10 MB cho mỗi container.

```bash
docker compose -f docker-compose.prod.yml logs -f backend
docker compose -f docker-compose.prod.yml logs backend | grep <request-id>
```

Log có thể chứa dữ liệu cá nhân (văn bản CV, email lúc xóa tài khoản): [data-protection](../08-security/data-protection.md#nơi-dữ-liệu-cá-nhân-xuất-hiện-trong-log-known-limitation). Hạn chế quyền truy cập log.

### Dòng log đáng theo dõi

| Dấu hiệu | Ý nghĩa |
|---|---|
| `[ingestion-alert] <key>: ...` | Nguồn tin ngoài `SUSPECT` hoặc lỗi từ 3 lần liên tiếp. **Đây là cơ chế cảnh báo duy nhất**, không có kênh khác |
| `Gemini quota denied` và dòng "Rescheduled parse" | Đọc CV bị hoãn vì hết quota Gemini |
| `Failed to parse CV` / `Failed to analyze` | Lỗi xử lý hồ sơ; chi tiết ở `parseError`, `analysisError` của bản ghi |
| `Topic guard ... allowing response through` | Bộ lọc chủ đề lỗi và cho qua |
| `List cache read/write failed` | Redis có vấn đề, cache danh sách bị bỏ qua |
| `Skipping sync for missing or disabled job source` | Nguồn bị tắt hoặc bị xóa |

## Sentry

Đặt `SENTRY_DSN` để nhận lỗi không phải 4xx; sự kiện gắn tag `request_id` để nối với log. Không có `SENTRY_DSN` thì tắt ([sentry](../07-integrations/sentry.md)).

## Hàng đợi

| Việc cần xem | Cách |
|---|---|
| Thống kê hàng đợi hồ sơ | `GET /api/v1/resumes/queue/stats` (quản trị viên) |
| Chỉ số hàng đợi gợi ý việc làm | Trả kèm `POST /api/v1/mail/send-job-recommendations` |
| Lịch sử đồng bộ nguồn tin | `GET /api/v1/job-sources/:key/runs` |
| Chat AI | `GET /api/v1/chat/admin/usage/*` |
| Việc lỗi trong Redis | Không có giao diện trong repository; kiểm tra bằng công cụ BullMQ ngoài. Hàng đợi `job-ingestion` không giữ việc lỗi |

## Metric và cảnh báo

Prometheus scrape `backend:9464`, Alertmanager gửi email. Cài đặt, danh sách alert và cách xử lý: [alerts](alerts.md). Deploy và rollback: [rollback](rollback.md).

Chưa có: dashboard (Grafana), metric disk và RAM của VPS.
