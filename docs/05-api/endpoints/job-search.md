# API Job Search

Tiền tố `/api/v1/job-search`. Controller: [job-search.controller.ts](../../../src/job-search/job-search.controller.ts). Tài liệu sâu: `03-modules/job-search.md` (Phase 3).

Công khai (`@Public` ở cấp class), có `ThrottlerGuard` (throttler `burst` 5/giây, `sustained` 20/10 giây, `default` 60/phút) và **không cache**. Tìm kiếm hợp nhất trong cả tin nội bộ ([jobs](../../04-database/collections/jobs.md)) và tin ngoài ([external-jobs](../../04-database/collections/external-jobs.md)).

## Danh sách route

| Route | Auth | Mô tả |
|---|---|---|
| `GET /api/v1/job-search` | Công khai | Tìm kiếm hợp nhất tin nội bộ và tin ngoài, có phân trang, lọc theo địa điểm, cấp bậc, hình thức, lương, nguồn |
| `GET /api/v1/job-search/external/:id` | Công khai | Chi tiết một tin ngoài, tôn trọng chính sách hiển thị của nguồn |

## Tham số tìm kiếm

| Tham số | Giá trị | Ghi chú |
|---|---|---|
| `source` | `all` (mặc định), `internal`, `external` | Chọn nguồn |
| `sort` | `newest`, `oldest`, `salary_desc`, `salary_asc` | Sắp xếp |
| `page`, `limit` | `page` từ 1; `limit` mặc định 10, **tối đa 50** | [job-search.constants.ts](../../../src/job-search/job-search.constants.ts) |
| `keyword` | Tối đa 100 ký tự | |
| `salaryMin`, `salaryMax` | Số nguyên ≥ 0 | Quy tắc riêng của lương xem tài liệu module |

## Phản hồi danh sách

`data` có dạng `{ result, meta: { pagination } }` ([api-overview](../api-overview.md#phân-trang)). Mỗi phần tử `IJobSearchItem` ([job-search-item.interface.ts](../../../src/job-search/interfaces/job-search-item.interface.ts)):

| Field | Ý nghĩa |
|---|---|
| `id` | ID tin |
| `sourceType` | `INTERNAL` hoặc `EXTERNAL` |
| `sourceKey` | Khóa nguồn (tin ngoài) |
| `title`, `companyName`, `companyLogo` | Thông tin cơ bản |
| `location`, `locationCode`, `isRemote` | Địa điểm |
| `salary` hoặc `salaryText` | Lương dạng số (nội bộ) hoặc văn bản (ngoài) |
| `level`, `formOfWork`, `skills` | Thuộc tính |
| `postedAt`, `endDate` | Thời gian |
| `applyMode` | `INTERNAL` (nộp trong DevLink) hoặc `EXTERNAL_REDIRECT` (chuyển sang nguồn) |
| `applyUrl` | Liên kết nộp ngoài |

## Chi tiết tin ngoài

`GET /job-search/external/:id` trả `IExternalJobDetail`. Quy tắc hiển thị theo `displayPolicy` của nguồn ([job-search.service.ts](../../../src/job-search/job-search.service.ts)):

| Trường hợp | Kết quả |
|---|---|
| Nguồn `HIDDEN` | `404` như thể không tồn tại |
| Nguồn `LINK_ONLY` | `descriptionHtml` là chuỗi rỗng |
| Nguồn `FULL` | `descriptionHtml` đầy đủ |
| Tin `STALE` | Trả `status: "ACTIVE"` (`STALE` là trạng thái nội bộ) |
| Tin `CLOSED` hoặc `expiresAt` đã qua | `status: "CLOSED"` |

`applyUrl` rơi về `sourceUrl` nếu không có.

## Chi tiết từng route

### `GET /api/v1/job-search`

Tìm kiếm hợp nhất tin nội bộ và tin ngoài, có phân trang, lọc theo địa điểm, cấp bậc, hình thức, lương, nguồn

- **Auth:** Công khai
- **Handler:** `search` trong [job-search.controller.ts](../../../src/job-search/job-search.controller.ts)
- **Mã thành công:** 200, `message` = "Search jobs"

**Query**

| Tên | Bắt buộc | Mô tả | Ví dụ |
|---|---|---|---|
| *(toàn bộ query string)* | — | DTO `SearchJobsQueryDto` | |

**Query: `SearchJobsQueryDto`** ([search-jobs-query.dto.ts](../../../src/job-search/dto/search-jobs-query.dto.ts))

| Field | Kiểu | Bắt buộc | Validation | Ví dụ |
|---|---|---|---|---|
| `keyword` | string | Không | IsString, MaxLength(JOB_SEARCH_MAX_KEYWORD_LENGTH) | 'backend' |
| `locationCode` | string | Không | IsString, MaxLength(100) | 'ho-chi-minh' |
| `level` | EJobLevel | Không | IsEnum(EJobLevel) | — |
| `formOfWork` | EJobFormOfWork | Không | IsEnum(EJobFormOfWork) | — |
| `salaryMin` | number | Không | IsInt, Min(0) | 10000000 |
| `salaryMax` | number | Không | IsInt, Min(0) | 50000000 |
| `source` | JobSearchSource | Không | IsIn(JOB_SEARCH_SOURCES) | — |
| `sort` | JobSearchSort | Không | IsIn(JOB_SEARCH_SORTS) | — |
| `page` | number | Không | IsInt, Min(1) | — |
| `limit` | number | Không | IsInt, Min(1), Max(JOB_SEARCH_MAX_LIMIT) | — |

### `GET /api/v1/job-search/external/:id`

Chi tiết một tin ngoài, tôn trọng chính sách hiển thị của nguồn

- **Auth:** Công khai
- **Handler:** `findExternalJob` trong [job-search.controller.ts](../../../src/job-search/job-search.controller.ts)
- **Mã thành công:** 200, `message` = "Get external job by id"

**Path params**

| Tên | Kiểu | Mô tả |
|---|---|---|
| `id` | string |  |
