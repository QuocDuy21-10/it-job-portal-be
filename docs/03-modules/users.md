# Module Users

## Overview

Quản lý tài khoản người dùng cho quản trị viên (CRUD, khóa, mở khóa, xóa hàng loạt) và các tùy chọn cá nhân của ứng viên (lưu tin, theo dõi công ty).

## Responsibilities

- CRUD người dùng, chỉ `SUPER ADMIN`.
- Khóa và mở khóa tài khoản, kèm vô hiệu mọi phiên của người bị khóa.
- Lưu tin và theo dõi công ty cho người dùng đang đăng nhập.
- Tạo tài khoản khi đăng ký (băm mật khẩu bcryptjs, gán `NORMAL USER`).

## Architecture

| Thành phần | File |
|---|---|
| Controller (14 route, `/api/v1/users`) | [users.controller.ts](../../src/users/users.controller.ts) |
| Service chính | [users.service.ts](../../src/users/users.service.ts) |
| Quản lý tài khoản (khóa, lên lịch xóa) | [user-account.service.ts](../../src/users/services/user-account.service.ts) |
| Tùy chọn cá nhân (lưu tin, theo dõi) | [user-preferences.service.ts](../../src/users/services/user-preferences.service.ts) |
| Truy cập dữ liệu | [user.repository.ts](../../src/users/repositories/user.repository.ts) |

## Dependencies

`users` import `sessions` và `profile-identity-sync`. `auth`, `chat`, `statistics` import `users`. Xem [module-dependencies](../02-architecture/module-dependencies.md).

## Business Rules

- Mật khẩu băm bằng `bcryptjs` với salt 10 ([users.service.ts](../../src/users/users.service.ts)).
- Không tự khóa tài khoản của chính mình; không khóa tài khoản đã khóa; không mở khóa tài khoản chưa khóa.
- Khóa tài khoản gọi `deactivateAllUserSessions`, nên người bị khóa mất mọi phiên ngay.
- Lọc danh sách cho phép `name`, `email`, `company.name` (tập `TEXT_FILTER_FIELDS`).
- Lưu tin, theo dõi công ty: mảng `savedJobs`, `companyFollowed` trong document `users`.

## Data Model

Collection [users](../04-database/collections/users.md). Có snapshot công ty nhúng (`company`).

## API

14 route: tạo, liệt kê, xem, sửa, khóa, mở khóa, xóa, xóa hàng loạt (chỉ `SUPER ADMIN`); `save-job`, `saved-jobs`, `follow-company`, `following-companies` (người dùng đăng nhập). Chi tiết ở `05-api/endpoints/users.md` (Phase 3).

## Error Handling

| Tình huống | Lỗi |
|---|---|
| Khóa chính mình | `400` "You cannot lock your own account" |
| Khóa tài khoản đã khóa | `400` |
| Người dùng không tồn tại | `404` |

## Known Limitation

- Dữ liệu tin đã lưu và công ty theo dõi là mảng `_id`, không có ràng buộc: tin hoặc công ty bị xóa mềm vẫn nằm trong mảng. Cách `GET saved-jobs` xử lý: `Chưa xác minh`.
- Xóa người dùng không tự dọn dữ liệu liên quan, xem [collection-relationships](../04-database/collection-relationships.md#điều-cần-chú-ý-khi-xóa-dữ-liệu).

## Testing

5 file test trong `src/users/`. Chưa ghi nhận độ bao phủ.

## Source References

[src/users/](../../src/users/), [src/profile-identity/](../../src/profile-identity/).
