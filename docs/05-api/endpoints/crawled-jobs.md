# API Crawled Jobs

Tiền tố `/api/v1/crawled-jobs`. Controller: [crawled-jobs.controller.ts](../../../src/job-ingestion/crawled-jobs.controller.ts). Collection: [external-jobs](../../04-database/collections/external-jobs.md).

Toàn bộ route chỉ cho `SUPER ADMIN` (`@Roles` ở cấp class); vai trò khác nhận `403`.

| Route | Mô tả |
|---|---|
| `GET /api/v1/crawled-jobs` | Liệt kê tin đã crawl, mới nhất trước, không kèm `descriptionHtml` và `contentHash` |
| `POST /api/v1/crawled-jobs/remove` | Gỡ tin; lần đồng bộ sau không đưa tin trở lại |
| `POST /api/v1/crawled-jobs/restore` | Hoàn tác việc gỡ; trạng thái crawl quyết định tin có công khai không |

## `GET /api/v1/crawled-jobs`

- **Query:** `page`, `limit` (tối đa 100), `sourceKey`, `state` (`ACTIVE`, `STALE`, `CLOSED`, `REMOVED`), `keyword` (khớp `title` và `companyName`, tối đa 100 ký tự, khớp nguyên văn), `from`, `to` (IsDateString, bao gồm hai đầu, lọc theo `createdAt`).
- Mỗi tin thuộc đúng một `state`: tin đã gỡ luôn là `REMOVED`, bất kể `status` crawl.
- **Thành công:** 200, `message` = "Lấy danh sách tin đã crawl thành công".

## `POST /api/v1/crawled-jobs/remove`

- **Body:** `{ ids: string[1..100], reason: string(1..500) }`. Thiếu `reason` hoặc `ids` sai trả `400`.
- Chỉ gỡ tin chưa gỡ, nên lý do của lần gỡ đầu được giữ. Ghi `removedAt`, `removedBy { _id, email }`, `removeReason`.
- **Thành công:** 200, `data = { modified }`, `message` = "Gỡ tin thành công".

## `POST /api/v1/crawled-jobs/restore`

- **Body:** `{ ids: string[1..100] }`. Xoá ba field gỡ tin; không đổi `status` crawl.
- **Thành công:** 200, `data = { modified }`, `message` = "Khôi phục tin thành công".
