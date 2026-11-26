# Module Site Content

## Overview

`SUPER ADMIN` quản lý ảnh banner trang chủ và nội dung Điều khoản dịch vụ, Chính sách bảo mật (vi/en) từ khu vực quản trị thay vì hằng số trong frontend.

## Responsibilities

- Lưu các slide hero trang chủ (ảnh desktop, ảnh mobile tùy chọn, nội dung vi/en tùy chọn kèm nút), thứ tự, lịch hiển thị và công tắc bật/tắt; không slide nào hiển thị thì frontend dùng ảnh mặc định.
- Lưu 4 văn bản pháp lý (`terms`, `privacy` × `vi`, `en`) dạng HTML kèm cờ nháp/công bố.

## Architecture

| Thành phần | File | Vai trò |
|---|---|---|
| Banners | [banners.controller.ts](../../src/site-content/banners.controller.ts), [banners.service.ts](../../src/site-content/banners.service.ts) | Danh sách, thêm, sửa, sắp xếp, bật/tắt, xóa |
| Legal pages | [legal-pages.controller.ts](../../src/site-content/legal-pages.controller.ts), [legal-pages.service.ts](../../src/site-content/legal-pages.service.ts) | Đọc công khai, ghi (upsert) |
| Module | [site-content.module.ts](../../src/site-content/site-content.module.ts) | Import `FilesModule` để dựng URL và xóa file |

## Business Rules

- Ảnh banner tải lên bằng `POST /files/upload` với thư mục `banner` (chỉ `SUPER ADMIN`), sau đó `POST /site-content/banners` đăng ký tên file. Tên file phải có sẵn trong thư mục, nếu không `400`.
- Tối đa 5 slide bật (`MAX_ACTIVE_SLIDES`); hai admin bật cùng lúc có thể vượt giới hạn (chấp nhận được).
- Hiển thị khi bật và `startAt ≤ now < endAt` (mốc trống là không giới hạn); luật nằm ở `banner-visibility.ts`.
- Xóa slide là xóa thật bản ghi và các file ảnh; thay ảnh thì file cũ bị xóa sau khi lưu.
- Văn bản pháp lý chưa công bố (`isPublished: false`) vẫn đọc được qua API; frontend hiện nhãn bản nháp và chặn lập chỉ mục.
- HTML được lưu nguyên văn. **Frontend sanitize trước khi render**, backend không làm việc này.
- Frontend cache phản hồi công khai 60 giây nên thay đổi hiện sau khoảng 1 phút.

## Data Model

[banners](../04-database/collections/banners.md), [legal_pages](../04-database/collections/legal-pages.md).

## API

[site-content](../05-api/endpoints/site-content.md).
