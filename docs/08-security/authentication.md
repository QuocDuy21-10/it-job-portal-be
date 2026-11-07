# Bảo mật: xác thực

Tổng hợp cơ chế xác thực hiện có và giới hạn, kèm bằng chứng. Mô tả luồng: [auth-and-sessions](../03-modules/auth-and-sessions.md), [authentication use case](../06-workflows/use-cases/authentication.md).

## Cơ chế hiện có (Current Implementation)

| Hạng mục | Chi tiết | Nguồn |
|---|---|---|
| Băm mật khẩu | `bcryptjs`, salt 10 | [users.service.ts](../../src/users/users.service.ts) |
| Access token | JWT ký bằng `JWT_ACCESS_TOKEN_SECRET`, hạn `JWT_ACCESS_EXPIRES_IN` (mẫu `15m`), trả trong body | [auth-session.service.ts](../../src/auth/services/auth-session.service.ts) |
| Refresh token | JWT ký bằng secret **riêng**, hạn `JWT_REFRESH_EXPIRES_IN` (mẫu `7d`), cookie `refresh_token` `httpOnly`, `sameSite=strict`, `secure` ở production | như trên |
| Lưu phiên | Chỉ lưu HMAC-SHA256 của refresh token, không lưu token thô | [sessions.service.ts](../../src/sessions/sessions.service.ts) |
| Xoay vòng refresh token | Dùng một lần; dùng lại bị từ chối | [refresh-token](../06-workflows/sequences/refresh-token.md) |
| Giới hạn phiên | Tối đa 5 mỗi người | `enforceSessionLimit` |
| Kiểm tra trạng thái mỗi request | Khóa, vô hiệu, đã xóa, chờ xóa có hiệu lực ngay | [jwt.strategy.ts](../../src/auth/passport/jwt.strategy.ts) |
| OTP | 6 chữ số từ `crypto.randomInt`, lưu HMAC trong Redis 300 giây, so bằng `timingSafeEqual`, tối đa 5 lần sai, chờ 60 giây giữa hai lần gửi | [otp.utils.ts](../../src/auth/utils/otp.utils.ts) |
| Đăng nhập Google | Xác minh ID token với `GOOGLE_CLIENT_ID`, yêu cầu `email_verified` | [google-oauth](../07-integrations/google-oauth.md) |
| Rate limit | `ThrottlerGuard` và `@Throttle` trên mọi route auth, lưu Redis | [auth-and-sessions](../03-modules/auth-and-sessions.md#api) |
| Kiểm tra cấu hình lúc khởi động | Thiếu secret bắt buộc thì không chạy | [env.validation.ts](../../src/config/env.validation.ts) |
| Che header nhạy cảm trong log | `authorization`, `cookie`, `set-cookie` | [observability](../02-architecture/observability.md#log) |

## Điểm mạnh quan sát được

- Refresh token trong cookie `httpOnly` và `SameSite=Strict` giảm rủi ro đọc token bằng XSS và tấn công CSRF.
- Không lưu token thô trong database, nên lộ database không lộ trực tiếp phiên.
- Khóa tài khoản có hiệu lực tức thì dù access token còn hạn (đổi lại mỗi request tốn một truy vấn người dùng).
- OTP không lưu dạng thô và có chống đoán.

## Known Limitation

| Vấn đề | Chi tiết | Mức |
|---|---|---|
| Chính sách mật khẩu yếu và không nhất quán | Đăng ký và `POST /users` chỉ cần không rỗng; đổi, đặt, đặt lại cần tối thiểu 6 ký tự; không có yêu cầu độ phức tạp ([auth endpoints](../05-api/endpoints/auth.md#known-limitation)) | Cao |
| Không có khóa tài khoản sau nhiều lần đăng nhập sai | Chỉ có giới hạn tốc độ theo IP (10 lần mỗi 5 phút ở đăng nhập). Thử từ nhiều IP không bị chặn theo tài khoản | Trung bình |
| Không có xác thực hai yếu tố | Không thấy trong source | Trung bình |
| Access token không thu hồi riêng | Chỉ chết khi hết hạn hoặc khi trạng thái tài khoản đổi | Thấp |
| Token đặt lại mật khẩu, hủy xóa tài khoản trong bộ nhớ | Mất khi khởi động lại ([data-flow](../02-architecture/data-flow.md#known-limitation-cache_manager-chạy-trong-bộ-nhớ-không-phải-redis)) | Trung bình (chức năng) |
| Hủy xóa tài khoản bằng đăng nhập không dùng được | [auth-and-sessions](../03-modules/auth-and-sessions.md#known-limitation) | Trung bình (chức năng) |
| Làm mới token không có giao dịch, không phát hiện tái sử dụng | [refresh-token](../06-workflows/sequences/refresh-token.md#known-limitation) | Thấp |
| Phiên Google ghi `userAgent`, `ipAddress` cứng | Mất dấu vết thiết bị cho phiên Google ([google-oauth](../07-integrations/google-oauth.md)) | Thấp |
| Liên kết Google tự động theo email | Người điều khiển tài khoản Google cùng email đăng nhập được vào tài khoản `local` | Cần xác nhận chủ ý |
| Độ mạnh secret không được kiểm tra | `validateEnv` chỉ kiểm tra tồn tại, không kiểm tra độ dài | Thấp |
| Gateway Socket.IO chỉ xác minh chữ ký token | Không kiểm tra trạng thái tài khoản ([realtime](../05-api/realtime.md#known-limitation)) | Thấp |

## Future Improvement

Đề xuất, chưa có trong code: thống nhất `MinLength` và độ phức tạp ở mọi DTO mật khẩu; khóa theo tài khoản sau N lần sai; 2FA cho `SUPER ADMIN`; thu hồi toàn bộ phiên khi phát hiện tái sử dụng refresh token; kiểm tra độ dài tối thiểu của secret khi khởi động.
