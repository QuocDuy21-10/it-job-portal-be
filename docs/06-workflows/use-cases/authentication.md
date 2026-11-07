# Use case: đăng ký, xác thực và đăng nhập

## Actor và mục đích

| Actor | Mục đích |
|---|---|
| Khách | Tạo tài khoản và đăng nhập |
| Người dùng | Đăng nhập lại, quên và đặt lại mật khẩu, đổi mật khẩu |

## Precondition và postcondition

| | Đăng ký | Đăng nhập |
|---|---|---|
| Precondition | Email chưa dùng bởi tài khoản chưa xóa | Tài khoản đã kích hoạt, không bị khóa, không chờ xóa |
| Postcondition | Tài khoản `NORMAL USER` `isActive = false`; OTP gửi qua email | Có phiên mới; client giữ access token, trình duyệt giữ cookie refresh token |

## Luồng chính: đăng ký bằng email

1. Khách gửi tên, email, mật khẩu (`POST /auth/register`, 5 lần mỗi giờ).
2. Hệ thống băm mật khẩu bằng bcrypt, tạo tài khoản chưa kích hoạt với `verificationExpires` 15 phút, sinh OTP 6 chữ số, lưu HMAC trong Redis (hiệu lực 5 phút), gửi email.
3. Khách nhập mã (`POST /auth/verify`). Mã đúng thì tài khoản `isActive = true`.
4. Khách đăng nhập (`POST /auth/login`) và nhận access token cùng cookie refresh token.

## Luồng thay thế

| Luồng | Mô tả |
|---|---|
| Đăng nhập Google | `POST /auth/google/login` với ID token; hệ thống xác minh với `GOOGLE_CLIENT_ID`, yêu cầu `email_verified`, tạo hoặc đăng nhập tài khoản `google`. Mật khẩu đặt sau bằng `set-password` |
| Gửi lại mã | `POST /auth/resend-code`, chờ 60 giây giữa hai lần |
| Quên mật khẩu | `POST /auth/forgot-password` gửi link; `POST /auth/reset-password` với token và mật khẩu mới (tối thiểu 6 ký tự) |
| Đổi mật khẩu | `POST /auth/change-password` khi đã đăng nhập, cần mật khẩu hiện tại |
| Làm mới phiên | [refresh-token](../sequences/refresh-token.md) |

## Luồng lỗi

| Tình huống | Kết quả |
|---|---|
| Mã OTP sai | `400` kèm số lần còn lại; từ lần sai thứ 5, `403` |
| OTP hết hạn | `400` "Mã xác thực đã hết hạn hoặc không tồn tại" |
| Không xác thực trong 15 phút | Tài khoản bị MongoDB TTL xóa |
| Chưa kích hoạt khi đăng nhập | `400` |
| Tài khoản bị khóa, xóa, hoặc vô hiệu | `401` |
| Đang chờ xóa | `403` |
| Vượt giới hạn tốc độ | `429` |

## Quy tắc nghiệp vụ

- Tối đa 5 phiên đồng thời; vượt thì phiên dùng lâu nhất bị xóa.
- Chính sách mật khẩu không nhất quán (đăng ký chỉ cần không rỗng): [auth endpoints](../../05-api/endpoints/auth.md#known-limitation).
- Không có xác thực hai yếu tố trong source.

## Edge case

- Gửi OTP đến email đã có tài khoản chưa kích hoạt: `resend-code` từ chối nếu tài khoản đã kích hoạt ("Tài khoản đã được kích hoạt rồi").
- Link đặt lại mật khẩu mất hiệu lực khi backend khởi động lại ([auth-and-sessions](../../03-modules/auth-and-sessions.md#known-limitation)).
- Hai lần làm mới token đồng thời làm một lần thất bại.

## Sơ đồ liên quan

[refresh-token](../sequences/refresh-token.md), mô-đun [auth-and-sessions](../../03-modules/auth-and-sessions.md).
