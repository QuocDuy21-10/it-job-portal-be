# API Crawl Failures

Tiền tố `/api/v1/crawl-failures`. Controller: [crawl-failures.controller.ts](../../../src/job-ingestion/crawl-failures.controller.ts). Collection: [crawl-failures](../../04-database/collections/crawl-failures.md).

Toàn bộ route chỉ cho `SUPER ADMIN`; vai trò khác nhận `403`.

| Route | Mô tả |
|---|---|
| `GET /api/v1/crawl-failures` | Liệt kê tin crawler không lưu được hoặc đã lọc bỏ |
| `POST /api/v1/crawl-failures/retry` | Cho phép các tin được tải lại ở lần đồng bộ kế tiếp |

## `GET /api/v1/crawl-failures`

- **Query:** `page`, `limit` (tối đa 100), `sourceKey`, `group` (`error` mặc định, hoặc `filtered`), `reason` (ghi đè `group`), `from`, `to` (IsDateString, bao gồm hai đầu, lọc theo `failedAt`).
- `error` gồm mọi lý do trừ `NOT_IT`; `filtered` là `NOT_IT` (crawler chạy đúng và lọc tin ra). Sắp xếp `failedAt` giảm dần.
- **Thành công:** 200, `message` = "Lấy danh sách tin lỗi thành công".

## `POST /api/v1/crawl-failures/retry`

- **Body:** `{ ids: string[1..100] }`; id sai trả `400`.
- Đặt `retryAt` về hiện tại, **không** khởi động đồng bộ; tin được tải ở lần đồng bộ kế tiếp.
- **Thành công:** 200, `data = { modified }`, `message` = "Tin sẽ được thử lại ở lần đồng bộ kế tiếp".
