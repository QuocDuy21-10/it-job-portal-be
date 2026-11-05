# Quy tắc nghiệp vụ

Tổng hợp các quy tắc nghiệp vụ quan trọng, mỗi quy tắc kèm nơi thực thi trong code để kiểm chứng. Đây là mục tra cứu nhanh; giải thích đầy đủ nằm ở tài liệu module và workflow được liên kết.

## Tài khoản và phiên

| Quy tắc | Giá trị | Nơi thực thi |
|---|---|---|
| Vai trò khi đăng ký | `NORMAL USER` | [users.service.ts](../../src/users/users.service.ts) |
| Tài khoản mới chưa xác thực | `isActive = false`, bị xóa tự động sau 15 phút nếu không xác thực | `verificationExpires` và TTL index, xem [users](../04-database/collections/users.md) |
| Mã OTP | 6 chữ số, hiệu lực 5 phút, tối đa 5 lần nhập sai, chờ 60 giây giữa hai lần gửi lại | [auth-verification.service.ts](../../src/auth/services/auth-verification.service.ts) |
| Lưu OTP | Chỉ lưu HMAC-SHA256 trong Redis, so sánh bằng `timingSafeEqual` | [otp.utils.ts](../../src/auth/utils/otp.utils.ts) |
| Số phiên đồng thời | Tối đa 5 mỗi người, vượt thì xóa phiên dùng lâu nhất | [auth-session.service.ts](../../src/auth/services/auth-session.service.ts) |
| Làm mới token | Xóa phiên cũ, tạo phiên mới với refresh token mới | [auth-session.service.ts](../../src/auth/services/auth-session.service.ts) |
| Khóa tài khoản | Quản trị viên khóa được, không tự khóa mình, khóa xong vô hiệu mọi phiên | [user-account.service.ts](../../src/users/services/user-account.service.ts) |
| Xóa tài khoản | Đặt lịch sau 30 ngày, hủy được trong thời gian chờ | [auth-account-deletion.service.ts](../../src/auth/services/auth-account-deletion.service.ts) |

## Tin tuyển dụng

| Quy tắc | Giá trị | Nơi thực thi |
|---|---|---|
| Tin mới | `approvalStatus = PENDING`, chưa hiển thị công khai | [job.schema.ts](../../src/jobs/schemas/job.schema.ts) |
| Hiển thị công khai | `isActive`, `APPROVED`, và chưa quá `endDate` (hoặc không có `endDate`) | [jobs.service.ts](../../src/jobs/jobs.service.ts) |
| Duyệt tin | Chỉ `SUPER ADMIN`. Không kiểm tra trạng thái trước, mọi chuyển đổi hợp lệ | `approveJob` |
| Hết hạn | Cron mỗi giờ đặt `isActive = false` và báo người tạo tin | `handleExpiredJobs` |
| Kỹ năng của tin | Chuẩn hóa theo danh mục kỹ năng, giá trị không hợp lệ bị từ chối | `normalizeControlledSkills` |
| Địa điểm | `locationCode` hoặc `location` phải khớp danh mục, nếu không bị từ chối | `resolveLocationOrThrow` |
| HR và công ty | HR chỉ thao tác trên công ty của mình | [companies.service.ts](../../src/companies/companies.service.ts) |

## Hồ sơ ứng tuyển

| Quy tắc | Giá trị | Nơi thực thi |
|---|---|---|
| Nộp trùng | Một ứng viên không nộp hai lần cho cùng một tin | `checkDuplicateApplication` |
| CV bị tắt | CV có `isActive = false` không dùng để nộp | [application-submission.service.ts](../../src/resumes/services/application-submission.service.ts) |
| Trạng thái ban đầu | `PENDING`, ghi vào `histories` | `create` |
| Đổi trạng thái | Không kiểm tra thứ tự, mỗi lần đổi thêm một dòng `histories` và gửi thông báo | [resumes.service.ts](../../src/resumes/resumes.service.ts) |
| Phạm vi HR | Chỉ xem và sửa hồ sơ của công ty mình | `findOne`, `update` |
| Trọng số điểm | Kỹ năng 50%, kinh nghiệm 30%, học vấn 20% | [matching.constants.ts](../../src/matching/constants/matching.constants.ts) |
| Ngưỡng ưu tiên | `EXCELLENT` ≥ 85, `HIGH` ≥ 70, `MEDIUM` ≥ 50, còn lại `LOW` | `determinePriority` |
| Tự động đổi trạng thái | Có hàm nhưng dòng gán bị comment trong processor, nên **không** áp dụng | [resume-queue.processor.ts](../../src/queues/processors/resume-queue.processor.ts) |
| Giới hạn tốc độ phân tích | Tối đa 15 việc mỗi 60 giây trên hàng đợi `resume-processing` | [resume-queue.processor.ts](../../src/queues/processors/resume-queue.processor.ts) |

Điểm phù hợp là chỉ báo hỗ trợ, không phải đánh giá khách quan về ứng viên: nó chỉ so khớp kỹ năng, số năm và học vấn khai báo trong CV với yêu cầu của tin.

## Tin từ nguồn ngoài

| Quy tắc | Giá trị | Nơi thực thi |
|---|---|---|
| Chu kỳ đồng bộ | Mỗi 6 giờ (`Asia/Ho_Chi_Minh`), chỉ nguồn `enabled` | [job-ingestion.service.ts](../../src/job-ingestion/job-ingestion.service.ts) |
| Không chạy trùng một nguồn | `jobId = sync-<key>` trên hàng đợi | [job-ingestion-queue.service.ts](../../src/queues/services/job-ingestion-queue.service.ts) |
| Tin vắng khỏi danh sách | Thành `STALE`, đóng sau 5 giờ ân hạn | [job-lifecycle.service.ts](../../src/job-ingestion/job-lifecycle.service.ts) |
| Danh sách co bất thường | Dưới 50% mức nền (nền ≥ 20) hoặc rỗng: `SUSPECT`, không đóng tin | `isSuspectListing` |
| Tin bị loại | Không tải lại trong 3 đến 30 ngày tùy lý do | [job-ingestion.constants.ts](../../src/job-ingestion/job-ingestion.constants.ts) |
| Hiển thị | `FULL` đầy đủ, `LINK_ONLY` không có mô tả, `HIDDEN` bị loại | [job-search.service.ts](../../src/job-search/job-search.service.ts) |

## Chat AI

| Quy tắc | Giá trị | Nơi thực thi |
|---|---|---|
| Hạn mức mỗi ngày | `NORMAL USER` 30, `HR` 100, `SUPER ADMIN` không giới hạn | [chat-quota.service.ts](../../src/chat/chat-quota.service.ts) |
| Đặt lại hạn mức | Theo múi giờ chính sách, mặc định `Asia/Ho_Chi_Minh` | cùng file |
| Hành động cần xác nhận | Hết hạn sau 15 phút (mặc định) | [chat-tool-action.service.ts](../../src/chat/chat-tool-action.service.ts) |
| Nhà cung cấp mặc định | Groq, dự phòng Gemini | [ai.constants.ts](../../src/ai/ai.constants.ts) |

## Khác

| Quy tắc | Giá trị | Nơi thực thi |
|---|---|---|
| Đăng ký gợi ý việc làm | Tối đa 3 đang hoạt động mỗi người | [subscribers.service.ts](../../src/subscribers/subscribers.service.ts) |
| Upload | 5 MB mỗi file, kiểm tra MIME và đuôi file theo thư mục | [upload-policy.ts](../../src/files/constants/upload-policy.ts) |
| Thư mục upload `company` | Chỉ `HR` và `SUPER ADMIN` | cùng file |
| Phân trang | `limit` mặc định 10, một số nơi giới hạn tối đa 100 | các service tương ứng |
| Xóa mềm | Hầu hết collection, trừ `sessions` và `cv-profiles` xóa thật | [database-overview](../04-database/database-overview.md#xóa-mềm) |

Các giá trị trên là hằng số trong code tại thời điểm viết; nhiều giá trị có thể ghi đè qua biến môi trường (ví dụ `CHAT_QUOTA_*`). Khi một giá trị đổi, cập nhật tài liệu này cùng Pull Request.
