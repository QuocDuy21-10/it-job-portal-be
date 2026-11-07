# Báo cáo bao phủ tài liệu

Đối chiếu bộ tài liệu với yêu cầu ban đầu và với source code, kèm những gì **chưa** đủ bằng chứng. Số liệu đo ngày 2026-11-06 trên nhánh `docs/production-documentation`. Báo cáo này không khẳng định hệ thống sẵn sàng production; nó nêu bằng chứng và khoảng trống.

## Quy mô

| Hạng mục | Giá trị |
|---|---|
| Tệp Markdown trong cấu trúc mới | 119 (khoảng 97 nghìn từ) |
| Sơ đồ Mermaid | 33, tất cả parse được |
| Mục `Known Limitation` | 88 |
| Chỗ ghi `Chưa xác minh` | 73 |
| Collection có data dictionary | 17 trên 17 |
| Route được tài liệu hóa | 116 trên 116 (16 controller; `databases` không có route) |
| Tài liệu cũ đã xử lý | 171 trên 171 ([legacy-docs-migration](legacy-docs-migration.md)) |

## Theo tiêu chí chấp nhận

| Tiêu chí | Kết quả | Bằng chứng |
|---|---|---|
| Người mới hiểu dự án và tìm được hướng dẫn chạy local | Đạt | [README](../README.md), [project-overview](../00-getting-started/project-overview.md), [quick-start](../00-getting-started/quick-start.md). Các lệnh chạy cần MongoDB và Redis chưa được thử thật |
| Tech Lead hiểu kiến trúc, lý do công nghệ, trade-off | Đạt, kèm giới hạn | [architecture-overview](../02-architecture/architecture-overview.md), [technology-decisions](../02-architecture/technology-decisions.md) (phân biệt có bằng chứng và suy luận), [ADR](../12-decisions/README.md), [technical-challenges](../02-architecture/technical-challenges.md). Lý do chọn MongoDB, Groq, Express không có trong repository |
| Developer tra cứu được module, API, luồng | Đạt | [03-modules](../03-modules/platform-infrastructure.md) (17), [05-api](../05-api/api-overview.md), [06-workflows](../06-workflows/use-cases/use-case-overview.md) |
| Mọi Mongoose collection có data dictionary | Đạt | 17 file được **sinh từ schema Mongoose thật**; script kiểm tra field và index báo 0 lỗi |
| Nghiệp vụ phức tạp có sơ đồ rõ ràng | Đạt | 5 sequence, 3 state machine, 6 use case, C4 ba mức, ERD |
| Không có link hỏng hoặc mô tả sai lệch phát hiện được bằng đối chiếu code | Đạt với phần kiểm tra được | Link, anchor, Mermaid, route, schema, biến môi trường, bí mật đều qua script. Không thể kiểm tra tự động nội dung diễn giải |
| Nhận định production readiness có bằng chứng | Đạt | [production-security-checklist](../08-security/production-security-checklist.md) dùng bốn nhãn trạng thái kèm nguồn; không có mục nào khẳng định "an toàn" |
| Dễ mở rộng khi thêm chức năng | Đạt một phần | Có [documentation-guide](../13-contributing/documentation-guide.md), template, quy tắc cập nhật cùng PR; chưa có kiểm tra tài liệu trong CI |

## Đã xác minh từ source

| Lĩnh vực | Cách xác minh |
|---|---|
| Field, kiểu, required, default, enum, index, TTL của 17 collection | Nạp schema thật bằng ts-node, đọc `schema.paths` và `schema.indexes()`, sinh bảng, rồi đối chiếu bằng script |
| 116 route, auth, vai trò, DTO, throttle | Parser đọc decorator của 17 controller và DTO; script kiểm tra mọi route có trong tài liệu |
| Thuộc tính `Mixed` của `Types.ObjectId` | Nạp schema thật và gọi `cast()` |
| `CACHE_MANAGER` chạy trong bộ nhớ, TTL tính bằng mili giây | **Thực nghiệm**: dựng đúng cấu hình khi không có Redis, rồi đo hết hạn |
| Khớp kỹ năng bằng chuỗi con | **Thực nghiệm**: gọi hàm thật với các cặp kỹ năng |
| Hành vi quy tắc: vòng đời tin ngoài, chấm điểm, quota, guardrail, xóa tài khoản, hàng đợi | Đọc mã nguồn từng hàm liên quan |
| Số test, độ bao phủ | Chạy `jest` và `jest --coverage` (706 test đạt; 59,1% dòng) |
| `tsc --noEmit`, `docker compose config` | Đã chạy, không lỗi |
| CI, Dockerfile, compose, Dependabot, hook | Đọc cấu hình |
| Lịch sử quyết định | Đọc `git log` và nội dung commit |

## Phát hiện chính từ việc đối chiếu code

Tất cả được ghi trong tài liệu liên quan, kèm bằng chứng. Mức: từ đọc mã trừ khi ghi "thực nghiệm". Không có mục nào được sửa trong source (ngoài phạm vi).

### Bảo mật và dữ liệu cá nhân

| # | Phát hiện | Mức | Nơi ghi |
|---|---|---|---|
| 1 | Mọi người dùng đăng nhập đọc được CV của người khác (`GET /cv-profiles`, `/:id`) | Cao | [user-roles](../01-product/user-roles.md#known-limitation-cv-của-mọi-người-dùng-đọc-được-bởi-bất-kỳ-ai-đã-đăng-nhập) |
| 2 | Xóa tài khoản không triệt để: `resumes` giữ nội dung CV, file không bị xóa, một số collection không bị xóa | Cao | [account-deletion](../06-workflows/use-cases/account-deletion.md#dữ-liệu-sau-khi-xóa) |
| 3 | Seed tạo 96 tài khoản chung `INIT_PASSWORD`, và hướng dẫn triển khai bảo chạy ở production | Trung bình đến cao | [production-security-checklist](../08-security/production-security-checklist.md#mục-cần-xử-lý-trước-khi-chạy-production-seed) |
| 4 | Văn bản CV và email có thể xuất hiện trong log; email người dùng gửi tới nhà cung cấp AI | Trung bình | [data-protection](../08-security/data-protection.md) |
| 5 | File CV phục vụ tĩnh không cần xác thực (tên UUID) | Trung bình | [data-protection](../08-security/data-protection.md#file-tải-lên) |
| 6 | Chính sách mật khẩu yếu và không nhất quán; không khóa tài khoản, không 2FA | Trung bình | [authentication](../08-security/authentication.md) |
| 7 | `GET /resumes` nhận bộ lọc và `populate` thô (sanitizer bị comment) | Trung bình | [api-overview](../05-api/api-overview.md#lọc-và-sắp-xếp-bằng-query-string) |
| 8 | CASL được định nghĩa nhưng không thực thi trên route | Hiểu nhầm | [authorization](../03-modules/authorization.md) |

### Đúng đắn chức năng

| # | Phát hiện | Nơi ghi |
|---|---|---|
| 9 | Hủy xóa tài khoản bằng đăng nhập không dùng được (`JwtStrategy` chặn người chờ xóa) | [auth-and-sessions](../03-modules/auth-and-sessions.md#known-limitation) |
| 10 | Token đặt lại mật khẩu và hủy xóa nằm trong bộ nhớ, mất khi khởi động lại (thực nghiệm) | [data-flow](../02-architecture/data-flow.md#known-limitation-cache_manager-chạy-trong-bộ-nhớ-không-phải-redis) |
| 11 | Khớp kỹ năng bằng chuỗi con: `JavaScript` khớp `Java`, `React` khớp `C`, `Go` khớp `MongoDB` (thực nghiệm); điểm kỹ năng thực tế chặn ở 70% | [cv-parsing-and-matching](../03-modules/cv-parsing-and-matching.md#known-limitation) |
| 12 | Cache kết quả đọc CV chỉ sống 3,6 giây do sai đơn vị TTL (thực nghiệm) | [caching-strategy](../02-architecture/caching-strategy.md) |
| 13 | Email "tin mới" gửi lúc tạo tin, trước khi duyệt; email gợi ý hằng tuần không lọc `approvalStatus` | [queues](../03-modules/queues.md#job-recommendation) |
| 14 | `userId` là `Mixed` ở `cvprofiles`, `chat_*`, `ai_usage_logs` (xác minh bằng nạp schema) | [database-overview](../04-database/database-overview.md#kiểu-objectid-thực-tế) |
| 15 | Index khai báo hai lần cùng key ở `sessions`, `cvprofiles`, `chat_sessions` (TTL, unique có thể không tồn tại) | [database-overview](../04-database/database-overview.md#known-limitation-khai-báo-index-trùng-key-pattern) |
| 16 | Phân tích hồ sơ có thể chạy hai lần; hầu hết hàng đợi thiếu `jobId` | [queues](../03-modules/queues.md#known-limitation) |
| 17 | Plugin xóa mềm không lọc `findOne`, `aggregate`, `update*` | [database-overview](../04-database/database-overview.md#known-limitation-xóa-mềm-không-tự-áp-dụng-cho-mọi-loại-truy-vấn) |
| 18 | Chi phí AI ghi 0 nếu chưa đặt đơn giá | [ai-usage-logs](../04-database/collections/ai-usage-logs.md) |

### Vận hành và chất lượng

| # | Phát hiện | Nơi ghi |
|---|---|---|
| 19 | Ba script `package.json` trỏ tới file không tồn tại | [local-development](../00-getting-started/local-development.md#known-limitation-script-dev-bị-thiếu) |
| 20 | Cron và Socket.IO chưa sẵn sàng cho nhiều instance; file tải lên nằm trên đĩa | [scalability](../02-architecture/scalability.md) |
| 21 | Cảnh báo lỗi nguồn tin chỉ là dòng log; không metric, không cảnh báo hàng đợi | [observability](../02-architecture/observability.md) |
| 22 | `matching` và `cv-parser` không có test; coverage tổng 59,1% | [test-inventory](../10-testing/test-inventory.md) |
| 23 | Không có quy trình rollback, sao lưu tự động, hay RPO/RTO | [backup-and-recovery](../11-operations/backup-and-recovery.md) |
| 24 | CI không chạy e2e, không đo coverage, `npm audit` chỉ chặn mức critical | [ci-cd](../09-infrastructure/ci-cd.md) |
| 25 | README gốc và tài liệu cũ lệch code (Node 20, `devlink`, `7d`, biến không tồn tại, mô tả seed) | [legacy-docs-migration](legacy-docs-migration.md) |

## Chưa đủ bằng chứng (Chưa xác minh)

Tập hợp theo nhóm; vị trí cụ thể nằm ở nhãn `Chưa xác minh` trong từng tài liệu.

| Nhóm | Điều chưa xác minh | Vì sao |
|---|---|---|
| Chạy thật | Khởi động đầy đủ, `npm run seed`, e2e, mọi lệnh Docker, triển khai VPS | Docker daemon không chạy; không có MongoDB, Redis, VPS |
| Khai thác lỗ hổng | Mọi mục bảo mật ở trên mới được đọc mã, chưa thử gọi API | Cần ứng dụng chạy thật |
| Index thật | Index nào thực sự tồn tại (TTL, unique) sau khi Mongoose tạo | Cần `getIndexes()` trên database |
| Hiệu năng | `$sort` sau `$unionWith`, regex không neo, 21 index của `ai_usage_logs` | Chưa đo |
| Pháp lý | Điều khoản TopDev, ITviec; chính sách dữ liệu Google, Groq; tuân thủ bảo vệ dữ liệu | Ngoài repository |
| Hạ tầng | Cấu hình nginx, TLS, `TRUST_PROXY`, tường lửa, SMTP | Ngoài repository |
| Chi tiết nhỏ | Cách chat xử lý khi Redis lỗi; hủy stream giữa chừng có hoàn quota không; giới hạn lịch sử chat 6 hay 10 áp dụng trước; Sentry PII; seed có idempotent không | Cần chạy hoặc đọc sâu thêm |
| Tài liệu cũ | Đối chiếu từng dòng cho 171 tệp cũ | Chỉ đối chiếu có chủ đích một số tệp; phần còn lại xếp lịch sử |
| Môi trường tạo tài liệu | Node 22 thay vì 24 | Test qua trên Node 22; CI dùng 24 |

## Hạng mục cần bổ sung về sau

1. **Chạy thật rồi cập nhật tài liệu:** khởi động ứng dụng với MongoDB và Redis, chạy e2e, thử các rủi ro bảo mật, kiểm tra `getIndexes()`.
2. **Tự động hóa kiểm tra tài liệu trong CI:** link, Mermaid, và so tài liệu collection và route với code (các script hiện có ở `docs/superpowers/doccheck/`, chỉ local).
3. **Sửa các phát hiện:** nhất là mục 1 đến 3 (CV, xóa tài khoản, seed), 9, 11, 15. Việc sửa code ngoài phạm vi của dự án tài liệu này.
4. **Xác nhận lý do thiết kế với tác giả** để nâng các mục `Proposed` và suy luận trong [technology-decisions](../02-architecture/technology-decisions.md) thành ADR `Accepted`.
5. **Thêm tài liệu còn thiếu khi có bằng chứng:** schema payload `done` của stream chat, cấu trúc response các dashboard thống kê, ví dụ phản hồi cho từng route (hiện lấy từ Swagger).
6. **Website tài liệu** (Docusaurus hoặc MkDocs) nếu cần tìm kiếm và giao diện; hiện chỉ có Markdown cho GitHub.
7. **Rà lại tài liệu cũ trong `docs/archive/`** để nhặt thêm ghi chú còn giá trị nếu có.

## Giới hạn của chính báo cáo này

Báo cáo do người viết tài liệu lập, không phải kiểm toán độc lập. Số liệu "đã xác minh" nghĩa là đã đối chiếu bằng đọc mã hoặc thực nghiệm được nêu, không phải đã chạy trên môi trường vận hành thật.
