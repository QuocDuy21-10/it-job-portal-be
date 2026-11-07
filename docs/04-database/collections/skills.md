# Skills (`skills`)

Danh mục kỹ năng có kiểm soát do quản trị viên quản lý. Dùng để chuẩn hóa tên kỹ năng khi tạo tin tuyển dụng và khi chấm điểm phù hợp CV.

- **Nguồn schema:** [skill.schema.ts](../../../src/skills/schemas/skill.schema.ts)
- **Phân loại dữ liệu:** không có dữ liệu cá nhân.
- **Soft-delete:** có.

## Data dictionary

| Field | Type | Required | Default | Ràng buộc | Ý nghĩa |
|---|---|---|---|---|---|
| `label` | String | Có | — | trim | Tên kỹ năng hiển thị |
| `slug` | String | Có | — | lowercase; trim | Mã định danh chữ thường sinh từ `label` |
| `aliases` | [String] | Không | `[]` | — | Các tên gọi khác dùng để khớp kỹ năng |
| `category` | String | Không | — | trim | Nhóm kỹ năng |
| `description` | String | Không | — | trim | Mô tả ngắn |
| `isActive` | Boolean | Không | `true` | — | Kỹ năng đang được dùng trong danh mục |
| `createdBy` | Mixed | Không | — | — | Người tạo bản ghi, dạng `{ _id, email }` |
| `updatedBy` | Mixed | Không | — | — | Người sửa gần nhất, dạng `{ _id, email }` |
| `deletedBy` | Mixed | Không | — | — | Người xóa mềm, dạng `{ _id, email }` |
| `createdAt` | Date | Không | — | — | Thời điểm tạo, do `timestamps` hoặc plugin |
| `updatedAt` | Date | Không | — | — | Thời điểm sửa gần nhất, do `timestamps` |
| `isDeleted` | Boolean | Không | — | — | Cờ xóa mềm. `true` nghĩa là bản ghi đã bị xóa khỏi nghiệp vụ nhưng vẫn còn trong database |
| `deletedAt` | Date | Không | — | — | Thời điểm xóa mềm |

## Indexes

| Keys | Thuộc tính | Mục đích |
|---|---|---|
| `{ label: 1, isDeleted: 1 }` | — | Kiểm tra trùng và tra cứu theo tên |
| `{ slug: 1, isDeleted: 1 }` | — | Kiểm tra trùng và tra cứu theo slug |
| `{ isActive: 1, isDeleted: 1, label: 1 }` | — | Liệt kê danh mục đang dùng, sắp theo tên |
| `{ aliases: 1, isDeleted: 1 }` | — | Khớp kỹ năng theo tên gọi khác |

Không có index unique. Tính duy nhất của `label` và `slug` do ứng dụng kiểm tra (xem bên dưới).

## Quan hệ

Không có tham chiếu ObjectId. Các collection khác lưu **tên** kỹ năng dạng chuỗi (`jobs.skills`, `subscribers.skills`, `resumes.parsedData.skills`), không lưu `_id`. Việc ghép tên với danh mục được thực hiện bởi `SkillsService.normalizeControlledSkills` ([skills.service.ts](../../../src/skills/skills.service.ts)).

## Quy tắc nghiệp vụ

- `slug` được sinh từ `label` (`buildSlug`), không do người dùng nhập.
- `assertUniqueSkill` từ chối nếu trùng `label` hoặc `slug` với bản ghi khác, và bản ghi cần đang chưa xóa mềm.
- `aliases` là tên gọi khác để khớp (ví dụ viết tắt). Tìm kiếm danh mục theo `label`, `aliases` và `slug`.
- Khi tạo tin tuyển dụng, danh sách kỹ năng được chuẩn hóa qua `normalizeControlledSkills`; giá trị không hợp lệ bị từ chối bằng `BadRequestException`.

## Known Limitation

Vì tính duy nhất chỉ kiểm tra ở tầng ứng dụng, hai request tạo cùng `label` gần như đồng thời có thể cùng qua bước kiểm tra và tạo ra bản ghi trùng. Chưa kiểm chứng bằng thử nghiệm đồng thời.

## Ví dụ document

```json
{
  "_id": "665f1a2b3c4d5e6f70819801",
  "label": "Node.js",
  "slug": "node-js",
  "aliases": ["nodejs", "node"],
  "category": "Backend",
  "description": "JavaScript runtime",
  "isActive": true,
  "isDeleted": false
}
```

Giá trị `slug` trong ví dụ là minh họa. Quy tắc sinh slug nằm ở `buildSlug`.
