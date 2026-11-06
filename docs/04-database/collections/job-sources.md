# Job Sources (`job_sources`)

Cấu hình từng nguồn tin bên ngoài: dùng nhà cung cấp nào, bảng tin nào, có đang bật đồng bộ không, có hiển thị công khai không, và kết quả lần đồng bộ gần nhất. Quản trị viên quản lý qua [job-sources.controller.ts](../../../src/job-ingestion/job-sources.controller.ts).

- **Nguồn schema:** [job-source.schema.ts](../../../src/job-ingestion/schemas/job-source.schema.ts)
- **Phân loại dữ liệu:** cấu hình hệ thống, không có dữ liệu cá nhân.
- **Soft-delete:** schema không khai báo, plugin thêm `isDeleted` và `deletedAt`.

## Data dictionary

| Field | Type | Required | Default | Ràng buộc | Ý nghĩa |
|---|---|---|---|---|---|
| `key` | String | Có | — | trim; unique | Khóa duy nhất của nguồn, dùng làm `sourceKey` ở `external_jobs` và làm `jobId` của hàng đợi |
| `provider` | String | Có | — | enum: `ITVIEC`, `TOPDEV`, `LEVER`, `GREENHOUSE` | Nhà cung cấp dữ liệu: `ITVIEC`, `TOPDEV`, `LEVER`, `GREENHOUSE` |
| `boardToken` | String | Có | — | `match=/^[a-z0-9-]+$/`; trim | Mã bảng tin tại nhà cung cấp. Chỉ chữ thường, số, gạch ngang |
| `companyName` | String | Có | — | trim | Tên công ty sở hữu nguồn |
| `enabled` | Boolean | Có | `true` | — | Có đồng bộ định kỳ hay không |
| `lastSyncedAt` | Date | Không | — | — | Lần đồng bộ gần nhất |
| `lastSyncStatus` | String | Không | — | enum: `FAILED`, `SUSPECT`, `PARTIAL`, `SUCCESS`, `RUNNING` | Kết quả lần đồng bộ gần nhất |
| `lastSyncError` | String | Không | — | — | Thông báo lỗi của lần đồng bộ gần nhất |
| `displayPolicy` | String | Không | `"LINK_ONLY"` | enum: `FULL`, `LINK_ONLY`, `HIDDEN` | Chính sách hiển thị công khai. Mặc định `LINK_ONLY` |
| `lastSyncStats` | Mixed | Không | — | — | Số liệu lần đồng bộ gần nhất, theo `ICrawlRunStats` |
| `lastSuccessfulListedCount` | Number | Không | — | — | Số tin liệt kê ở lần thành công gần nhất, dùng làm mức nền phát hiện danh sách co bất thường |
| `consecutiveFailures` | Number | Không | `0` | — | Số lần lỗi liên tiếp |
| `rejections` | [Subdoc] | Không | `[]` | — | Danh sách tin bị loại và thời điểm được thử lại |
| `rejections.externalId` | String | Có | — | — | Mã tin tại nguồn bị loại |
| `rejections.reason` | String | Có | — | enum: `NOT_IT`, `MISSING_FIELDS`, `NO_STRUCTURED_DATA`, `NOT_FOUND` | Lý do loại |
| `rejections.retryAt` | Date | Có | — | — | Thời điểm được phép tải lại |
| `createdAt` | Date | Không | — | immutable | Thời điểm tạo, do `timestamps` hoặc plugin |
| `updatedAt` | Date | Không | — | — | Thời điểm sửa gần nhất, do `timestamps` |
| `isDeleted` | Boolean | Có | `false` | thêm bởi plugin xóa mềm | Cờ xóa mềm. `true` nghĩa là bản ghi đã bị xóa khỏi nghiệp vụ nhưng vẫn còn trong database |
| `deletedAt` | Date | Không | `null` | thêm bởi plugin xóa mềm | Thời điểm xóa mềm |

`lastSyncStats` là `type: Object` tự do, cấu trúc thực tế theo `ICrawlRunStats`:

| Field | Ý nghĩa |
|---|---|
| `listed` | Số tin có trong danh sách nguồn |
| `planned` | Số tin dự định tải chi tiết |
| `fetched` | Số tin đã tải |
| `kept` | Số tin giữ lại sau lọc |
| `rejected` | Số tin bị loại |
| `created`, `updated`, `unchanged`, `reactivated` | Kết quả ghi vào [external-jobs](external-jobs.md) |
| `staled`, `closed` | Số tin chuyển `STALE` và `CLOSED` |

`rejections[]` là mảng phần tử `{ externalId, reason, retryAt }` với `_id: false`. Đây là danh sách tin bị loại để **không tải lại** trước thời điểm `retryAt`. Thời gian chờ theo lý do ([job-ingestion.constants.ts](../../../src/job-ingestion/job-ingestion.constants.ts)):

| `reason` | Chờ trước khi thử lại |
|---|---|
| `NOT_FOUND` | 3 ngày |
| `NO_STRUCTURED_DATA` | 3 ngày |
| `MISSING_FIELDS` | 7 ngày |
| `NOT_IT` | 30 ngày |

## Indexes

| Keys | Thuộc tính | Mục đích |
|---|---|---|
| `{ key: 1 }` | unique | Đảm bảo `key` duy nhất và tra cứu nguồn theo key |

`key` có `unique: true` từ khai báo field, nên chỉ có một index duy nhất (trên `key`).

## Chính sách hiển thị (`displayPolicy`)

| Giá trị | Tìm kiếm hợp nhất |
|---|---|
| `FULL` | Trả đầy đủ, gồm mô tả |
| `LINK_ONLY` | Trả tiêu đề, công ty, địa điểm và liên kết nhưng **mô tả để trống** (mặc định cho nguồn cũ chưa có field này) |
| `HIDDEN` | Loại khỏi kết quả |

Nguồn: [job-search.service.ts](../../../src/job-search/job-search.service.ts) và `DEFAULT_DISPLAY_POLICY` trong constants. Với `LINK_ONLY`, mô tả cũng không được lưu ngay từ khi nạp.

## Ví dụ document

```json
{
  "_id": "665f1a2b3c4d5e6f70819c01",
  "key": "greenhouse-example",
  "provider": "GREENHOUSE",
  "boardToken": "example",
  "companyName": "Example Software Co.",
  "enabled": true,
  "displayPolicy": "LINK_ONLY",
  "lastSyncedAt": "2026-10-05T06:00:00.000Z",
  "lastSyncStatus": "SUCCESS",
  "lastSyncStats": { "listed": 40, "planned": 3, "fetched": 3, "kept": 3, "rejected": 0, "created": 1, "updated": 1, "unchanged": 1, "reactivated": 0, "staled": 0, "closed": 0 },
  "lastSuccessfulListedCount": 40,
  "consecutiveFailures": 0,
  "rejections": []
}
```

## Lưu ý

- `consecutiveFailures` và hằng `ALERT_AFTER_FAILURES = 3` cho thấy có ngưỡng cảnh báo sau 3 lần lỗi liên tiếp. Nơi phát cảnh báo: `Chưa xác minh`.
- Cron mỗi 6 giờ chỉ đồng bộ nguồn có `enabled: true` ([job-ingestion.service.ts](../../../src/job-ingestion/job-ingestion.service.ts)).
- `boardToken` chỉ nhận chữ thường, số và dấu gạch ngang (`/^[a-z0-9-]+$/`).
- **Known Limitation:** schema không có `createdBy`/`updatedBy`, nên không biết ai thêm hoặc đổi nguồn.
