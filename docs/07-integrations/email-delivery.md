# Tích hợp gửi email (SMTP)

`@nestjs-modules/mailer` (Nodemailer) với template Handlebars. Nguồn: [mail.module.ts](../../src/mail/mail.module.ts), [mail.service.ts](../../src/mail/mail.service.ts). Mô tả loại email và thời điểm gửi: [notifications-and-mail](../03-modules/notifications-and-mail.md).

## Cấu hình

| Biến | Dùng cho |
|---|---|
| `SMTP_HOST` | Máy chủ SMTP |
| `SMTP_EMAIL` | Tên đăng nhập SMTP (cũng dùng làm tài khoản gửi) |
| `SMTP_PASSWORD` | Mật khẩu SMTP |

Transport đặt `secure: false` và **không khai báo `port`** ([mail.module.ts](../../src/mail/mail.module.ts)), nên cổng và việc nâng cấp lên TLS dựa vào mặc định của Nodemailer. Tài liệu không suy ra cổng thực tế: `Chưa xác minh`.

Template nằm ở [src/mail/templates/](../../src/mail/templates/), biên dịch ở chế độ `strict: true` (biến thiếu trong template gây lỗi). Khi `NODE_ENV=development`, `preview: true` bật xem trước email thay vì chỉ gửi.

## Template

`account-deleted`, `account-deletion-scheduled`, `application-status-update`, `forgot-password`, `job-expired-notification`, `job-recommendation`, `new-job-notification`, `verify-email`.

## Đường gửi

| Email | Gửi trực tiếp hay qua hàng đợi |
|---|---|
| OTP, đặt lại mật khẩu | Do `auth` gọi trong request (chi tiết đường gọi: `Chưa xác minh`) |
| Tin mới cho người theo dõi, trạng thái hồ sơ, hồ sơ mới, tin hết hạn, gợi ý việc làm | Qua hàng đợi, retry 3 lần ([queues](../03-modules/queues.md)) |
| Báo xóa tài khoản, xác nhận đã xóa | Do `auth` và processor xóa tài khoản gọi |

## Giới hạn

- Không có xử lý bounce, hủy đăng ký (unsubscribe) hay theo dõi gửi thành công trong source đã đọc.
- Lỗi gửi từng email ở một số processor chỉ ghi log và không retry.
- Email có thể gửi trùng khi retry (không có khóa chống trùng).
- Chưa xác minh với một máy chủ SMTP thật (không chạy được trong môi trường tạo tài liệu).
