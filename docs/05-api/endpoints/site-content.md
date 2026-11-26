# API Site Content

Tiền tố `/api/v1/site-content`. Controller: [banners.controller.ts](../../../src/site-content/banners.controller.ts), [legal-pages.controller.ts](../../../src/site-content/legal-pages.controller.ts). Module: `03-modules/site-content.md`. Collection: [banners](../../04-database/collections/banners.md), [legal-pages](../../04-database/collections/legal-pages.md).

Quyền `SUPER ADMIN` đặt ở từng method (không ở class) vì có route `@Public()`.

## Danh sách route

| Route | Auth | Mô tả |
|---|---|---|
| `GET /banners/public` | Công khai | Slide đang hiển thị theo thứ tự: `{ id, imageUrl, mobileImageUrl, content }` |
| `GET /banners/active` | Công khai | **Sắp bỏ.** `{ imageUrl }` của slide hiển thị đầu tiên, hoặc `null` |
| `GET /banners` | SUPER ADMIN | Mọi slide theo thứ tự, kèm `status` (`hidden`, `scheduled`, `live`, `ended`) |
| `POST /banners` | SUPER ADMIN | Thêm slide (ẩn, cuối danh sách): `name`, `fileName`, `mobileFileName?`, `content?`, `startAt?`, `endAt?` |
| `PUT /banners/order` | SUPER ADMIN | `{ ids }`: thứ tự mới, đủ mỗi slide một lần |
| `PATCH /banners/:id` | SUPER ADMIN | Sửa slide; ảnh bị thay sẽ bị xóa sau khi lưu |
| `PATCH /banners/:id/visibility` | SUPER ADMIN | `{ isActive }`; tối đa 5 slide bật |
| `PATCH /banners/:id/activate` | SUPER ADMIN | **Sắp bỏ.** Bật slide (không tắt slide khác) |
| `DELETE /banners/active` | SUPER ADMIN | **Sắp bỏ.** Tắt mọi slide (trang chủ dùng ảnh mặc định) |
| `DELETE /banners/:id` | SUPER ADMIN | Xóa slide (kể cả đang hiển thị) cùng hai file ảnh |
| `GET /legal/:page/:locale` | Công khai | Một văn bản (`page`: `terms`, `privacy`; `locale`: `vi`, `en`), không kèm `updatedBy` |
| `PUT /legal/:page/:locale` | SUPER ADMIN | Tạo hoặc thay nội dung (`title`, `description`, `contentHtml`, `isPublished`) |

## Lỗi

| Mã | Khi nào |
|---|---|
| 400 | `page`/`locale` ngoài danh sách; body sai (độ dài, `fileName` sai mẫu); `id` sai định dạng; `fileName` chưa được tải lên thư mục `banner`; `content` thiếu một ngôn ngữ; nhãn/liên kết nút không đi cùng nhau; liên kết không phải `/...` hay `https://`; `endAt` không sau `startAt`; `ids` của `PUT /order` không khớp danh sách |
| 403 | Không phải `SUPER ADMIN` ở route quản trị (kể cả upload vào thư mục `banner`) |
| 404 | Banner không tồn tại; văn bản chưa từng được ghi |
| 409 | Bật slide thứ 6; bật slide khi chưa chạy migration `banner-slides` (index cũ) |

Thông báo thành công bằng tiếng Việt qua `@ResponseMessage`. Quy trình upload: `POST /files/upload` với header `X-Folder-Type: banner`, rồi `POST /banners`.
