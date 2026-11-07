# Module Queues (BullMQ)

## Overview

Xử lý nền bằng **BullMQ**, một thư viện hàng đợi dùng Redis. Một *hàng đợi* giữ các *việc* (job) chờ xử lý; một *processor* (worker) lấy việc ra chạy; việc lỗi có thể được thử lại. Cả producer (nơi đưa việc vào) lẫn processor đều chạy **trong cùng tiến trình NestJS** với API ([queues.module.ts](../../src/queues/queues.module.ts)).

Lý do dùng hàng đợi và ranh giới đồng bộ hay bất đồng bộ: [asynchronous-processing](../02-architecture/asynchronous-processing.md). Phần này mô tả từng hàng đợi và độ tin cậy.

## Bảy hàng đợi

Tên lấy từ [queues.constants.ts](../../src/queues/queues.constants.ts).

| Hàng đợi | Processor | Ai đưa việc vào | Việc | Song song |
|---|---|---|---|---|
| `resume-processing` | [resume-queue.processor.ts](../../src/queues/processors/resume-queue.processor.ts) | `resumes` | `parse-resume`, `analyze-resume` | 1, giới hạn 15 việc mỗi 60 giây |
| `job-ingestion` | [job-ingestion-queue.processor.ts](../../src/queues/processors/job-ingestion-queue.processor.ts) | `job-ingestion` (cron và API) | `sync-source` | 1 (mặc định) |
| `job-recommendation` | [job-recommendation-queue.processor.ts](../../src/queues/processors/job-recommendation-queue.processor.ts) | `mail` (cron và API) | `send-job-recommendations` | 5 |
| `company-follower-notification` | [company-follower-queue.processor.ts](../../src/queues/processors/company-follower-queue.processor.ts) | `jobs` khi tạo tin | `send-new-job-notification` | 1 (mặc định) |
| `application-notification` | [application-notification-queue.processor.ts](../../src/queues/processors/application-notification-queue.processor.ts) | `resumes` | `send-status-update-email`, `send-new-application-email` | 1 (mặc định) |
| `job-expiration-notification` | [job-expiration-queue.processor.ts](../../src/queues/processors/job-expiration-queue.processor.ts) | `jobs` (cron hết hạn) | `send-job-expired-notification` | 1 (mặc định) |
| `account-deletion` | [account-deletion-queue.processor.ts](../../src/queues/processors/account-deletion-queue.processor.ts) | `auth` | `delete-account` (trễ 30 ngày) | 1 (mặc định) |

"1 (mặc định)" nghĩa là processor không khai báo `concurrency`, BullMQ chạy một việc mỗi lần cho mỗi hàng đợi.

## Tùy chọn mặc định và theo từng hàng đợi

Mặc định toàn cục ([redis.module.ts](../../src/redis/redis.module.ts)): 3 lần thử, backoff mũ bắt đầu 2 giây, giữ 100 việc hoàn thành tối đa 1 giờ, giữ 500 việc lỗi tối đa 24 giờ. Tùy chọn khai báo **trên từng việc** ghi đè mặc định này:

| Hàng đợi / việc | Lần thử | Backoff (mũ) | Giữ việc hoàn thành | Giữ việc lỗi | `jobId` (loại trùng) |
|---|---|---|---|---|---|
| `parse-resume` | 3 | 2 giây | mặc định | mặc định | Không, độ ưu tiên 1 |
| `analyze-resume` | 3 | 2 giây | mặc định | mặc định | Không, độ ưu tiên 2 |
| `job-ingestion` | 3 | 5 giây | Xóa ngay | **Xóa ngay** | `sync-<sourceKey>` |
| `send-job-recommendations` | 3 | 5 giây | 24 giờ, tối đa 1000 | 7 ngày | Không |
| `send-new-job-notification` | 3 | 5 giây | Xóa ngay | **Giữ vô thời hạn** | Không |
| `application-notification` (2 loại việc) | 3 | 5 giây | Xóa ngay | **Giữ vô thời hạn** | Không |
| `send-job-expired-notification` | 3 | 5 giây | Xóa ngay | **Giữ vô thời hạn** | Không |
| `delete-account` | 3 | 10 giây | Xóa ngay | **Giữ vô thời hạn** | `delete-account-<userId>` |

Độ ưu tiên trong BullMQ: số **nhỏ hơn** được xử lý trước, nên `parse-resume` (1) chạy trước `analyze-resume` (2).

## Idempotency: chống xử lý trùng

*Idempotent* nghĩa là xử lý nhiều lần cho cùng kết quả như một lần. Hiện trạng theo từng hàng đợi:

| Hàng đợi | Cơ chế | Đánh giá |
|---|---|---|
| `job-ingestion` | `jobId = sync-<key>` loại trùng khi việc còn trong hàng đợi hoặc đang chạy; ghi `upsert` theo khóa tự nhiên | Tốt: chạy lại an toàn |
| `account-deletion` | `jobId = delete-account-<userId>` (cũng dùng để hủy); processor kiểm tra lại trạng thái trước khi xóa | Tốt |
| `resume-processing` | Không có `jobId`; kết quả ghi đè bằng `findByIdAndUpdate` | Ghi đè an toàn nhưng tốn tài nguyên khi chạy trùng |
| `job-recommendation` | Không có `jobId`; không có kiểm tra "đã gửi tuần này" trong processor đã đọc | Có thể gửi trùng nếu bị kích hoạt hai lần |
| Các hàng đợi email còn lại | Không có `jobId` | Có thể gửi trùng nếu retry sau khi đã gửi thành công một phần |

## Retry, lỗi và việc lỗi

- Việc ném lỗi sẽ được thử lại tối đa 3 lần theo backoff mũ. Hết lần thử, việc chuyển sang trạng thái lỗi (`failed`).
- `UnrecoverableError` (ví dụ không có adapter cho nguồn tin) khiến BullMQ **không** thử lại.
- Việc lỗi được giữ theo bảng trên. Với `removeOnFail: false` việc lỗi nằm lại Redis vô thời hạn, hữu ích để gỡ lỗi nhưng tăng dung lượng nếu lỗi nhiều.
- Có hai loại xử lý lỗi đặc biệt:
  - **Hết quota Gemini** ở `parse-resume`: không ném lỗi mà lên lịch lại việc với độ trễ, việc hiện tại kết thúc thành công ([cv-parsing-and-matching](cv-parsing-and-matching.md#giữ-quota-gemini)).
  - **Lỗi gửi email riêng lẻ** ở `send-new-job-notification` và khi gửi email xóa tài khoản: bị bắt và chỉ ghi log, **không retry** (comment trong code: "Non-fatal").

## Cron

Bốn cron của ứng dụng, tất cả chạy trong tiến trình chính ([data-flow](../02-architecture/data-flow.md#cron)), không có khóa phân tán:

| Cron | Lịch | Việc |
|---|---|---|
| `sync-external-job-sources` | `0 */6 * * *` | Đưa việc `sync-source` cho mỗi nguồn đang bật |
| `weekly-job-recommendations` | `0 9 * * 1` | Duyệt `subscribers`, đưa `send-job-recommendations` theo lô 100 |
| `deactivate-expired-jobs` | `0 * * * *` | Tắt tin hết hạn, đưa `send-job-expired-notification` |
| `cleanup-orphaned-company-logos` | `0 2 * * *` | Xóa logo mồ côi (không dùng hàng đợi) |

Múi giờ của cả bốn là `Asia/Ho_Chi_Minh`.

## Chi tiết các hàng đợi chưa mô tả ở nơi khác

### `job-recommendation`

Mỗi việc xử lý **một** người đăng ký ([job-recommendation-queue.processor.ts](../../src/queues/processors/job-recommendation-queue.processor.ts)):

1. Đọc `email`, `name`, `skills`, `location`, `locationCode`; bỏ qua nếu không có người đăng ký hoặc không có email.
2. Truy vấn tin `isActive`, chưa xóa mềm, `endDate` chưa qua, có **giao** kỹ năng với đăng ký (`skills: { $in: ... }`), và địa điểm nếu có.
3. Lấy tối đa **5 tin** và gửi một email.

Truy vấn này **không lọc `approvalStatus`** (đã `grep` cả file processor, không có `approvalStatus` hay `APPROVED`), nên email gợi ý có thể chứa tin `PENDING` hoặc `REJECTED`, trái với quy tắc hiển thị công khai ([job-approval](../06-workflows/state-machines/job-approval.md#điều-kiện-hiển-thị-công-khai)).

### `account-deletion`

Việc `delete-account` được lên lịch trễ 30 ngày khi người dùng yêu cầu xóa; hủy yêu cầu thì xóa việc theo `jobId` ([auth-account-deletion.service.ts](../../src/auth/services/auth-account-deletion.service.ts)). Khi chạy, processor (đã kiểm tra lại rằng việc xóa vẫn còn lịch, để tránh đua với việc hủy) thực hiện theo thứ tự:

| Bước | Hành động | Loại |
|---|---|---|
| 1 | Xóa mọi phiên của người dùng; xóa token hủy xóa và cache chat | Xóa thật |
| 2 | Đặt `email` của mọi `resumes` thành `deleted_<userId>@deleted.invalid` | Ẩn danh một phần |
| 3 | Xóa CV trực tuyến (`cvprofiles`) | Xóa thật |
| 4 | Xóa mọi `chat_sessions` và `chat_messages` | Xóa thật |
| 5 | Xóa mềm các `subscribers` theo email | Xóa mềm |
| 6 | Ẩn danh `users`: `name = "Deleted User"`, `email` ẩn danh, `isActive = false`, bỏ `password`, `googleId`, `avatar`, `company`, `savedJobs`, `companyFollowed` và các field khóa | Ẩn danh |
| 7 | Xóa mềm `users` | Xóa mềm |
| 8 | Gửi email xác nhận tới địa chỉ cũ; lỗi gửi chỉ được log | |

## Known Limitation

- **Phân tích hồ sơ có thể chạy hai lần.** Khi nộp bằng file, `handleUploadAndQueue` đưa cả `parse-resume` và `analyze-resume`; khi parse xong, processor đưa thêm một `analyze-resume`. Không có `jobId` để loại trùng. Kết quả ghi đè nên đúng, nhưng tốn một lượt tính. Mặt tích cực: nếu việc `analyze` đầu chạy khi chưa parse xong (ví dụ parse bị hoãn do quota) và thất bại, lượt do parse đưa vào là đường phục hồi.
- **Xóa tài khoản không triệt để dữ liệu cá nhân.** Chỉ `email` của `resumes` được ẩn danh. `parsedData` (họ tên, điện thoại, email, kinh nghiệm), `cvStructuredData` (bản sao toàn bộ CV), `url` (đường dẫn file CV), `createdBy.email` và `histories.updatedBy.email` vẫn còn. File CV, ảnh đại diện trên đĩa không bị xóa (không có bước xóa file). `notifications`, `chat_tool_actions`, `ai_usage_logs` của người dùng không bị xóa. Comment trong code gọi bước 3 và 4 là "GDPR hard-delete", nhưng phạm vi xóa không bao gồm các mục trên. Đã đọc mã; chưa chạy thử. Cần xác nhận với yêu cầu pháp lý áp dụng, tài liệu không đánh giá tuân thủ.
- **Email người dùng được ghi vào log** khi xóa tài khoản: dòng `Starting cascade deletion for user <id> (<email>)` và dòng hoàn tất ([account-deletion-queue.processor.ts](../../src/queues/processors/account-deletion-queue.processor.ts)).
- **Việc lỗi giữ vô thời hạn** ở bốn hàng đợi email và xóa tài khoản (`removeOnFail: false`), trong khi mặc định toàn cục là 24 giờ; không có tác vụ dọn dẹp.
- **Email gợi ý việc làm có thể chứa tin chưa duyệt hoặc bị từ chối**, xem mục `job-recommendation` ở trên. Cùng với email "tin mới" gửi lúc tạo tin ([jobs](jobs.md#known-limitation)), có hai đường để tin chưa duyệt tới người dùng qua email.
- **Email có thể gửi trùng** khi retry (không có khóa chống trùng), và lỗi gửi từng email ở `send-new-job-notification` không được thử lại.
- **Một tiến trình duy nhất**: worker chia sẻ CPU và bộ nhớ với API, và mọi hàng đợi chạy trong cùng tiến trình ([scalability](../02-architecture/scalability.md)).
- **Cron không có khóa**: với nhiều instance, cron chạy nhiều lần; chỉ `job-ingestion` được loại trùng nhờ `jobId`. Với `job-recommendation`, `addBulk` không có `jobId`, nên nhiều instance có thể đưa trùng việc.
- Cache kết quả parse (`parsed_cv:<resumeId>`) dùng `CACHE_MANAGER` nằm trong bộ nhớ, nên không tồn tại sau khi khởi động lại.

## Future Improvement

Đề xuất, chưa có trong code:

- Đặt `jobId` cố định cho `analyze-resume` (ví dụ `analyze-<resumeId>`) để loại trùng.
- Đặt `removeOnFail` có giới hạn cho các hàng đợi email.
- Thêm bước xóa file và ẩn danh đầy đủ `resumes` khi xóa tài khoản.
- Khóa phân tán cho cron khi chạy nhiều instance.

## Testing

Có test cho `ResumeQueueService`, `JobIngestionQueueService` và `AccountDeletionQueueProcessor`. Các processor còn lại (`resume`, `job-recommendation`, `company-follower`, `application-notification`, `job-expiration`, `job-ingestion`) không có test riêng.

## Source References

[src/queues/](../../src/queues/), [redis.module.ts](../../src/redis/redis.module.ts).
