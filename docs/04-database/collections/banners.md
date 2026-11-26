# Banners (`banners`)

Slide hero trang chủ. Tối đa 5 bản ghi `isActive` (kiểm tra ở service).

- **Nguồn schema:** [banner.schema.ts](../../../src/site-content/schemas/banner.schema.ts)
- **Phân loại dữ liệu:** nội dung công khai; `createdBy` và `updatedBy` chứa email quản trị viên (không công khai, không trả qua API công khai).
- **Timestamps:** có (`createdAt`, `updatedAt`). Không dùng xóa mềm: xóa banner là xóa thật.

## Data dictionary

| Field | Type | Required | Default | Ràng buộc | Ý nghĩa |
|---|---|---|---|---|---|
| `name` | String | Có | — | trim, tối đa 100 | Tên chỉ quản trị viên thấy |
| `fileName` | String | Có | — | `<uuid>.(jpg\|png\|webp)` | Tên file trong `public/images/banner/` |
| `isActive` | Boolean | Có | `false` | tối đa 5 bản ghi bật | Công tắc bật/tắt; còn phụ thuộc lịch hiển thị |
| `createdBy` | Object `{ _id, email }` | Không | — | — | Người thêm |
| `mobileFileName` | String \| null | Không | `null` | như `fileName` | Ảnh cho điện thoại; trống thì dùng ảnh desktop |
| `content` | Object \| null | Không | `null` | `{ vi, en }`, mỗi ngôn ngữ `title` ≤ 80, `description` ≤ 160, `ctaLabel` ≤ 30, `ctaUrl` ≤ 500 | Nội dung chiến dịch |
| `order` | Number | Có | — | — | Thứ tự hiển thị, nhỏ trước |
| `startAt`, `endAt` | Date \| null | Không | `null` | `endAt > startAt` | Lịch hiển thị; `endAt` không tính |
| `updatedBy` | Object `{ _id, email }` | Không | — | — | Người sửa gần nhất |

## Indexes

| Keys | Thuộc tính | Mục đích |
|---|---|---|
| `{ order: 1 }` | — | Sắp xếp danh sách và carousel |

Index unique `isActive_1` cũ bị xóa bằng migration `banner-slides` (xem [deployment](../../09-infrastructure/deployment.md)).
