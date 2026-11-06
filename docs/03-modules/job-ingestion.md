# Module Job Ingestion và vòng đời tin ngoài

## Overview

Đồng bộ tin tuyển dụng từ nguồn bên ngoài vào collection [external-jobs](../04-database/collections/external-jobs.md) và quản lý vòng đời của chúng (`ACTIVE`, `STALE`, `CLOSED`). Việc **tìm kiếm** các tin này cùng tin nội bộ thuộc [job-search](job-search.md). Sơ đồ trình tự: [job-ingestion sequence](../06-workflows/sequences/job-ingestion.md). Sơ đồ trạng thái: [external-job-lifecycle](../06-workflows/state-machines/external-job-lifecycle.md).

Bài toán: không thể bê nguyên một trang việc làm khác. Cần lấy dữ liệu đều đặn mà không làm quá tải nguồn, loại tin không phải IT, tránh đóng nhầm hàng loạt tin khi nguồn lỗi tạm thời, và tôn trọng quyền hiển thị nội dung của từng nguồn.

## Responsibilities

- Chạy theo lịch và theo yêu cầu quản trị viên, mỗi lần một nguồn.
- Lấy danh sách tin và chi tiết qua **adapter** theo từng nhà cung cấp.
- Lọc, chuẩn hóa, so sánh nội dung bằng hash, ghi vào `external_jobs`.
- Áp dụng quy tắc vòng đời: tin vắng mặt thành `STALE` rồi `CLOSED`.
- Ghi nhật ký mỗi lần chạy (`crawl_runs`) và cập nhật trạng thái nguồn (`job_sources`).

## Architecture

| Thành phần | File | Vai trò |
|---|---|---|
| Lập lịch và API | [job-ingestion.service.ts](../../src/job-ingestion/job-ingestion.service.ts) | Cron 6 giờ, `requestSync`, `updateSource`, `findRuns` |
| Điều phối một lần đồng bộ | [source-sync-coordinator.ts](../../src/job-ingestion/source-sync-coordinator.ts) | Chạy chuỗi: lấy, lọc, ghi, vòng đời, nhật ký |
| Quy tắc vòng đời | [job-lifecycle.service.ts](../../src/job-ingestion/job-lifecycle.service.ts) | Hàm thuần, có test riêng |
| Lọc và chuẩn hóa | [ingestion-filters.ts](../../src/job-ingestion/ingestion-filters.ts) | IT hay không, VN hay từ xa, chuẩn hóa, hash nội dung |
| Truy cập dữ liệu | [external-job.repository.ts](../../src/job-ingestion/external-job.repository.ts) | Upsert theo lô, đánh dấu, đóng tin |
| Adapter | [adapters/](../../src/job-ingestion/adapters/) | Một adapter mỗi nhà cung cấp |
| Hàng đợi | [job-ingestion-queue.processor.ts](../../src/queues/processors/job-ingestion-queue.processor.ts) | Processor gọi `syncSource` |
| API quản trị | [job-sources.controller.ts](../../src/job-ingestion/job-sources.controller.ts) | [job-sources API](../05-api/endpoints/job-sources.md) |

## Dependencies

`job-ingestion` import `skills` (bản đồ bí danh để chuẩn hóa kỹ năng). `queues` import `job-ingestion` để processor gọi `syncSource`. `job-search` đọc dữ liệu của module này qua schema chung.

## Nhà cung cấp và adapter

Bốn giá trị `EJobSourceProvider` có adapter ([source-sync-coordinator.ts](../../src/job-ingestion/source-sync-coordinator.ts)):

| Provider | Cách lấy dữ liệu | Nguồn trong code |
|---|---|---|
| `GREENHOUSE` | API JSON của bảng tuyển dụng, một lần lấy cả nội dung (`?content=true`) | `boards-api.greenhouse.io/v1/boards/<token>/jobs` |
| `LEVER` | API JSON của bảng tuyển dụng | `api.lever.co/v0/postings/<token>` |
| `TOPDEV` | Đọc sitemap, rồi tải trang chi tiết từng tin và đọc dữ liệu `JobPosting` (schema.org, JSON-LD) | `topdev.vn` (sitemap chỉ mục `sitemap-jobs.xml`) |
| `ITVIEC` | Như `TOPDEV` | `itviec.com` |

Hai adapter sitemap dùng chung lớp [sitemap-job-posting.adapter.ts](../../src/job-ingestion/adapters/sitemap-job-posting.adapter.ts). Một số khác biệt ghi trong code: TopDev liệt kê mọi ngành nên slug được lọc IT **trước** khi tải chi tiết; ITviec chỉ có tin IT, và hậu tố số của slug lặp lại giữa các công ty nên **toàn bộ slug** là mã tin; lương của ITviec nằm sau đăng nhập nên `salaryText` chỉ là dòng gợi ý.

### Biện pháp lịch sự và an toàn khi lấy dữ liệu

| Biện pháp | Giá trị | Nơi |
|---|---|---|
| User-Agent | `DevLinkBot/1.0` | sitemap adapter |
| Chờ giữa các request | 500 ms (sitemap), 1 giây (trang chi tiết) | sitemap adapter |
| Số trang chi tiết tối đa mỗi lần đồng bộ | 150 | `MAX_DETAIL_FETCHES_PER_SYNC` |
| Dừng khi bị chặn | HTTP `403`, `429`, hoặc trang có `captcha`/`cf-challenge`: kết thúc sớm, trạng thái `PARTIAL` | sitemap adapter |
| Timeout | 15 giây mỗi request | `FETCH_TIMEOUT_MS` |
| Chuyển hướng | Thủ công, tối đa 3 lần | `MAX_REDIRECTS` |
| Giới hạn dung lượng | Chi tiết 2 MB, sitemap 10 MB, bảng ATS 25 MB | [job-ingestion.constants.ts](../../src/job-ingestion/job-ingestion.constants.ts) |
| Chống SSRF | Chỉ `https:` và tên miền nằm trong danh sách cho phép; vi phạm ném `UnsafeUrlError` | [ats-http.ts](../../src/job-ingestion/adapters/ats-http.ts) |

**Chưa xác minh:** code không đọc `robots.txt` (đã `grep`), và chưa đối chiếu điều khoản sử dụng của TopDev, ITviec. Việc thu thập dữ liệu từ trang bên thứ ba có thể ràng buộc về pháp lý; đây là việc cần chủ dự án xác nhận, không phải kết luận của tài liệu.

## Chuỗi xử lý một lần đồng bộ

Do `SourceSyncCoordinator.sync`:

1. Bỏ qua nếu nguồn không tồn tại hoặc `enabled = false`. Tạo bản ghi `crawl_runs` trạng thái `RUNNING`.
2. Nếu nguồn `LINK_ONLY`, xóa mô tả đã lưu (`clearDescriptions`).
3. Nạp trạng thái đã biết của các tin thuộc nguồn (`loadKnownStates`).
4. Adapter lấy danh sách tin. Hàm `selectForFetch` dùng `planFetch` quyết định **tin nào cần tải chi tiết** theo thứ tự ưu tiên: mới, xuất hiện lại, `STALE`, rồi tin cần làm mới sau 7 ngày. Tin đang chờ thử lại (danh sách `rejections`) bị bỏ qua.
5. Tính mức nền (`lastSuccessfulListedCount`, hoặc số tin hiển thị hiện có) và kiểm tra danh sách có **đáng ngờ** không (`isSuspectListing`).
6. Lọc từng tin tải về: thiếu `externalId`, `title` hoặc `sourceUrl` https thì loại với lý do `MISSING_FIELDS`; tiêu đề không phải IT hoặc không ở Việt Nam và không làm từ xa phù hợp thì loại với lý do `NOT_IT`; còn lại được chuẩn hóa.
7. Ghi theo lô (`upsertFetched`): tạo mới, cập nhật, không đổi (so `contentHash`), kích hoạt lại tin `CLOSED`. Mỗi tin ghi xong được xóa `staleSince`, `closedAt`, `closeReason`.
8. `computeTransitions` tính tin nào chỉ cần đánh dấu đã thấy, tin nào thành `STALE`, tin nào bị đóng. Áp dụng, rồi đóng thêm tin có `expiresAt` đã qua (`closeExpired`).
9. Kết thúc bản ghi `crawl_runs`, cập nhật `job_sources` (trạng thái, số liệu, danh sách loại, số lần lỗi liên tiếp).

### Quy tắc lọc

| Quy tắc | Chi tiết |
|---|---|
| IT | Khớp một trong các mẫu từ khóa tiêu đề (engineer, developer, devops, data, qa, security, ...), vai trò gần IT (business analyst, product owner, scrum master, ...), từ viết tắt `IT` viết hoa, hoặc từ khóa tiếng Việt (lập trình, phần mềm, ...). Loại các kỹ sư không phải phần mềm (sales, mechanical, civil, ... + engineer) |
| Việt Nam hoặc từ xa | `country = VN`, hoặc địa điểm khớp mẫu Việt Nam, hoặc tin từ xa với địa điểm "chỉ remote" hoặc vùng phù hợp |
| Nội dung | HTML được làm sạch bằng `sanitize-html` |
| Kỹ năng | Lấy từ danh mục của nguồn nếu có, nếu không trích từ tiêu đề và mô tả bằng bản đồ bí danh |
| Cấp bậc | Suy từ tiêu đề, nếu không thì từ số tháng kinh nghiệm |

Danh sách mẫu đầy đủ nằm trong [ingestion-filters.ts](../../src/job-ingestion/ingestion-filters.ts). Code ghi chú hai `shortcut` đã biết: tên vai trò như "Business Analyst" có thể không thuộc IT ở một số bảng tuyển dụng, và mẫu loại kỹ sư không phải phần mềm chỉ bắt khi từ định tính đứng sát chữ `engineer`.

## Chống đóng nhầm hàng loạt

Rủi ro lớn nhất của việc đồng bộ là nguồn trả danh sách thiếu (lỗi tạm thời, bị chặn), khiến mọi tin "vắng mặt" bị đóng. Thiết kế phòng ngừa:

- **Phát hiện danh sách co bất thường:** nếu danh sách rỗng khi mức nền > 0, hoặc mức nền ≥ 20 và danh sách dưới 50% mức nền, lần chạy là `SUSPECT`. Khi đó `listingComplete = false` và `computeTransitions` **không** đánh dấu `STALE` hay đóng tin vì vắng mặt.
- **Mức nền không bị kéo xuống:** `lastSuccessfulListedCount` chỉ cập nhật khi lần chạy không `FAILED` hay `SUSPECT`.
- **Thời gian ân hạn:** tin vắng mặt trước hết thành `STALE` (vẫn hiển thị công khai) và chỉ bị đóng sau 5 giờ ân hạn, tức khoảng một chu kỳ cron sau.
- **Dừng sớm chỉ ảnh hưởng việc tải chi tiết:** trạng thái `PARTIAL` nghĩa là danh sách đã đầy đủ nhưng chỉ tải được một phần chi tiết. Vòng đời vẫn áp dụng bình thường vì `listingComplete` chỉ phụ thuộc `SUSPECT`.

## Idempotency và độ tin cậy

| Cơ chế | Chi tiết |
|---|---|
| Không chạy trùng một nguồn | `jobId = sync-<key>`; BullMQ bỏ qua `add()` nếu `jobId` đã tồn tại ở **mọi** trạng thái (comment trong code). Nhờ đó cron nhiều instance hay bấm tay nhiều lần không sinh thêm việc |
| Ghi lặp an toàn | `upsert` theo `{ sourceKey, externalId }` (unique), nên chạy lại không nhân bản |
| Retry | 3 lần, backoff mũ bắt đầu 5 giây; `removeOnComplete` và `removeOnFail` đều `true` (bản ghi việc bị xóa sau khi xong hoặc hết lần thử, nên không còn việc lỗi để xem lại trong Redis) |
| Mỗi lần thử một nhật ký | Mỗi lần processor chạy tạo một `crawl_runs` mới, nên một lỗi có thể để lại tới 3 bản ghi `FAILED` |
| Không có adapter | Ném `UnrecoverableError`, BullMQ không retry |
| Xử lý tuần tự | Processor không đặt `concurrency`, mặc định 1: các nguồn đồng bộ lần lượt, không song song |

## Thay đổi chính sách hiển thị

`PATCH /job-sources/:key` với `displayPolicy` có tác dụng phụ trên dữ liệu ([job-ingestion.service.ts](../../src/job-ingestion/job-ingestion.service.ts)):

| Chuyển sang | Tác dụng |
|---|---|
| `LINK_ONLY` | **Xóa mô tả đã lưu** của mọi tin thuộc nguồn (`clearDescriptions`). Không hoàn tác được trừ khi chuyển lại `FULL` và tải lại |
| `FULL` | Đặt lại thời điểm tải (`resetFetchedAt`) để lần đồng bộ sau tải lại mô tả |
| `HIDDEN` | Không đổi dữ liệu, chỉ ẩn khỏi tìm kiếm |

## Business Rules

Bảng hằng số và ý nghĩa: [external-jobs](../04-database/collections/external-jobs.md#vòng-đời), [job-sources](../04-database/collections/job-sources.md). Chu kỳ: cron `0 */6 * * *` (`Asia/Ho_Chi_Minh`), chỉ nguồn `enabled`.

## Data Model

[job-sources](../04-database/collections/job-sources.md), [external-jobs](../04-database/collections/external-jobs.md), [crawl-runs](../04-database/collections/crawl-runs.md) (TTL 90 ngày).

## Error Handling

| Tình huống | Xử lý |
|---|---|
| Lỗi toàn bộ lần chạy | Ghi `FAILED` vào `crawl_runs`, tăng `consecutiveFailures`, ném lại để BullMQ retry |
| Bị chặn 403/429/captcha | `PARTIAL`: dừng tải chi tiết, vòng đời vẫn áp dụng với danh sách đầy đủ |
| Danh sách co | `SUSPECT`, không đóng tin vì vắng mặt |
| Lỗi mạng khi tải một trang chi tiết | Bỏ qua tin đó, thử lại ở lần sau |
| `SUSPECT` hoặc từ 3 lần lỗi liên tiếp (`ALERT_AFTER_FAILURES`) | Ghi log mức lỗi `[ingestion-alert]` |

## Known Limitation

- **Cảnh báo chỉ là dòng log.** Code ghi chú `shortcut: alerting is a log line only`. Không có thông báo qua email hay Slack khi nguồn lỗi liên tục.
- **Việc lỗi không còn trong Redis** vì `removeOnFail: true`; chẩn đoán dựa vào `crawl_runs` và `lastSyncError`.
- Tính hợp pháp và tuân thủ điều khoản khi thu thập TopDev, ITviec: `Chưa xác minh`.
- Cron không có khóa phân tán; với nhiều instance, việc đồng bộ vẫn được loại trùng nhờ `jobId`, nhưng `jobId` chỉ loại trùng khi việc cũ còn trong hàng đợi hoặc đang chạy (việc hoàn tất bị xóa nên lần cron sau từ instance khác vẫn được thêm).
- Bộ lọc IT dựa trên mẫu từ khóa nên có thể sót hoặc thừa tin; mức chính xác chưa được đo.

## Testing

Có test cho `JobIngestionService`, `JobLifecycleService`, `SourceSyncCoordinator`, `ExternalJobRepository`, bộ lọc, từng adapter (kèm dữ liệu mẫu trong `adapters/__fixtures__/`) và dịch vụ hàng đợi. Chưa ghi nhận độ bao phủ.

## Source References

[src/job-ingestion/](../../src/job-ingestion/), [job-ingestion-queue.service.ts](../../src/queues/services/job-ingestion-queue.service.ts).
