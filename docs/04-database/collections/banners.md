# Banners (`banners`)

Thư viện ảnh banner trang chủ. Tối đa một bản ghi `isActive`.

- **Nguồn schema:** [banner.schema.ts](../../../src/site-content/schemas/banner.schema.ts)
- **Phân loại dữ liệu:** nội dung công khai; `createdBy` chứa email người tạo (không công khai, không trả qua API công khai).
- **Timestamps:** có (`createdAt`, `updatedAt`). Không dùng xóa mềm: xóa banner là xóa thật.

## Data dictionary

| Field | Type | Required | Default | Ràng buộc | Ý nghĩa |
|---|---|---|---|---|---|
| `name` | String | Có | — | trim, tối đa 100 | Tên gọi trong thư viện |
| `fileName` | String | Có | — | `<uuid>.(jpg\|png\|webp)` | Tên file trong `public/images/banner/` |
| `isActive` | Boolean | Có | `false` | — | Đang hiển thị ở trang chủ |
| `createdBy` | Object `{ _id, email }` | Không | — | — | Người thêm |

## Indexes

| Keys | Thuộc tính | Mục đích |
|---|---|---|
| `{ isActive: 1 }` | unique, `partialFilterExpression: { isActive: true }` | Chỉ một banner hiển thị |
