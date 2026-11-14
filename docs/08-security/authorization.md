# Bảo mật: phân quyền

Mô hình và ma trận quyền ở [user-roles](../01-product/user-roles.md); cài đặt ở [authorization](../03-modules/authorization.md). Tài liệu này tập hợp các điểm **rủi ro**.

## Cơ chế thực thi

`JwtAuthGuard` (mặc định mọi route cần JWT) cộng `RolesGuard` (theo `@Roles`) đăng ký toàn cục, cộng kiểm tra sở hữu trong service. CASL **không** được thực thi.

## Rủi ro đã xác minh

| # | Rủi ro | Bằng chứng | Mức | Chi tiết |
|---|---|---|---|---|
| 2 | Ảnh tải lên (avatar, logo) truy cập được không cần đăng nhập nếu biết URL. File CV thì không: nằm ngoài `public/` và chỉ trả qua endpoint có kiểm tra quyền | `useStaticAssets` phục vụ `public/`; tên file là `randomUUID()` | Thấp (ảnh công khai theo thiết kế) | [data-protection](data-protection.md#file-tải-lên) |
| 5 | CASL định nghĩa nhưng không thực thi, dễ gây tin nhầm rằng quyền được bảo đảm | `grep` | Trung bình (hiểu nhầm) | [authorization](../03-modules/authorization.md) |
| 7 | Mã lỗi quyền không nhất quán (`400` thay vì `403`) | Nhiều nơi | Thấp | [api-overview](../05-api/api-overview.md#định-dạng-lỗi) |
| 8 | Email gợi ý và email tin mới có thể nhắc tới tin chưa duyệt | Processor không lọc `approvalStatus` | Thấp (nghiệp vụ) | [queues](../03-modules/queues.md#job-recommendation) |

## Điều đã kiểm tra là đúng

Các route nhạy cảm sau có kiểm tra sở hữu hoặc vai trò đúng như đọc từ mã: `GET /resumes/:id/analysis` (chủ hồ sơ hoặc `SUPER ADMIN`), nhóm `subscribers` (theo chủ sở hữu), nhóm `notifications` (luôn gắn `userId`), `GET /companies/:id` cho HR (chỉ công ty mình), `GET /cv-profiles` và `GET /cv-profiles/:id` (chỉ `SUPER ADMIN`), `PATCH /resumes/:id` cho HR (chỉ hồ sơ công ty mình), nhóm quản trị người dùng và kỹ năng (`SUPER ADMIN`).

## Chưa xác minh

- Chưa thử khai thác thực tế bất kỳ rủi ro nào ở trên (không chạy được MongoDB). Mọi mục đều từ đọc mã.
- Chưa rà soát từng handler còn lại ngoài các route đã nêu để tìm lỗi IDOR khác; danh sách route và quyền ở [05-api](../05-api/api-overview.md).
- Kiểm thử phân quyền tự động mới phủ một phần route: `test/tenant-authorization.e2e-spec.ts`, `test/resumes.e2e-spec.ts`, `test/auth.e2e-spec.ts`.
