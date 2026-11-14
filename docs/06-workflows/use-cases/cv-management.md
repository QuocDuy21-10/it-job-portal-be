# Use case: quản lý CV trực tuyến

## Actor và mục đích

Ứng viên (và bất kỳ người dùng đăng nhập) tạo một CV có cấu trúc để nộp hồ sơ nhanh và làm ngữ cảnh cho trợ lý AI.

## Precondition và postcondition

| | Giá trị |
|---|---|
| Precondition | Đã đăng nhập |
| Postcondition | Mỗi người có tối đa một CV trong `cvprofiles`; họ tên, email, ảnh đồng bộ với tài khoản |

## Luồng chính

1. `POST /cv-profiles/upsert` gửi dữ liệu CV (thông tin cá nhân bắt buộc `fullName`, `phone`, `email`; các mục học vấn, kinh nghiệm, kỹ năng, ngoại ngữ, dự án, chứng chỉ, giải thưởng tùy chọn) và có thể kèm ảnh đại diện.
2. Hệ thống chuẩn hóa dữ liệu, tạo hoặc cập nhật CV, đồng bộ danh tính, xóa cache ngữ cảnh chat của người dùng.
3. Người dùng xem (`GET /cv-profiles/me`), sửa (`PUT /cv-profiles/me`), kiểm tra tồn tại (`GET /cv-profiles/check`).

## Luồng thay thế

| Luồng | Mô tả |
|---|---|
| Tắt CV | `POST /cv-profiles/me/deactivate`: không dùng để nộp hồ sơ |
| Bật lại | `POST /cv-profiles/me/activate` |
| Xóa CV | `DELETE /cv-profiles/me`: **xóa thật** |

## Luồng lỗi

`400` khi dữ liệu thiếu field bắt buộc hoặc ID sai định dạng; `404` khi chưa có CV.

## Quy tắc nghiệp vụ

Ngày trong CV là chuỗi tự do; `isActive` quyết định có nộp được hay không. Xem [cv-profiles](../../03-modules/cv-profiles.md).

## Edge case và cảnh báo

- `GET /cv-profiles` và `GET /cv-profiles/:id` chỉ dành cho `SUPER ADMIN`: [user-roles](../../01-product/user-roles.md#cv-trực-tuyến-của-người-khác).
- Nộp hồ sơ sao chép CV; sửa CV sau không đổi hồ sơ đã nộp.
- Khi xóa tài khoản CV bị xóa thật, nhưng bản sao trong hồ sơ ứng tuyển thì không ([account-deletion](account-deletion.md)).
