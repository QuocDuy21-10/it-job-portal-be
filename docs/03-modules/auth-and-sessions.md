# Module Auth và Sessions

## Overview

Xử lý toàn bộ vòng đời danh tính: đăng ký, xác thực OTP, đăng nhập (mật khẩu và Google), cấp và làm mới token, quản lý phiên theo thiết bị, đổi hoặc đặt lại mật khẩu, và xóa tài khoản có thời gian chờ. `sessions` là module nhỏ đi kèm, lưu và quản lý các phiên.

## Responsibilities

- Cấp **access token** (JWT, trả trong body) và **refresh token** (JWT, đặt trong cookie `refresh_token`).
- Lưu phiên, giới hạn 5 phiên đồng thời, xoay vòng refresh token.
- Xác thực email bằng OTP, chống đoán mã.
- Kiểm tra trạng thái tài khoản ở mọi request.

## Architecture

| Thành phần | File | Vai trò |
|---|---|---|
| Controller | [auth.controller.ts](../../src/auth/auth.controller.ts) | 17 route dưới `/api/v1/auth` |
| Facade | [auth.service.ts](../../src/auth/auth.service.ts) | Ủy quyền cho 5 service con |
| Phiên và token | [auth-session.service.ts](../../src/auth/services/auth-session.service.ts) | Tạo, làm mới, hủy phiên, đặt cookie |
| Thông tin đăng nhập | [auth-credentials.service.ts](../../src/auth/services/auth-credentials.service.ts) | Kiểm tra mật khẩu, đổi, đặt, quên mật khẩu |
| Xác thực email | [auth-verification.service.ts](../../src/auth/services/auth-verification.service.ts) | Sinh, gửi, kiểm tra OTP |
| Google | [auth-google.service.ts](../../src/auth/services/auth-google.service.ts) | Xác minh ID token Google |
| Xóa tài khoản | [auth-account-deletion.service.ts](../../src/auth/services/auth-account-deletion.service.ts) | Đặt lịch, hủy, token hủy |
| Passport | [passport/](../../src/auth/passport/) | Ba chiến lược: `local`, `jwt`, `jwt-refresh` |
| Guard | [guards/](../../src/auth/guards/) | `JwtAuthGuard`, `LocalAuthGuard`, `JwtRefreshGuard` |
| Sessions | [sessions.service.ts](../../src/sessions/sessions.service.ts) | Truy cập collection `sessions` |

## Dependencies

`auth` import `users`, `sessions` (xem [module-dependencies](../02-architecture/module-dependencies.md)). Dùng thêm `MailService` để gửi OTP và email xóa tài khoản, Redis cho OTP, và `AccountDeletionQueueService` để lên lịch xóa.

## Business Rules

| Chủ đề | Quy tắc | Nguồn |
|---|---|---|
| OTP | 6 chữ số ngẫu nhiên bằng `crypto.randomInt`. Lưu HMAC-SHA256 trong Redis `otp:value:<email>` hiệu lực 300 giây | [otp.utils.ts](../../src/auth/utils/otp.utils.ts), verification service |
| Chống đoán OTP | Đếm `otp:attempts:<email>`, từ 5 lần sai trở lên bị `403`. Chờ 60 giây giữa hai lần gửi (`otp:cooldown:<email>`) | verification service |
| Access token | Ký bằng `JWT_ACCESS_TOKEN_SECRET`, thời hạn `JWT_ACCESS_EXPIRES_IN`. Trả trong body phản hồi | session service |
| Refresh token | Ký bằng `JWT_REFRESH_TOKEN_SECRET`, đặt cookie `refresh_token`: `httpOnly`, `secure` khi `NODE_ENV=production`, `sameSite=strict`, `maxAge` theo `JWT_REFRESH_EXPIRES_IN` | `setRefreshCookie` |
| Lưu phiên | Chỉ lưu HMAC-SHA256 của refresh token, không lưu token thô | [sessions.service.ts](../../src/sessions/sessions.service.ts) |
| Xoay vòng | Mỗi lần làm mới: xóa phiên cũ rồi tạo phiên mới với refresh token mới | `refreshAccessToken` |
| Giới hạn phiên | Tối đa 5, xóa phiên có `lastUsedAt` cũ nhất | `enforceSessionLimit` |
| Trạng thái tài khoản | Mỗi request kiểm tra `isActive`, `isLocked`, `isDeleted`, `scheduledDeletionAt` | [assert-authenticated-account-state.util.ts](../../src/auth/utils/assert-authenticated-account-state.util.ts) |
| Google | Xác minh ID token với `GOOGLE_CLIENT_ID`, yêu cầu `email_verified` | [auth-google.service.ts](../../src/auth/services/auth-google.service.ts) |
| Xóa tài khoản | Chờ 30 ngày. Trong thời gian chờ, đăng nhập bị `403` trừ khi hủy | deletion service |

`JwtStrategy.validate` tải người dùng từ database ở mỗi request để kiểm tra trạng thái ([jwt.strategy.ts](../../src/auth/passport/jwt.strategy.ts)). Nhờ đó khóa tài khoản có hiệu lực ngay cả khi access token chưa hết hạn, đổi lại mỗi request có thêm một lần truy vấn.

## Data Model

Collection [users](../04-database/collections/users.md) và [sessions](../04-database/collections/sessions.md). OTP lưu ở Redis, không ở MongoDB.

## API

Chi tiết từng route: `05-api/endpoints/auth.md` (Phase 3). Giới hạn riêng bằng `@Throttle` (ghi đè throttler `default`, hai throttler `burst` 5/giây và `sustained` 20/10 giây khai báo ở `AppModule` vẫn áp dụng):

| Route | Giới hạn `default` |
|---|---|
| `POST /auth/login`, `POST /auth/verify`, `POST /auth/google/login` | 10 lần mỗi 5 phút |
| `POST /auth/resend-code`, `POST /auth/change-password`, `POST /auth/set-password`, `POST /auth/reset-password`, `POST /auth/account/cancel-deletion`, `POST /auth/account/cancel-deletion-by-token` | 5 lần mỗi 5 phút |
| `POST /auth/register` | 5 lần mỗi giờ |
| `DELETE /auth/account` | 3 lần mỗi giờ |
| `POST /auth/forgot-password` | Không có giới hạn riêng, chỉ chịu throttler toàn cục |

Bảng ghép theo từng handler, đọc từ [auth.controller.ts](../../src/auth/auth.controller.ts).

## Processing Flow

Sequence đăng nhập, làm mới token và xác thực OTP nằm ở `06-workflows/sequences/refresh-token.md` và `06-workflows/use-cases/authentication.md` (Phase 3).

## Error Handling

| Tình huống | Phản hồi |
|---|---|
| Chưa kích hoạt khi đăng nhập | `400` "Tài khoản chưa được kích hoạt" |
| Bị khóa, bị xóa, hoặc vô hiệu | `401` |
| Đang chờ xóa | `403` |
| OTP sai | `400` kèm số lần còn lại |
| OTP quá 5 lần sai | `403` |
| Gửi lại OTP khi còn cooldown | `400` kèm số giây phải chờ |

## Known Limitation

| Vấn đề | Chi tiết |
|---|---|
| Token đặt lại mật khẩu và hủy xóa tài khoản lưu qua `CACHE_MANAGER` | `CACHE_MANAGER` chạy trong bộ nhớ (đã kiểm chứng), nên các link này mất hiệu lực khi backend khởi động lại và không dùng được giữa nhiều instance. Xem [data-flow](../02-architecture/data-flow.md#known-limitation-cache_manager-chạy-trong-bộ-nhớ-không-phải-redis) |
| Index trùng ở `sessions` | TTL của `expiresAt` có thể không tồn tại, xem [sessions](../04-database/collections/sessions.md#known-limitation-index-trùng-key-pattern) |
| Truy vấn người dùng mỗi request | Chi phí đổi lấy khóa tài khoản có hiệu lực tức thì |
| **Hủy xóa tài khoản bằng đăng nhập không dùng được** | `POST /auth/account/cancel-deletion` yêu cầu JWT, nhưng `JwtStrategy.validate` gọi `assertAuthenticatedAccountState(user, 'access')` và ném `403` khi `scheduledDeletionAt` còn ở tương lai. Người dùng đang chờ xóa vì vậy không qua được guard để hủy. Đường còn lại là `POST /auth/account/cancel-deletion-by-token`, nhưng token nằm trong `CACHE_MANAGER` (bộ nhớ), mất khi backend khởi động lại. Kết luận từ đọc mã ([jwt.strategy.ts](../../src/auth/passport/jwt.strategy.ts), [assert-authenticated-account-state.util.ts](../../src/auth/utils/assert-authenticated-account-state.util.ts), [auth-account-deletion.service.ts](../../src/auth/services/auth-account-deletion.service.ts)), chưa chạy thử vì cần MongoDB. Service có test riêng nhưng không bao quát đường đi qua guard |

## Testing

9 file test trong `src/auth/` và 1 trong `src/sessions/`, gồm các service con, util trạng thái tài khoản và bộ dữ liệu test dùng chung ([auth-test-data.ts](../../src/auth/testing/auth-test-data.ts)). Chưa ghi nhận phạm vi bao phủ chi tiết.

## Source References

[src/auth/](../../src/auth/), [src/sessions/](../../src/sessions/), [jwt-auth.guard.ts](../../src/auth/guards/jwt-auth.guard.ts).
