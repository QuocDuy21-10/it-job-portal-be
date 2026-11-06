# Module Skills

## Overview

Danh mục kỹ năng có kiểm soát. Chuẩn hóa tên kỹ năng để tin tuyển dụng, đăng ký gợi ý, CV và chấm điểm dùng cùng một cách gọi.

## Responsibilities

- CRUD kỹ năng (quản trị viên).
- Cung cấp danh mục công khai (`catalog`) và kỹ năng phổ biến (`popular`).
- `normalizeControlledSkills`: ghép tên người dùng nhập với danh mục, từ chối giá trị không hợp lệ.
- Cung cấp bản đồ bí danh (`aliases`) cho nạp tin ngoài và chấm điểm.

## Architecture

| Thành phần | File |
|---|---|
| Controller (8 route, `/api/v1/skills`) | [skills.controller.ts](../../src/skills/skills.controller.ts) |
| Service | [skills.service.ts](../../src/skills/skills.service.ts) |

## Dependencies

Không import module nghiệp vụ nào. `jobs`, `matching`, `subscribers`, `job-ingestion` import `skills`.

## Business Rules

- Tạo hoặc sửa từ chối nếu trùng `label` hoặc `slug` (`assertUniqueSkill`).
- `slug` sinh từ `label` (chữ thường, ký tự `+` đổi thành ` plus `), người dùng không nhập.
- `normalizeControlledSkills` tra từng giá trị vào bản đồ bí danh. Giá trị khớp được đổi về nhãn chuẩn và loại trùng. **Giá trị không khớp làm cả yêu cầu thất bại** với `400` `Unknown skills: ... Please use active skills from the catalog.` Đây là đường dùng cho tin tuyển dụng và đăng ký gợi ý.
- `normalizeExtractedSkills` là đường mềm hơn, dành cho kỹ năng trích từ CV: kỹ năng không khớp được trả về trong nhóm riêng (`unmappedSkills` của hồ sơ) thay vì gây lỗi.
- `aliases` được chuẩn hóa khi lưu: gọn khoảng trắng, bỏ giá trị rỗng, bỏ alias trùng với `label`, loại trùng lặp.
- `catalog` và `popular` công khai (`@Public`); các route còn lại chỉ `SUPER ADMIN`.
- Danh mục dùng `CACHE_MANAGER`, nên cache này nằm trong bộ nhớ, xem [data-flow](../02-architecture/data-flow.md#known-limitation-cache_manager-chạy-trong-bộ-nhớ-không-phải-redis).

## Data Model

Collection [skills](../04-database/collections/skills.md).

## API

`GET /skills/catalog`, `GET /skills/popular` (công khai); `POST`, `GET`, `GET :id`, `PATCH :id`, `DELETE :id`, `DELETE bulk` (quản trị viên). Chi tiết ở `05-api/endpoints/skills.md` (Phase 3).

## Error Handling

`400` khi trùng hoặc kỹ năng không hợp lệ, `404` khi không tìm thấy (`Skill with id ... not found`).

## Known Limitation

Tính duy nhất chỉ kiểm tra ở ứng dụng, xem [skills (collection)](../04-database/collections/skills.md#known-limitation).

## Testing

1 file test (`skills.service.spec.ts`).

## Source References

[src/skills/](../../src/skills/).
