# Module Companies

## Overview

Quản lý hồ sơ công ty tuyển dụng, tạo snapshot công ty để nhúng vào tin và người dùng, và dọn logo mồ côi theo lịch.

## Responsibilities

- CRUD công ty, cache danh sách.
- Cung cấp `CompanySnapshot` ([company-snapshot.util.ts](../../src/companies/company-snapshot.util.ts)).
- Danh sách công ty tuyển nhiều nhất (`top-hiring`) cho trang chủ.
- Cron dọn file logo không còn được tham chiếu.

## Architecture

| Thành phần | File |
|---|---|
| Controller (8 route, `/api/v1/companies`) | [companies.controller.ts](../../src/companies/companies.controller.ts) |
| Service | [companies.service.ts](../../src/companies/companies.service.ts) |
| Repository | [company.repository.ts](../../src/companies/repositories/company.repository.ts) |
| Snapshot | [company-snapshot.util.ts](../../src/companies/company-snapshot.util.ts) |

## Dependencies

Import `files` (xóa file logo) và `statistics` (xóa cache số liệu). `jobs`, `chat` import `companies`.

## Business Rules

| Quy tắc | Chi tiết |
|---|---|
| Tạo công ty | Chỉ `SUPER ADMIN`. Từ chối nếu trùng `name` (`400` "already exists") |
| Sửa công ty | `SUPER ADMIN` hoặc `HR`. HR phải gắn với công ty và chỉ sửa công ty của mình, ngược lại `403` |
| Xem chi tiết | HR chỉ xem công ty của mình, ngược lại `400` "You can only view your own company" |
| Danh sách | HR chỉ thấy công ty của mình. Các vai trò khác thấy tất cả |
| Đổi logo | Xóa file logo cũ khi logo mới khác logo cũ |
| Cron dọn logo | 2 giờ sáng (`Asia/Ho_Chi_Minh`), xóa logo không công ty nào dùng |
| Cache | Danh sách công ty cache 3 phút trong Redis qua `ListCacheService`, xóa khi dữ liệu đổi |

## Data Model

Collection [companies](../04-database/collections/companies.md), và tài liệu nhúng `CompanySnapshot`.

## API

8 route. `GET` công khai với `@OptionalAuth`; `POST`, xóa chỉ `SUPER ADMIN`; `PATCH` cho `SUPER ADMIN` và `HR`. Chi tiết ở `05-api/endpoints/companies.md` (Phase 3).

## Error Handling

`404` khi công ty không tồn tại, `400` khi trùng tên, `403` khi HR không thuộc công ty.

## Known Limitation

- Snapshot trong `jobs.company` và `users.company` **không** được cập nhật khi sửa công ty, xem [companies](../04-database/collections/companies.md#tài-liệu-nhúng-companysnapshot).
- Mã trạng thái không nhất quán: sai quyền ở một nơi là `400`, ở nơi khác là `403`.

## Testing

2 file test trong `src/companies/`.

## Source References

[src/companies/](../../src/companies/).
