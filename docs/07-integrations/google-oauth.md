# Tích hợp Google (đăng nhập)

Đăng nhập bằng **Google ID token**, không dùng luồng chuyển hướng OAuth phía server. Nguồn: [auth-google.service.ts](../../src/auth/services/auth-google.service.ts), route `POST /api/v1/auth/google/login` ([auth endpoints](../05-api/endpoints/auth.md)).

## Cách hoạt động

1. Giao diện lấy **ID token** từ Google và gửi cho backend.
2. Backend gọi `google-auth-library` `verifyIdToken` với `audience = GOOGLE_CLIENT_ID`.
3. Từ chối nếu không có payload hoặc `email_verified` sai (`401`).
4. Lấy `sub` (thành `googleId`), `email`, `name`, `picture` (thành `avatar`) rồi xử lý theo bảng dưới.
5. Cấp access token và refresh token như đăng nhập thường ([refresh-token](../06-workflows/sequences/refresh-token.md)).

## Cấu hình

| Biến | Ghi chú |
|---|---|
| `GOOGLE_CLIENT_ID` | Dùng làm `audience` khi xác minh |
| `GOOGLE_CLIENT_SECRET` | Có trong `.env.example`; chưa thấy dùng trong luồng ID token đã đọc. `Chưa xác minh` |

## Quy tắc và giới hạn

- Tài khoản Google không có mật khẩu; có thể đặt sau bằng `POST /auth/set-password`.
- Tạo tài khoản mới luôn gán `NORMAL USER`.
- Route có giới hạn 10 lần mỗi 5 phút.

### Xử lý theo trạng thái tài khoản (`googleLogin`)

| Tình huống | Hành vi |
|---|---|
| Đã có tài khoản với `googleId` này | Đăng nhập |
| Chưa có `googleId`, có tài khoản **đang hoạt động** cùng email | **Liên kết tự động** (`linkGoogleAccount`): đặt `googleId` và đổi `authProvider` thành `google`, giữ nguyên các field khác |
| Chưa có `googleId`, có tài khoản **chưa kích hoạt** cùng email | Xóa tài khoản chưa kích hoạt đó, rồi tạo tài khoản Google mới (`isActive = true`, `NORMAL USER`, `password = null`) |
| Không có tài khoản | Tạo mới như trên |

Sau đó `assertAuthenticatedAccountState` chặn tài khoản bị khóa hoặc đang chờ xóa.

### Known Limitation

- Liên kết tự động dựa trên việc Google xác nhận `email_verified`; người nắm tài khoản Google có email đó đăng nhập được vào tài khoản `local` cùng email. Đây là hành vi phổ biến, nhưng cần chủ dự án xác nhận là chủ ý.
- Phiên của đăng nhập Google được ghi `userAgent = 'unknown'` và `ipAddress = 'google-login'` (giá trị cứng trong `googleLogin`), nên danh sách phiên và dấu vết IP của các phiên này không có thông tin thật ([auth-google.service.ts](../../src/auth/services/auth-google.service.ts)).
- `googleId` có index unique sparse trong schema ([users](../04-database/collections/users.md)).
