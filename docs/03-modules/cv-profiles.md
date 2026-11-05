# Module CV Profiles

## Overview

CV trực tuyến có cấu trúc, mỗi người dùng một bản. Là nguồn dữ liệu cho việc nộp hồ sơ nhanh, chấm điểm phù hợp và ngữ cảnh của trợ lý AI.

## Responsibilities

- Tạo hoặc cập nhật CV (`upsert`), xem, bật, tắt, xóa CV của chính mình.
- Chuẩn hóa dữ liệu nhập về dạng chuẩn (`canonicalCvProfileDto`).
- Đồng bộ họ tên, email, ảnh với tài khoản người dùng.
- Xóa cache ngữ cảnh chat của người dùng khi CV đổi.

## Architecture

| Thành phần | File |
|---|---|
| Controller (9 route, `/api/v1/cv-profiles`) | [cv-profiles.controller.ts](../../src/cv-profiles/cv-profiles.controller.ts) |
| Service | [cv-profiles.service.ts](../../src/cv-profiles/cv-profiles.service.ts) |
| Đồng bộ danh tính | [profile-identity-sync.service.ts](../../src/profile-identity/profile-identity-sync.service.ts) |

## Dependencies

Import `files` (ảnh đại diện) và `profile-identity-sync`. `resumes` và `chat` import `cv-profiles`.

## Business Rules

- Một CV mỗi người (`userId` unique, kèm cảnh báo ở [cv-profiles (collection)](../04-database/collections/cv-profiles.md#known-limitation-index-userid-bị-khai-báo-hai-lần)).
- `isActive = false` chặn việc nộp hồ sơ bằng CV này.
- Xóa CV là xóa thật, không xóa mềm.
- Khi CV đổi, service xóa khóa cache `chat_ctx:<userId>` để chat tính lại ngữ cảnh.
- Mọi truy vấn trong service bọc `new Types.ObjectId(userId)` vì `userId` là Mixed trong schema, xem [database-overview](../04-database/database-overview.md#kiểu-objectid-thực-tế).

## Data Model

Collection [cv-profiles](../04-database/collections/cv-profiles.md).

## API

Chín route: `upsert`, `me` (GET, PUT, DELETE), `check`, `me/activate`, `me/deactivate`, cùng `GET /` và `GET /:id`. Chi tiết ở `05-api/endpoints/cv-profiles.md` (Phase 3).

## Error Handling

`400` khi ID không đúng định dạng, `404` khi CV không tồn tại.

## Known Limitation

**Nghiêm trọng, ảnh hưởng dữ liệu cá nhân:** `GET /cv-profiles` và `GET /cv-profiles/:id` không kiểm tra vai trò hay quyền sở hữu, nên mọi người dùng đăng nhập đọc được CV của người khác. Bằng chứng và phạm vi ở [user-roles](../01-product/user-roles.md#known-limitation-cv-của-mọi-người-dùng-đọc-được-bởi-bất-kỳ-ai-đã-đăng-nhập).

Các giới hạn khác của schema (ngày dạng chuỗi, index khai báo hai lần) ở tài liệu collection.

## Testing

1 file test (`cv-profiles.service.spec.ts`). Không có test cho phân quyền route.

## Source References

[src/cv-profiles/](../../src/cv-profiles/).
