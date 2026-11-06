# API Auth

Tiền tố `/api/v1/auth`. Controller: [auth.controller.ts](../../../src/auth/auth.controller.ts). Module: [auth-and-sessions](../../03-modules/auth-and-sessions.md). Quy ước chung: [api-overview](../api-overview.md).

## Luồng sử dụng điển hình

1. `POST /auth/register` tạo tài khoản `NORMAL USER` chưa kích hoạt và gửi OTP qua email.
2. `POST /auth/verify` với email và mã OTP để kích hoạt (hiệu lực 5 phút, tối đa 5 lần sai, chờ 60 giây giữa hai lần gửi lại qua `resend-code`).
3. `POST /auth/login` trả `access_token` trong body và đặt cookie `refresh_token`.
4. Khi access token hết hạn, gọi `GET /auth/refresh` (tự gửi cookie). Mỗi lần làm mới xoay vòng refresh token: token cũ **không dùng lại được**.

Tài khoản chưa xác thực trong 15 phút bị xóa tự động ([users](../../04-database/collections/users.md#vòng-đời)).

## Danh sách route

| Route | Auth | Mô tả |
|---|---|---|
| `POST /api/v1/auth/login` | Công khai, xác thực bằng email và mật khẩu | Đăng nhập bằng email và mật khẩu. Trả access token, đặt cookie refresh token |
| `POST /api/v1/auth/register` | Công khai | Đăng ký tài khoản `NORMAL USER` và gửi OTP xác thực qua email |
| `POST /api/v1/auth/verify` | Công khai | Xác thực tài khoản bằng mã OTP |
| `POST /api/v1/auth/resend-code` | Công khai | Gửi lại mã OTP (chờ 60 giây giữa hai lần) |
| `POST /api/v1/auth/google/login` | Công khai | Đăng nhập hoặc đăng ký bằng Google ID token |
| `GET /api/v1/auth/me` | Đăng nhập (mọi vai trò) | Lấy hồ sơ của người dùng hiện tại |
| `GET /api/v1/auth/refresh` | Công khai, cần cookie `refresh_token` | Làm mới access token bằng cookie refresh token, xoay vòng refresh token |
| `POST /api/v1/auth/logout` | Đăng nhập (mọi vai trò) | Đăng xuất thiết bị hiện tại: xóa phiên và cookie |
| `POST /api/v1/auth/logout-all` | Đăng nhập (mọi vai trò) | Đăng xuất mọi thiết bị: vô hiệu mọi phiên |
| `GET /api/v1/auth/sessions` | Đăng nhập (mọi vai trò) | Liệt kê các phiên đang hoạt động của người dùng |
| `POST /api/v1/auth/change-password` | Đăng nhập (mọi vai trò) | Đổi mật khẩu (cần mật khẩu cũ) |
| `POST /api/v1/auth/set-password` | Đăng nhập (mọi vai trò) | Đặt mật khẩu lần đầu cho tài khoản đăng ký bằng Google |
| `POST /api/v1/auth/forgot-password` | Công khai | Yêu cầu đặt lại mật khẩu, gửi link qua email |
| `POST /api/v1/auth/reset-password` | Công khai | Đặt mật khẩu mới bằng token từ email |
| `DELETE /api/v1/auth/account` | Đăng nhập (mọi vai trò) | Yêu cầu xóa tài khoản, sẽ bị xóa sau 30 ngày nếu không hủy |
| `POST /api/v1/auth/account/cancel-deletion` | Đăng nhập (mọi vai trò) | Hủy yêu cầu xóa khi đang đăng nhập (xem Known Limitation) |
| `POST /api/v1/auth/account/cancel-deletion-by-token` | Công khai | Hủy yêu cầu xóa bằng token trong email |

## Phản hồi đăng nhập và làm mới

`POST /auth/login`, `POST /auth/google/login` và `GET /auth/refresh` trả (trong `data`), theo [auth-session.service.ts](../../../src/auth/services/auth-session.service.ts):

```json
{
  "access_token": "<jwt>",
  "user": {
    "_id": "665f1a2b3c4d5e6f70819201",
    "name": "Nguyen Van A",
    "email": "candidate@example.com",
    "role": "NORMAL USER",
    "company": null
  }
}
```

Đồng thời đặt cookie `refresh_token`: `httpOnly`, `sameSite=strict`, `secure` ở production, `maxAge` theo `JWT_REFRESH_EXPIRES_IN`. Giá trị `company` có khi người dùng là HR. Giá trị trong ví dụ là minh họa.

Làm mới token trả `400` "Session not found or already used" khi phiên không còn (ví dụ token đã được xoay vòng, đăng xuất, hoặc bị vượt quá 5 phiên).

## Giới hạn tốc độ

Route auth đều có `ThrottlerGuard`; giới hạn riêng của từng route nằm ở mục chi tiết bên dưới và tổng hợp ở [auth-and-sessions](../../03-modules/auth-and-sessions.md#api). `forgot-password` không có giới hạn riêng.

## Known Limitation

- `POST /auth/account/cancel-deletion` yêu cầu JWT nhưng không dùng được khi tài khoản đang chờ xóa, xem [auth-and-sessions](../../03-modules/auth-and-sessions.md#known-limitation). Đường dùng được là `cancel-deletion-by-token`, với token lưu trong bộ nhớ tiến trình.
- Link đặt lại mật khẩu cũng lưu trong bộ nhớ tiến trình, mất khi backend khởi động lại.
- **Chính sách mật khẩu không nhất quán.** `POST /auth/register` và `POST /users` chỉ yêu cầu mật khẩu không rỗng (`IsNotEmpty`), nên mật khẩu một ký tự được chấp nhận khi đăng ký. `change-password`, `set-password` và `reset-password` yêu cầu tối thiểu 6 ký tự (`MinLength(6)`). Không route nào yêu cầu độ phức tạp (chữ hoa, số, ký tự đặc biệt). Ví dụ `123456` trong Swagger chỉ để minh họa.

## Chi tiết từng route

### `POST /api/v1/auth/login`

Đăng nhập bằng email và mật khẩu. Trả access token, đặt cookie refresh token

- **Auth:** Công khai, xác thực bằng email và mật khẩu
- **Handler:** `handleLogin` trong [auth.controller.ts](../../../src/auth/auth.controller.ts)
- **Mã thành công:** 201, `message` = "Login successfully"
- **Giới hạn tốc độ:** 10 lần mỗi 5 phút

**Phản hồi theo Swagger**

| Mã | Mô tả |
|---|---|
|  | Login successful. Return access token and user information and permissions. |

### `POST /api/v1/auth/register`

Đăng ký tài khoản `NORMAL USER` và gửi OTP xác thực qua email

- **Auth:** Công khai
- **Handler:** `handleRegister` trong [auth.controller.ts](../../../src/auth/auth.controller.ts)
- **Mã thành công:** 201, `message` = "Register a new user successfully"
- **Giới hạn tốc độ:** 5 lần mỗi 1 giờ

**Body: `AuthRegisterDto`** ([auth-register.dto.ts](../../../src/auth/dto/auth-register.dto.ts))

| Field | Kiểu | Bắt buộc | Validation | Ví dụ |
|---|---|---|---|---|
| `name` | string | Có | IsNotEmpty, IsString, MaxLength(100) | 'Duy' |
| `email` | string | Có | IsEmail, IsNotEmpty | 'user@example.com' |
| `password` | string | Có | IsNotEmpty | '123456' |

### `POST /api/v1/auth/verify`

Xác thực tài khoản bằng mã OTP

- **Auth:** Công khai
- **Handler:** `handleVerify` trong [auth.controller.ts](../../../src/auth/auth.controller.ts)
- **Mã thành công:** 201, `message` = "Verify account successfully"
- **Giới hạn tốc độ:** 10 lần mỗi 5 phút

**Body: `VerifyAuthDto`** ([verify-auth.dto.ts](../../../src/auth/dto/verify-auth.dto.ts))

| Field | Kiểu | Bắt buộc | Validation | Ví dụ |
|---|---|---|---|---|
| `email` | string | Có | IsNotEmpty, IsEmail | 'user@example.com' |
| `code` | string | Có | IsNotEmpty, IsString | '123456' |

**Phản hồi theo Swagger**

| Mã | Mô tả |
|---|---|
|  | Account verified successfully. |
|  | Invalid or expired code. |

### `POST /api/v1/auth/resend-code`

Gửi lại mã OTP (chờ 60 giây giữa hai lần)

- **Auth:** Công khai
- **Handler:** `handleResendCode` trong [auth.controller.ts](../../../src/auth/auth.controller.ts)
- **Mã thành công:** 201, `message` = "Resend code successfully"
- **Giới hạn tốc độ:** 5 lần mỗi 5 phút

**Body:** field `email` kiểu `string`

**Phản hồi theo Swagger**

| Mã | Mô tả |
|---|---|
|  | Verification code resent successfully. |
|  | User not found or already verified. |

### `POST /api/v1/auth/google/login`

Đăng nhập hoặc đăng ký bằng Google ID token

- **Auth:** Công khai
- **Handler:** `handleGoogleLogin` trong [auth.controller.ts](../../../src/auth/auth.controller.ts)
- **Mã thành công:** 201, `message` = "Google login successfully"
- **Giới hạn tốc độ:** 10 lần mỗi 5 phút

**Body: `AuthGoogleLoginDto`** ([auth-google-login.dto.ts](../../../src/auth/dto/auth-google-login.dto.ts))

| Field | Kiểu | Bắt buộc | Validation | Ví dụ |
|---|---|---|---|---|
| `idToken` | string | Có | IsNotEmpty, IsString | <jwt> |

**Phản hồi theo Swagger**

| Mã | Mô tả |
|---|---|
|  | Google login successful. Returns access token and user information. |

### `GET /api/v1/auth/me`

Lấy hồ sơ của người dùng hiện tại

- **Auth:** Đăng nhập (mọi vai trò)
- **Handler:** `handleGetAccount` trong [auth.controller.ts](../../../src/auth/auth.controller.ts)
- **Mã thành công:** 200, `message` = "Get user information successfully"

**Phản hồi theo Swagger**

| Mã | Mô tả |
|---|---|
|  | User profile retrieved successfully with latest data |

### `GET /api/v1/auth/refresh`

Làm mới access token bằng cookie refresh token, xoay vòng refresh token

- **Auth:** Công khai, cần cookie `refresh_token`
- **Handler:** `handleRefreshToken` trong [auth.controller.ts](../../../src/auth/auth.controller.ts)
- **Mã thành công:** 200, `message` = "Get new access token successfully"

### `POST /api/v1/auth/logout`

Đăng xuất thiết bị hiện tại: xóa phiên và cookie

- **Auth:** Đăng nhập (mọi vai trò)
- **Handler:** `handleLogout` trong [auth.controller.ts](../../../src/auth/auth.controller.ts)
- **Mã thành công:** 201, `message` = "Logout successfully"

### `POST /api/v1/auth/logout-all`

Đăng xuất mọi thiết bị: vô hiệu mọi phiên

- **Auth:** Đăng nhập (mọi vai trò)
- **Handler:** `handleLogoutAll` trong [auth.controller.ts](../../../src/auth/auth.controller.ts)
- **Mã thành công:** 201, `message` = "Logged out from all devices successfully"

### `GET /api/v1/auth/sessions`

Liệt kê các phiên đang hoạt động của người dùng

- **Auth:** Đăng nhập (mọi vai trò)
- **Handler:** `getActiveSessions` trong [auth.controller.ts](../../../src/auth/auth.controller.ts)
- **Mã thành công:** 200, `message` = "Get active sessions successfully"

### `POST /api/v1/auth/change-password`

Đổi mật khẩu (cần mật khẩu cũ)

- **Auth:** Đăng nhập (mọi vai trò)
- **Handler:** `changePassword` trong [auth.controller.ts](../../../src/auth/auth.controller.ts)
- **Mã thành công:** 201, `message` = "Change password successfully"
- **Giới hạn tốc độ:** 5 lần mỗi 5 phút

**Body: `ChangePasswordDto`** ([change-password.dto.ts](../../../src/auth/dto/change-password.dto.ts))

| Field | Kiểu | Bắt buộc | Validation | Ví dụ |
|---|---|---|---|---|
| `currentPassword` | string | Có | IsNotEmpty, IsString | '123456' |
| `newPassword` | string | Có | IsNotEmpty, IsString, MinLength(6) | 'newPass123' |

### `POST /api/v1/auth/set-password`

Đặt mật khẩu lần đầu cho tài khoản đăng ký bằng Google

- **Auth:** Đăng nhập (mọi vai trò)
- **Handler:** `setPassword` trong [auth.controller.ts](../../../src/auth/auth.controller.ts)
- **Mã thành công:** 201, `message` = "Set password successfully"
- **Giới hạn tốc độ:** 5 lần mỗi 5 phút

**Body: `SetPasswordDto`** ([set-password.dto.ts](../../../src/auth/dto/set-password.dto.ts))

| Field | Kiểu | Bắt buộc | Validation | Ví dụ |
|---|---|---|---|---|
| `newPassword` | string | Có | IsNotEmpty, IsString, MinLength(6) | 'NewPass@123' |

### `POST /api/v1/auth/forgot-password`

Yêu cầu đặt lại mật khẩu, gửi link qua email

- **Auth:** Công khai
- **Handler:** `forgotPassword` trong [auth.controller.ts](../../../src/auth/auth.controller.ts)
- **Mã thành công:** 201, `message` = "Request process successfully"

**Body: `ForgotPasswordDto`** ([forgot-password.dto.ts](../../../src/auth/dto/forgot-password.dto.ts))

| Field | Kiểu | Bắt buộc | Validation | Ví dụ |
|---|---|---|---|---|
| `email` | string | Có | IsNotEmpty, IsEmail | 'user@example.com' |

### `POST /api/v1/auth/reset-password`

Đặt mật khẩu mới bằng token từ email

- **Auth:** Công khai
- **Handler:** `resetPassword` trong [auth.controller.ts](../../../src/auth/auth.controller.ts)
- **Mã thành công:** 201, `message` = "Reset password successfully"
- **Giới hạn tốc độ:** 5 lần mỗi 5 phút

**Body: `ResetPasswordDto`** ([reset-password.dto.ts](../../../src/auth/dto/reset-password.dto.ts))

| Field | Kiểu | Bắt buộc | Validation | Ví dụ |
|---|---|---|---|---|
| `token` | string | Có | IsNotEmpty, IsString | — |
| `email` | string | Có | IsNotEmpty, IsString | — |
| `newPassword` | string | Có | IsNotEmpty, IsString, MinLength(6) | 'newPass123' |

### `DELETE /api/v1/auth/account`

Yêu cầu xóa tài khoản, sẽ bị xóa sau 30 ngày nếu không hủy

- **Auth:** Đăng nhập (mọi vai trò)
- **Handler:** `requestAccountDeletion` trong [auth.controller.ts](../../../src/auth/auth.controller.ts)
- **Mã thành công:** 200, `message` = "Account deletion scheduled successfully"
- **Giới hạn tốc độ:** 3 lần mỗi 1 giờ

**Body: `RequestAccountDeletionDto`** ([request-account-deletion.dto.ts](../../../src/auth/dto/request-account-deletion.dto.ts))

| Field | Kiểu | Bắt buộc | Validation | Ví dụ |
|---|---|---|---|---|
| `password` | string | Không | IsString, MinLength(6) | 'mySecurePassword123' |

**Phản hồi theo Swagger**

| Mã | Mô tả |
|---|---|
|  | Deletion scheduled. Returns the scheduled deletion date. |
|  | A deletion is already pending. |

### `POST /api/v1/auth/account/cancel-deletion`

Hủy yêu cầu xóa khi đang đăng nhập (xem Known Limitation)

- **Auth:** Đăng nhập (mọi vai trò)
- **Handler:** `cancelAccountDeletion` trong [auth.controller.ts](../../../src/auth/auth.controller.ts)
- **Mã thành công:** 201, `message` = "Account deletion cancelled successfully"
- **Giới hạn tốc độ:** 5 lần mỗi 5 phút

**Phản hồi theo Swagger**

| Mã | Mô tả |
|---|---|
|  | Deletion cancelled. Account is fully active again. |
|  | No pending deletion found, or grace period has expired. |

### `POST /api/v1/auth/account/cancel-deletion-by-token`

Hủy yêu cầu xóa bằng token trong email

- **Auth:** Công khai
- **Handler:** `cancelAccountDeletionByToken` trong [auth.controller.ts](../../../src/auth/auth.controller.ts)
- **Mã thành công:** 201, `message` = "Account deletion cancelled successfully"
- **Giới hạn tốc độ:** 5 lần mỗi 5 phút

**Body: `CancelDeletionByTokenDto`** ([cancel-deletion-by-token.dto.ts](../../../src/auth/dto/cancel-deletion-by-token.dto.ts))

| Field | Kiểu | Bắt buộc | Validation | Ví dụ |
|---|---|---|---|---|
| `token` | string | Có | IsString, IsNotEmpty | 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' |

**Phản hồi theo Swagger**

| Mã | Mô tả |
|---|---|
|  | Deletion cancelled. The user can now log in again. |
|  | Invalid/expired token, no pending deletion, or grace period expired. |
