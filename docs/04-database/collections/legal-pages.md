# Legal Pages (`legal_pages`)

Văn bản Điều khoản dịch vụ và Chính sách bảo mật, mỗi ngôn ngữ một bản ghi (tối đa 4).

- **Nguồn schema:** [legal-page.schema.ts](../../../src/site-content/schemas/legal-page.schema.ts)
- **Phân loại dữ liệu:** nội dung công khai; `updatedBy` không trả qua API công khai.
- **Timestamps:** có. Không dùng xóa mềm.
- **Nạp dữ liệu ban đầu:** `npm run seed:legal-pages` (production: `node dist/databases/seeds/run-seed-legal-pages.js`). Idempotent, chỉ thêm bản còn thiếu, ở trạng thái nháp.

## Data dictionary

| Field | Type | Required | Default | Ràng buộc | Ý nghĩa |
|---|---|---|---|---|---|
| `page` | String | Có | — | enum `terms`, `privacy` | Trang |
| `locale` | String | Có | — | enum `vi`, `en` | Ngôn ngữ |
| `title` | String | Có | — | trim, API: 1–200 ký tự | Tiêu đề |
| `description` | String | Có | — | trim, API: 1–300 ký tự | Mô tả cho kết quả tìm kiếm |
| `contentHtml` | String | Có | — | API: 1–50.000 ký tự | HTML nội dung, frontend sanitize khi render |
| `isPublished` | Boolean | Có | `false` | — | `false`: hiện nhãn nháp và `noindex` |
| `updatedBy` | Object `{ _id, email }` | Không | — | — | Người lưu gần nhất |

## Indexes

| Keys | Thuộc tính | Mục đích |
|---|---|---|
| `{ page: 1, locale: 1 }` | unique | Mỗi trang một bản ghi cho mỗi ngôn ngữ; đích của upsert |
