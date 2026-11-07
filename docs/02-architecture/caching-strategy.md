# Chiến lược cache và vô hiệu hóa cache

DevLink dùng **bốn lớp lưu trữ tạm khác nhau**, với độ bền và phạm vi chia sẻ khác nhau. Phân biệt chúng là điều quan trọng nhất, vì hai lớp trông giống nhau trong code (`CACHE_MANAGER` và `REDIS_CLIENT`) lại hoạt động rất khác.

## Bốn lớp

| Lớp | Công nghệ | Nằm ở đâu thật sự | Chia sẻ giữa instance | Mất khi khởi động lại |
|---|---|---|---|---|
| 1. Cache danh sách | `ListCacheService` qua `REDIS_CLIENT` | **Redis** | Có | Không |
| 2. `CACHE_MANAGER` | `@nestjs/cache-manager` | **Bộ nhớ tiến trình** (đã kiểm chứng) | Không | Có |
| 3. Redis trực tiếp | `REDIS_CLIENT` (ioredis) | **Redis** | Có | Không |
| 4. Bộ nhớ trong service | `Map` hoặc biến trong class | Bộ nhớ tiến trình | Không | Có |

Về lớp 2: cấu hình `store: redisStore` không có tác dụng với `@nestjs/cache-manager` 3.0.1 (chỉ đọc `stores`). Đã dựng đúng cấu hình khi không có Redis và `set`/`get` vẫn chạy ngay với store `Keyv` trong bộ nhớ. Chi tiết và tác động: [data-flow](data-flow.md#known-limitation-cache_manager-chạy-trong-bộ-nhớ-không-phải-redis).

## Lớp 1: cache danh sách tin và công ty (Redis, có tag)

Nguồn: [list-cache.service.ts](../../src/redis/list-cache.service.ts), hằng số ở [list-cache.constants.ts](../../src/redis/list-cache.constants.ts).

| Danh sách | TTL | Phạm vi cache | Nơi dùng |
|---|---|---|---|
| Tin tuyển dụng (`GET /jobs`) | 60 giây | `public`, `super-admin`, `hr:<companyId>` | [jobs.service.ts](../../src/jobs/jobs.service.ts) |
| Công ty (`GET /companies`) | 3 phút | như trên | [companies.service.ts](../../src/companies/companies.service.ts) |

- **Khóa:** `list-cache:entry:<endpoint>:<sha256 của tham số chuẩn hóa>`. Tham số được `stableStringify` để cùng truy vấn luôn cho cùng khóa dù thứ tự tham số khác.
- **Phạm vi theo vai trò** nằm trong khóa, nên HR không bao giờ nhận kết quả đã cache của công ty khác hay của khách.
- **Thẻ (tag):** mỗi mục gắn các thẻ như `list:jobs:company:<id>`, `list:jobs:scope:<scope>`, `list:jobs:filter:<field>`. Redis giữ hai chỉ mục phụ (thẻ sang khóa, khóa sang thẻ) với TTL dài hơn mục chính 5 phút.
- **Vô hiệu hóa:** `reclaimByTags(tags)` lấy mọi khóa gắn thẻ, xóa mục, chỉ mục ngược và chỉ mục thẻ. Được gọi sau khi dữ liệu liên quan đổi (tạo, sửa, xóa, duyệt tin; sửa công ty). Hiện `jobs.service.ts` và `companies.service.ts` là hai nơi gọi.
- **Fail-open:** lỗi đọc hoặc ghi Redis chỉ ghi cảnh báo; request vẫn gọi nguồn dữ liệu và trả kết quả bình thường.

### Vì sao cần cả TTL và vô hiệu hóa theo thẻ

TTL ngắn giới hạn độ lệch tối đa (60 giây với tin) khi có thay đổi mà đường vô hiệu hóa bỏ sót, ví dụ `jobs` hết hạn bởi cron thì cron chủ động xóa cache liên quan nhưng sửa trực tiếp trong database thì không. Vô hiệu hóa theo thẻ làm thay đổi hiển thị gần như tức thì với thao tác đi qua API.

## Lớp 2: `CACHE_MANAGER` (bộ nhớ tiến trình)

Đơn vị TTL là **mili giây** (đã kiểm chứng: giá trị `3600` hết hạn sau 3,6 giây; `0` nghĩa là không hết hạn).

| Dữ liệu | Khóa | TTL | Nơi |
|---|---|---|---|
| Dashboard quản trị | `dashboard:admin` | 15 phút | [statistics-cache.service.ts](../../src/statistics/statistics-cache.service.ts) |
| Dashboard HR | `dashboard:hr:<companyId>` | 3 phút | như trên |
| Top công ty tuyển dụng | `homepage:top-hiring-companies:<limit>` | 5 phút | như trên |
| Danh mục kỹ năng, bí danh | `skills:catalog`, `skills:alias-map` | 30 phút | [skills.service.ts](../../src/skills/skills.service.ts) |
| Kỹ năng phổ biến | theo `limit` | 60 phút | như trên |
| Ngữ cảnh chat của người dùng | `chat_ctx:<userId>` | 5 phút | [chat-context.service.ts](../../src/chat/chat-context.service.ts) |
| Ngữ cảnh nền tảng của chat | `chat_platform_ctx` | 30 phút | như trên |
| Câu hỏi thường gặp của chat | xem `chat-cache.service.ts` | 24 giờ | [chat.constant.ts](../../src/chat/constants/chat.constant.ts) |
| Ngữ cảnh chat (hằng khác) | | 10 phút (`CHAT_CONTEXT_CACHE_TTL_MS`) | như trên |
| Phiên chat đang dùng | `chat_session:<userId>` | **không hết hạn** (`0`) | [chat.service.ts](../../src/chat/chat.service.ts) |
| Token đặt lại mật khẩu | `reset_password:<token>` | theo `RESET_PASSWORD_TTL_MS` | [auth-credentials.service.ts](../../src/auth/services/auth-credentials.service.ts) |
| Token hủy xóa tài khoản | `cancel_deletion:<token>`, `cancel_deletion_user:<userId>` | 30 ngày | [auth-account-deletion.service.ts](../../src/auth/services/auth-account-deletion.service.ts) |
| Kết quả đọc CV | `parsed_cv:<resumeId>` | `3600` ms, **tức 3,6 giây** | [resume-queue.processor.ts](../../src/queues/processors/resume-queue.processor.ts) |

Hai giá trị `CHAT_CONTEXT_CACHE_TTL_MS` (10 phút, trong `chat.constant.ts`) và `CACHE_TTL_USER_CONTEXT` (5 phút, trong `chat-context.service.ts`) cùng tồn tại; chưa đối chiếu cái nào được dùng ở đâu. Trạng thái: `Chưa xác minh`.

### Vô hiệu hóa lớp 2

| Sự kiện | Hành động | Nơi |
|---|---|---|
| Tin hoặc hồ sơ đổi | `clearScopedDashboardCaches(companyId)` xóa dashboard của công ty và dashboard quản trị | `jobs`, `resumes`, processor |
| CV trực tuyến đổi | Xóa `chat_ctx:<userId>` | [cv-profiles.service.ts](../../src/cv-profiles/cv-profiles.service.ts) |
| Xóa tài khoản | Xóa token hủy xóa, `chat_session:`, `chat_conv:` | [account-deletion-queue.processor.ts](../../src/queues/processors/account-deletion-queue.processor.ts) |
| Dùng token đặt lại mật khẩu | Xóa `reset_password:<token>` | auth-credentials |

### Hệ quả của việc nằm trong bộ nhớ

- Mất khi khởi động lại: token đặt lại mật khẩu và hủy xóa tài khoản không còn dùng được ([auth-and-sessions](../03-modules/auth-and-sessions.md#known-limitation)).
- Không dùng chung: nhiều instance có thể trả số liệu dashboard và danh mục kỹ năng khác nhau tối đa vài phút.
- Không có giới hạn kích thước: tùy chọn `max: 100` trong cấu hình không có tác dụng với store `Keyv`. Với các khóa `ttl = 0` (như `chat_session:<userId>`) dữ liệu chỉ rời bộ nhớ khi khởi động lại hoặc bị xóa tường minh.
- Cache kết quả đọc CV gần như vô dụng vì TTL 3,6 giây.

## Lớp 3: Redis trực tiếp (không dùng `CACHE_MANAGER`)

Đây **không phải cache** theo nghĩa tối ưu, mà là trạng thái cần bền vững và chia sẻ:

| Dữ liệu | Khóa | TTL | Nơi |
|---|---|---|---|
| OTP | `otp:value:<email>`, `otp:attempts:<email>`, `otp:cooldown:<email>` | 300 giây, 300 giây, 60 giây | [auth-verification.service.ts](../../src/auth/services/auth-verification.service.ts) |
| Bộ đếm quota chat | khóa theo `userId`, vai trò, ngày | đến hết ngày theo múi giờ | [chat-quota.service.ts](../../src/chat/chat-quota.service.ts) |
| Quota gọi Gemini | `gemini:quota:minute:*`, `gemini:quota:day:*`, `gemini:quota:alert:*` | theo cửa sổ | [gemini-quota.service.ts](../../src/gemini/gemini-quota.service.ts) |
| Rate limit | do `ThrottlerStorageRedisService` quản lý | theo throttler | [app.module.ts](../../src/app.module.ts) |
| Cache danh sách | xem lớp 1 | | |

Redis DB: `REDIS_CACHE_DB` (mặc định 1) cho các mục trên; hàng đợi BullMQ dùng `REDIS_QUEUE_DB` (mặc định 0) ([redis.module.ts](../../src/redis/redis.module.ts)).

## Lớp 4: bộ nhớ trong service

| Dữ liệu | Nơi | Ghi chú |
|---|---|---|
| Chính sách quota chat theo vai trò | `policyCache` trong `ChatQuotaService` | Giữ chính sách đọc từ MongoDB trong thời gian ngắn, tránh truy vấn mỗi lượt |
| Bản đồ socket của người dùng | `userSockets` trong `NotificationsGateway` | Không phải cache dữ liệu, nhưng cùng bản chất tiến trình cục bộ |

## Không có cache ở

- `GET /job-search` (code ghi chú `shortcut: uncached aggregate`) ([job-search](../03-modules/job-search.md#known-limitation)).
- Chi tiết tin `GET /jobs/:id`: chưa thấy dùng `ListCacheService` (chỉ danh sách). `Chưa xác minh` cho các route còn lại.

## Known Limitation

| Vấn đề | Chi tiết |
|---|---|
| Lớp 2 không phải Redis | Xem trên |
| Sai đơn vị TTL ở cache đọc CV | `3600` mili giây thay vì giây; cache không có tác dụng |
| Nhiều hằng TTL trùng ý nghĩa | `CHAT_CONTEXT_CACHE_TTL_MS` và `CACHE_TTL_USER_CONTEXT` |
| Độ lệch dữ liệu có chủ đích | Tin: tối đa 60 giây, công ty: 3 phút, dashboard: 3 đến 15 phút, và có thể lệch giữa các instance với lớp 2 |

## Future Improvement

Đề xuất, chưa có trong code:

- Truyền `stores` đúng cho `@nestjs/cache-manager` để lớp 2 thật sự dùng Redis, hoặc bỏ lớp này và chuyển dữ liệu quan trọng (token) sang `REDIS_CLIENT`.
- Đổi TTL cache đọc CV sang mili giây đúng ý định.
- Cache cho `GET /job-search` kèm vô hiệu hóa sau mỗi lần đồng bộ nguồn.
