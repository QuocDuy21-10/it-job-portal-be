# Crawl Failures (`crawl_failures`)

Lý do gần nhất khiến một tin trong danh sách nguồn không được lưu. Thay thế mảng `job_sources.rejections`. Bản ghi biến mất khi tin được lưu thành công hoặc không còn trong danh sách nguồn (chỉ khi danh sách đầy đủ, không phải `SUSPECT`).

- **Nguồn schema:** [crawl-failure.schema.ts](../../../src/job-ingestion/schemas/crawl-failure.schema.ts)

| Field | Type | Required | Ý nghĩa |
|---|---|---|---|
| `sourceKey` | String | Có | `job_sources.key` |
| `externalId` | String | Có | Mã tin tại nguồn |
| `url`, `title` | String | Không | Liên kết và tiêu đề để admin kiểm tra |
| `reason` | String | Có | `FETCH_ERROR`, `NOT_FOUND`, `NO_STRUCTURED_DATA`, `MISSING_FIELDS`, `NOT_IT` |
| `detail` | String | Không | Chi tiết lỗi, cắt ở 300 ký tự |
| `failedAt` | Date | Có | Lần thất bại gần nhất |
| `retryAt` | Date | Có | Trước thời điểm này tin không được tải lại |

Thời gian chờ theo lý do: `FETCH_ERROR` 0 ngày, `NOT_FOUND` và `NO_STRUCTURED_DATA` 3, `MISSING_FIELDS` 7, `NOT_IT` 30.

## Indexes

| Keys | Thuộc tính | Mục đích |
|---|---|---|
| `{ sourceKey: 1, externalId: 1 }` | unique | Một bản ghi cho mỗi tin |
| `{ reason: 1, failedAt: -1 }` | — | Danh sách admin theo nhóm lỗi |
