# Tổng quan tính năng

Tài liệu này liệt kê các tính năng DevLink đang có theo nhóm người dùng, kèm nơi tìm chi tiết. Chỉ gồm những gì có trong source. Tính năng chưa có được ghi ở cuối.

## Ứng viên (`NORMAL USER`)

| Tính năng | Mô tả | Chi tiết |
|---|---|---|
| Đăng ký và xác thực | Đăng ký bằng email, xác thực bằng mã OTP 6 chữ số gửi qua email | [auth-and-sessions](../03-modules/auth-and-sessions.md) |
| Đăng nhập | Email và mật khẩu, hoặc Google | [auth-and-sessions](../03-modules/auth-and-sessions.md) |
| Quản lý phiên | Xem phiên, đăng xuất một hoặc mọi thiết bị, tối đa 5 phiên | [sessions](../04-database/collections/sessions.md) |
| Tìm việc | Danh sách tin nội bộ, và tìm kiếm hợp nhất cả tin ngoài | [jobs](../03-modules/jobs.md) |
| Lưu tin, theo dõi công ty | Lưu vào `users.savedJobs` và `users.companyFollowed` | [users](../03-modules/users.md) |
| CV trực tuyến | Tạo, sửa, bật tắt, xóa CV có cấu trúc | [cv-profiles](../03-modules/cv-profiles.md) |
| Ứng tuyển | Nộp bằng CV trực tuyến hoặc tải file CV | [resumes](../03-modules/resumes.md) |
| Xem phân tích hồ sơ | Điểm phù hợp, kỹ năng khớp, điểm mạnh yếu | [resumes](../04-database/collections/resumes.md) |
| Nhận gợi ý việc làm | Đăng ký nhận email theo kỹ năng và địa điểm, tối đa 3 đăng ký | [notifications-and-mail](../03-modules/notifications-and-mail.md) |
| Thông báo | Trong ứng dụng và thời gian thực | [notifications-and-mail](../03-modules/notifications-and-mail.md) |
| Trợ lý AI | Chat về nghề nghiệp và việc làm, giới hạn 30 lượt/ngày | `03-modules/ai-chat.md` (Phase 3) |
| Xóa tài khoản | Đặt lịch xóa sau 30 ngày, có thể hủy | [auth-and-sessions](../03-modules/auth-and-sessions.md) |

## Nhà tuyển dụng (`HR`)

| Tính năng | Mô tả | Chi tiết |
|---|---|---|
| Quản lý công ty của mình | Sửa thông tin và logo công ty mình | [companies](../03-modules/companies.md) |
| Đăng và quản lý tin | Tin mới ở trạng thái `PENDING` chờ duyệt | [jobs](../03-modules/jobs.md) |
| Xử lý hồ sơ ứng tuyển | Xem, đổi trạng thái, ghi chú, phân tích lại | [resumes](../03-modules/resumes.md) |
| Điểm phù hợp | Mỗi hồ sơ có điểm và mức ưu tiên (`LOW` đến `EXCELLENT`) | [resumes](../04-database/collections/resumes.md) |
| Thống kê công ty | Dashboard riêng cho HR | [statistics](../03-modules/statistics.md) |
| Nhận thông báo | Hồ sơ mới, tin hết hạn | [notifications-and-mail](../03-modules/notifications-and-mail.md) |
| Trợ lý AI | Giới hạn 100 lượt/ngày | `03-modules/ai-chat.md` (Phase 3) |

## Quản trị viên (`SUPER ADMIN`)

| Tính năng | Mô tả | Chi tiết |
|---|---|---|
| Quản lý người dùng | Tạo, sửa, khóa và mở khóa, xóa | [users](../03-modules/users.md) |
| Quản lý công ty | Tạo, xóa, dọn logo mồ côi | [companies](../03-modules/companies.md) |
| Duyệt tin | Duyệt hoặc từ chối tin của HR | [jobs](../03-modules/jobs.md) |
| Danh mục kỹ năng | Tạo, sửa, xóa kỹ năng có kiểm soát | [skills](../03-modules/skills.md) |
| Nguồn tin ngoài | Bật tắt nguồn, đổi chính sách hiển thị, kích hoạt đồng bộ, xem lịch sử | `03-modules/job-ingestion.md` (Phase 3) |
| Thống kê hệ thống | Dashboard quản trị, thống kê chat AI | [statistics](../03-modules/statistics.md) |
| Hàng đợi | Xem trạng thái hàng đợi hồ sơ, kích hoạt gửi gợi ý việc làm | `03-modules/queues.md` (Phase 3) |

## Tính năng nền tảng

| Tính năng | Mô tả |
|---|---|
| Tìm kiếm hợp nhất | Một API tìm trong cả tin nội bộ và tin ngoài, công khai, có rate limit |
| Tin từ nguồn ngoài | Đồng bộ định kỳ 6 giờ một lần từ các nhà cung cấp `ITVIEC`, `TOPDEV`, `LEVER`, `GREENHOUSE`, có chính sách hiển thị theo nguồn |
| Chấm điểm CV | Tính điểm tất định từ kỹ năng (50%), kinh nghiệm (30%), học vấn (20%) |
| Thời gian thực | Thông báo qua Socket.IO namespace `/notifications` |
| Seed dữ liệu mẫu | `npm run seed` tạo kỹ năng, nguồn tin, công ty, người dùng, tin, CV và hồ sơ mẫu |

## Chưa có trong source

Không tìm thấy trong source nên tài liệu không mô tả như tính năng hiện có:

- Thanh toán, gói dịch vụ trả phí.
- Nhắn tin trực tiếp giữa ứng viên và nhà tuyển dụng.
- Lịch phỏng vấn.
- Đăng nhập bằng nhà cung cấp khác ngoài Google.
