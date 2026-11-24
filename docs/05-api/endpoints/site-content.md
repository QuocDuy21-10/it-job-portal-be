# API Site Content

Tiền tố `/api/v1/site-content`. Controller: [banners.controller.ts](../../../src/site-content/banners.controller.ts), [legal-pages.controller.ts](../../../src/site-content/legal-pages.controller.ts). Module: `03-modules/site-content.md`. Collection: [banners](../../04-database/collections/banners.md), [legal-pages](../../04-database/collections/legal-pages.md).

Quyền `SUPER ADMIN` đặt ở từng method (không ở class) vì có route `@Public()`.

## Danh sách route

| Route | Auth | Mô tả |
|---|---|---|
| `GET /banners/active` | Công khai | `{ imageUrl }` của banner đang hiển thị, hoặc `null` |
| `GET /banners` | SUPER ADMIN | Danh sách banner, mới nhất trước |
| `POST /banners` | SUPER ADMIN | Thêm ảnh đã tải lên (`{ name, fileName }`) vào thư viện |
| `PATCH /banners/:id/activate` | SUPER ADMIN | Đặt banner hiển thị, thay banner cũ |
| `DELETE /banners/active` | SUPER ADMIN | Bỏ banner hiển thị, dùng ảnh mặc định |
| `DELETE /banners/:id` | SUPER ADMIN | Xóa banner không hiển thị cùng file ảnh |
| `GET /legal/:page/:locale` | Công khai | Một văn bản (`page`: `terms`, `privacy`; `locale`: `vi`, `en`), không kèm `updatedBy` |
| `PUT /legal/:page/:locale` | SUPER ADMIN | Tạo hoặc thay nội dung (`title`, `description`, `contentHtml`, `isPublished`) |

## Lỗi

| Mã | Khi nào |
|---|---|
| 400 | `page`/`locale` ngoài danh sách; body sai (độ dài, `fileName` sai mẫu); `id` sai định dạng; `fileName` chưa được tải lên thư mục `banner` |
| 403 | Không phải `SUPER ADMIN` ở route quản trị (kể cả upload vào thư mục `banner`) |
| 404 | Banner không tồn tại; văn bản chưa từng được ghi |
| 409 | Xóa banner đang hiển thị; hai lần kích hoạt đồng thời |

Thông báo thành công bằng tiếng Việt qua `@ResponseMessage`. Quy trình upload: `POST /files/upload` với header `folder_type: banner`, rồi `POST /banners`.
