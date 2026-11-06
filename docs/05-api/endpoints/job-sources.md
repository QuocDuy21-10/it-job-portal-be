# API Job Sources

Tiền tố `/api/v1/job-sources`. Controller: [job-sources.controller.ts](../../../src/job-ingestion/job-sources.controller.ts). Tài liệu sâu: `03-modules/job-ingestion.md` (Phase 3). Collection: [job-sources](../../04-database/collections/job-sources.md), [crawl-runs](../../04-database/collections/crawl-runs.md).

Toàn bộ route chỉ cho `SUPER ADMIN` (`@Roles` ở cấp class).

## Danh sách route

| Route | Auth | Mô tả |
|---|---|---|
| `GET /api/v1/job-sources` | Đăng nhập, vai trò: SUPER ADMIN | Liệt kê các nguồn kèm trạng thái đồng bộ gần nhất |
| `PATCH /api/v1/job-sources/:key` | Đăng nhập, vai trò: SUPER ADMIN | Bật tắt đồng bộ hoặc đổi chính sách hiển thị công khai |
| `GET /api/v1/job-sources/:key/runs` | Đăng nhập, vai trò: SUPER ADMIN | Lịch sử các lần đồng bộ gần nhất của một nguồn, mới nhất trước |
| `POST /api/v1/job-sources/:key/sync` | Đăng nhập, vai trò: SUPER ADMIN | Đưa một lần đồng bộ của nguồn vào hàng đợi |

## Ghi chú

- `PATCH /job-sources/:key` chỉ nhận hai field: `enabled` (bật tắt đồng bộ định kỳ) và `displayPolicy` (`FULL`, `LINK_ONLY`, `HIDDEN`). Không đổi được `key`, `provider`, `boardToken`.
- `POST /job-sources/:key/sync` đưa việc đồng bộ vào hàng đợi `job-ingestion` với `jobId = sync-<key>`, nên bấm nhiều lần khi một lần đang chờ hoặc chạy sẽ không tạo thêm việc. Trả `{ key, queued: true }`; trả `404` nếu `key` không tồn tại.
- `GET /job-sources/:key/runs`: `limit` mặc định 20, tối đa 100, mới nhất trước.
- Không có route tạo hoặc xóa nguồn; nguồn được nạp bằng `npm run seed`.

## Chi tiết từng route

### `GET /api/v1/job-sources`

Liệt kê các nguồn kèm trạng thái đồng bộ gần nhất

- **Auth:** Đăng nhập, vai trò: SUPER ADMIN
- **Handler:** `findAll` trong [job-sources.controller.ts](../../../src/job-ingestion/job-sources.controller.ts)
- **Mã thành công:** 200, `message` = "Get list job sources"

### `PATCH /api/v1/job-sources/:key`

Bật tắt đồng bộ hoặc đổi chính sách hiển thị công khai

- **Auth:** Đăng nhập, vai trò: SUPER ADMIN
- **Handler:** `update` trong [job-sources.controller.ts](../../../src/job-ingestion/job-sources.controller.ts)
- **Mã thành công:** 200, `message` = "Job source updated"

**Path params**

| Tên | Kiểu | Mô tả |
|---|---|---|
| `key` | string |  |

**Body: `UpdateJobSourceDto`** ([update-job-source.dto.ts](../../../src/job-ingestion/dto/update-job-source.dto.ts))

| Field | Kiểu | Bắt buộc | Validation | Ví dụ |
|---|---|---|---|---|
| `enabled` | boolean | Không | IsBoolean | — |
| `displayPolicy` | EJobSourceDisplayPolicy | Không | IsEnum(EJobSourceDisplayPolicy) | — |

### `GET /api/v1/job-sources/:key/runs`

Lịch sử các lần đồng bộ gần nhất của một nguồn, mới nhất trước

- **Auth:** Đăng nhập, vai trò: SUPER ADMIN
- **Handler:** `findRuns` trong [job-sources.controller.ts](../../../src/job-ingestion/job-sources.controller.ts)
- **Mã thành công:** 200, `message` = "Get job source sync runs"

**Path params**

| Tên | Kiểu | Mô tả |
|---|---|---|
| `key` | string |  |

**Query**

| Tên | Bắt buộc | Mô tả | Ví dụ |
|---|---|---|---|
| *(toàn bộ query string)* | — | DTO `ListCrawlRunsQueryDto` | |

**Query: `ListCrawlRunsQueryDto`** ([list-crawl-runs-query.dto.ts](../../../src/job-ingestion/dto/list-crawl-runs-query.dto.ts))

| Field | Kiểu | Bắt buộc | Validation | Ví dụ |
|---|---|---|---|---|
| `limit` | number | Không | IsInt, Min(1), Max(CRAWL_RUNS_MAX_LIMIT) | CRAWL_RUNS_DEFAULT_LIMIT |

### `POST /api/v1/job-sources/:key/sync`

Đưa một lần đồng bộ của nguồn vào hàng đợi

- **Auth:** Đăng nhập, vai trò: SUPER ADMIN
- **Handler:** `sync` trong [job-sources.controller.ts](../../../src/job-ingestion/job-sources.controller.ts)
- **Mã thành công:** HttpStatus.ACCEPTED, `message` = "Job source sync queued"

**Path params**

| Tên | Kiểu | Mô tả |
|---|---|---|
| `key` | string |  |
