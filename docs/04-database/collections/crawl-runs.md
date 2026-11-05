# Crawl Runs (`crawl_runs`)

Nhật ký từng lần đồng bộ một nguồn tin. Dùng để theo dõi kết quả và gỡ lỗi; quản trị viên xem qua API `job-sources` (xem `05-api/endpoints/job-sources.md`, Phase 3).

- **Nguồn schema:** [crawl-run.schema.ts](../../../src/job-ingestion/schemas/crawl-run.schema.ts)
- **Phân loại dữ liệu:** dữ liệu vận hành, không có dữ liệu cá nhân.
- **Soft-delete:** plugin thêm `isDeleted` và `deletedAt`, nhưng bản ghi tự bị xóa thật bởi TTL.
- **Timestamps:** schema khai báo `@Schema({ collection })` không bật `timestamps`; thời gian lấy từ `startedAt` và `finishedAt`.

## Data dictionary

| Field | Type | Required | Default | Ràng buộc | Ý nghĩa |
|---|---|---|---|---|---|
| `sourceKey` | String | Có | — | — | Khóa của nguồn được đồng bộ |
| `startedAt` | Date | Có | — | — | Thời điểm bắt đầu. Cũng là khóa TTL |
| `finishedAt` | Date | Không | — | — | Thời điểm kết thúc |
| `status` | String | Có | — | enum: `FAILED`, `SUSPECT`, `PARTIAL`, `SUCCESS`, `RUNNING` | Trạng thái lần chạy |
| `stoppedReason` | String | Không | — | — | Lý do dừng sớm nếu có |
| `error` | String | Không | — | — | Thông báo lỗi nếu thất bại |
| `stats` | Mixed | Không | — | — | Số liệu lần chạy theo `ICrawlRunStats` |
| `isDeleted` | Boolean | Có | `false` | thêm bởi plugin xóa mềm | Cờ xóa mềm. `true` nghĩa là bản ghi đã bị xóa khỏi nghiệp vụ nhưng vẫn còn trong database |
| `deletedAt` | Date | Không | `null` | thêm bởi plugin xóa mềm | Thời điểm xóa mềm |

`stats` là `type: Object` tự do theo `ICrawlRunStats`, xem [job-sources](job-sources.md#data-dictionary).

## Indexes

| Keys | Thuộc tính | Mục đích |
|---|---|---|
| `{ sourceKey: 1, startedAt: -1 }` | — | Liệt kê lần chạy gần nhất của một nguồn |
| `{ startedAt: 1 }` | TTL 7776000s | TTL xóa bản ghi sau 90 ngày |

TTL index trên `startedAt` xóa bản ghi sau `CRAWL_RUN_TTL_SECONDS` = 90 ngày (`90 * 24 * 60 * 60` giây, [job-ingestion.constants.ts](../../../src/job-ingestion/job-ingestion.constants.ts)).

## Trạng thái (`status`)

| Giá trị | Ý nghĩa theo comment trong [sync-status.enum.ts](../../../src/job-ingestion/enums/sync-status.enum.ts) |
|---|---|
| `RUNNING` | Đang chạy |
| `SUCCESS` | Hoàn tất |
| `PARTIAL` | Việc tải chi tiết dừng sớm (403, 429, captcha) nhưng danh sách nguồn đã đầy đủ |
| `SUSPECT` | Danh sách co lại quá mức để tin cậy, **không tin nào bị đóng vì vắng mặt** |
| `FAILED` | Thất bại |

## Quan hệ

`sourceKey` là chuỗi tham chiếu logic tới `job_sources.key`, không phải ObjectId.

## Ví dụ document

```json
{
  "_id": "665f1a2b3c4d5e6f70819d01",
  "sourceKey": "greenhouse-example",
  "startedAt": "2026-10-05T06:00:00.000Z",
  "finishedAt": "2026-10-05T06:00:42.000Z",
  "status": "SUCCESS",
  "stats": { "listed": 40, "planned": 3, "fetched": 3, "kept": 3, "rejected": 0, "created": 1, "updated": 1, "unchanged": 1, "reactivated": 0, "staled": 0, "closed": 0 }
}
```

## Lưu ý

- Giới hạn khi đọc: `CRAWL_RUNS_DEFAULT_LIMIT = 20`, `CRAWL_RUNS_MAX_LIMIT = 100`.
- **Known Limitation:** nếu tiến trình chết giữa lúc chạy, bản ghi có thể kẹt ở `RUNNING` cho đến khi TTL xóa. Chưa kiểm tra có cơ chế dọn bản ghi kẹt không. Trạng thái: `Chưa xác minh`.
