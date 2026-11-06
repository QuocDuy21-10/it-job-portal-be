# ADR-0002: Vai trò là enum `ERole`, không phải entity Role

- **Trạng thái:** Accepted
- **Bằng chứng:** Commit `773dbcd` (2026-06-06) "refactor(rbac): replace Role entity with ERole enum"; [role.enum.ts](../../src/casl/enums/role.enum.ts); thư mục `src/roles/` rỗng còn lại.

## Bối cảnh

Trước đó vai trò là một entity riêng (model, schema, DTO, controller, service, dữ liệu seed) và được populate vào JWT.

## Quyết định

Thay bằng enum `ERole` với ba giá trị cố định `SUPER ADMIN`, `HR`, `NORMAL USER`, lưu thẳng dưới dạng chuỗi ở `users.role`. Guard và service so sánh `user.role` với `ERole`. Mô tả trong commit: bỏ populate vai trò trong strategy JWT, trả vai trò dạng chuỗi.

## Hệ quả

Đơn giản hóa xác thực và bỏ truy vấn thêm. Đánh đổi: vai trò và quyền không còn cấu hình được qua dữ liệu; thêm vai trò mới cần sửa code. Dấu vết còn lại: thư mục `src/roles/` rỗng, `ESubject` còn `'Role'` và `'Permission'`, và ma trận CASL không được thực thi ([authorization](../03-modules/authorization.md)).

## Mức tin cậy của lý do

Có bằng chứng trực tiếp trong commit.
