# Cảnh báo và runbook

Cảnh báo do Prometheus đánh giá theo [monitoring/alerts.yml](../../monitoring/alerts.yml) và Alertmanager gửi qua email. Mỗi alert có `annotations.runbook` trỏ về mục tương ứng bên dưới. Ngưỡng là phỏng đoán ban đầu: chỉnh trong `alerts.yml` (và `alerts.test.yml`) khi có số liệu thật.

## Cài đặt

1. Tạo config Alertmanager (không commit):

   ```bash
   cp monitoring/alertmanager.example.yml monitoring/alertmanager.yml
   chmod 600 monitoring/alertmanager.yml
   ```

   Điền `smtp_smarthost` (`host:port`, thường `:587`), `smtp_from`, `smtp_auth_username`, `smtp_auth_password` (cùng tài khoản với `SMTP_*` của backend) và `to` (thường là `EMAIL_ADMIN`).
2. Bật stack:

   ```bash
   docker compose -f docker-compose.prod.yml --env-file .env.production --profile monitoring up -d
   ```

3. Xem Prometheus qua SSH tunnel (port chỉ mở trên loopback):

   ```bash
   ssh -L 9090:127.0.0.1:9090 <user>@<vps>
   ```

   Mở `http://localhost:9090/alerts` và `http://localhost:9090/targets` (target `backend` phải `UP`).
4. Thử kênh email: `docker compose -f docker-compose.prod.yml stop backend`, chờ khoảng 3 phút để nhận `BackendDown`, rồi `start backend` và chờ email resolved. Chỉ làm ngoài giờ cao điểm.
5. Khuyến nghị: thêm một uptime monitor ngoài VPS (ví dụ UptimeRobot) trỏ tới `https://<domain-api>/api/v1/health/ready`. VPS chết thì Prometheus chết theo và không có email nào được gửi.

Lệnh kiểm tra dùng chung bên dưới:

```bash
docker compose -f docker-compose.prod.yml logs --since 30m backend
curl -s http://127.0.0.1:8081/api/v1/health/ready
docker compose -f docker-compose.prod.yml exec backend wget -qO- http://127.0.0.1:9464/metrics | head
```

## BackendDown

Prometheus không scrape được `backend:9464` trong 2 phút. Khi alert này bắn, Alertmanager chặn mọi alert khác.

- Kiểm tra: `docker compose -f docker-compose.prod.yml ps backend` (đang chạy? đang restart?), log backend, `curl /api/v1/health/live`.
- Nếu API vẫn trả lời nhưng metrics không: tìm log `Metrics server failed on port` (port bị chiếm) hoặc thiếu `METRICS_PORT` trong `environment` của compose.
- Nếu container restart liên tục sau deploy: [rollback](rollback.md).

## DependencyDown

Backend mất kết nối MongoDB hoặc Redis (label `dependency`) trong 2 phút.

- Kiểm tra: `docker compose -f docker-compose.prod.yml ps mongodb redis`, log của service đó, `curl /api/v1/health/ready` (trả 503 kèm chi tiết).
- Disk đầy là nguyên nhân thường gặp: `df -h` trên VPS.
- Redis down kéo theo hàng đợi, throttler và cache; MongoDB down làm hầu hết API lỗi 5xx.

## HighErrorRate

Hơn 5% request trả 5xx trong 10 phút, khi lưu lượng trên 0,1 request/giây.

- Kiểm tra: Prometheus `topk(5, sum by (route) (rate(http_request_duration_seconds_count{status_code=~"5.."}[5m])))` để biết route nào lỗi; log backend mức `error`; Sentry nếu bật.
- Mới deploy trong 30 phút qua: [rollback](rollback.md).
- Lỗi chỉ ở route gọi AI: kiểm tra quota Gemini/Groq trong log.

## HighLatency

p95 latency trên 2 giây trong 10 phút (không tính route `/stream` của chat).

- Kiểm tra: `histogram_quantile(0.95, sum by (le, route) (rate(http_request_duration_seconds_bucket[5m])))` để tìm route chậm; `EventLoopLag` có bắn cùng lúc không; CPU và RAM của VPS (`docker stats`).
- Query MongoDB chậm: xem [troubleshooting](troubleshooting.md).

## EventLoopLag

Event loop của Node bị chặn quá 500 ms (p99) trong 5 phút: một tác vụ đồng bộ nặng đang chạy trong process API.

- Kiểm tra: log quanh thời điểm đó (parse CV, job ingestion, gửi mail hàng loạt); `process_resident_memory_bytes` và `nodejs_heap_size_used_bytes` (GC áp lực cao cũng gây lag).
- Thường đi kèm `HighLatency`. Nếu kéo dài, restart backend để khôi phục trong lúc điều tra.

## QueueBacklog

Một queue có hơn 200 job `waiting` trong 15 phút.

- Kiểm tra: `GET /api/v1/resumes/queue/stats` (quản trị viên) cho hàng đợi hồ sơ; Prometheus `bullmq_jobs{state="active"}` của queue đó (bằng 0 nghĩa là worker không chạy).
- `job-recommendation` có thể tăng vọt sau lịch gửi gợi ý hằng tuần; chỉ đáng lo nếu không giảm.
- Worker kẹt: restart backend (job đang chờ vẫn nằm trong Redis).

## QueueFailedJobs

Một queue có thêm hơn 5 job `failed` trong 30 phút.

- Kiểm tra: log backend theo tên queue; lỗi gửi mail (SMTP), lỗi quota AI cho `resume-processing`.
- Hàng đợi `job-ingestion` xoá job lỗi ngay (`removeOnFail: true`) nên alert này không thấy nó; lỗi ingestion chỉ hiện qua log `[ingestion-alert]` ([health-and-logging](health-and-logging.md)).
- BullMQ cắt bớt job lỗi cũ (`removeOnFail` 500 job / 24 giờ mặc định), nên số `failed` có thể giảm mà không cần xử lý gì.
