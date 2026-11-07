# Quy trình phát triển

Quy ước làm việc rút từ cấu hình trong repository. Quy ước viết tài liệu: [documentation-guide](documentation-guide.md). Quy ước code chi tiết nằm ở thư mục `agent_docs/` (tài liệu tham khảo, không thuộc nhóm tài liệu chính thức): `code_conventions.md`, `NAMING_CONVENTIONS.md`, `SENIOR_BACKEND_PRACTICES.md`, `service_architecture.md`.

## Thiết lập

[quick-start](../00-getting-started/quick-start.md), [local-development](../00-getting-started/local-development.md). Dùng Node 24 (`nvm use`).

## Nhánh và commit

- Nhánh theo loại thay đổi, ví dụ `feat/external-job-lifecycle`, `chore/toolchain-and-safety-net`, `docs/production-documentation`; nhánh chính là `main`.
- Commit theo **Conventional Commits** (`feat`, `fix`, `chore`, `refactor`, `docs`, `test`, `style`, `ci`). Hook `commit-msg` chạy `commitlint` với `@commitlint/config-conventional` ([commitlint.config.js](../../commitlint.config.js)).
- Hook `pre-commit` chạy `lint-staged`: `eslint --fix` trên file `*.ts` đã staged.
- Pull Request vào `main`; CI chạy tự động ([ci-cd](../09-infrastructure/ci-cd.md)).

## Trước khi mở Pull Request

```bash
npx tsc --noEmit        # kiểm tra kiểu
npm run lint            # ESLint, tự sửa (--fix)
npm test                # unit test
npm run build
```

CI chạy cùng các bước này (dùng `eslint` không `--fix`), thêm `npm audit --omit=dev --audit-level=critical` và build image `production`. Nếu thay đổi chạm vào luồng đã có e2e, chạy `npm run docker:dev && npm run test:e2e`.

## Quy ước code

| Chủ đề | Quy ước | Nguồn |
|---|---|---|
| Định dạng | Prettier: nháy đơn, dấu chấm phẩy, `trailingComma: all`, rộng 100, thụt 2, `arrowParens: avoid` | [.prettierrc](../../.prettierrc) |
| Lint | ESLint flat config với `typescript-eslint` và Prettier | [eslint.config.mjs](../../eslint.config.mjs) |
| Cấu trúc | Controller mỏng, logic ở service; cấu trúc module chuẩn | [project-structure](../00-getting-started/project-structure.md) |
| Phản hồi | Giữ envelope `{ statusCode, message, data }`; dùng `@ResponseMessage` | [api-overview](../05-api/api-overview.md) |
| Xác thực | Dùng `@Public()`, `@OptionalAuth()`, `@Roles()`; mọi route mặc định cần JWT | [user-roles](../01-product/user-roles.md) |
| Validation | DTO với `class-validator`; field không có decorator bị loại | [api-overview](../05-api/api-overview.md#validation) |
| Xóa | Theo mẫu xóa mềm trừ khi có lý do khác | [database-overview](../04-database/database-overview.md#xóa-mềm) |
| AI | Mô hình chỉ trích xuất hoặc sinh nội dung; quy tắc và hành vi cuối do service quyết định | [ADR-0004](../12-decisions/0004-hybrid-matching.md) |

Những bẫy đã biết khi viết code mới (đừng lặp lại):

- Dùng `Schema.Types.ObjectId` chứ không dùng `Types.ObjectId` trong `@Prop` ([database-overview](../04-database/database-overview.md#kiểu-objectid-thực-tế)).
- `findOne`, `aggregate`, `update*` không tự lọc xóa mềm; thêm `isDeleted` tường minh.
- Đừng khai báo index hai lần cho cùng key (`index: true` và `Schema.index`).
- TTL của `CACHE_MANAGER` tính bằng mili giây.
- Hàng đợi mới: đặt `jobId` khi cần loại trùng, đặt `removeOnFail` có giới hạn.
- Route mới: kiểm tra quyền sở hữu trong service, không chỉ `@Roles`; đừng dựa vào CASL.
- Đừng ghi dữ liệu cá nhân vào log ([data-protection](../08-security/data-protection.md)).

## Cập nhật tài liệu cùng Pull Request

| Bạn đổi | Cập nhật |
|---|---|
| Schema, index | [04-database/collections/](../04-database/database-overview.md) |
| Route, DTO, quyền | [05-api/endpoints/](../05-api/api-overview.md) |
| Biến môi trường | `.env.example` và [environment-variables](../14-reference/environment-variables.md) |
| Hàng đợi, cron | [queues](../03-modules/queues.md), [data-flow](../02-architecture/data-flow.md) |
| Quy tắc nghiệp vụ | [business-rules](../01-product/business-rules.md) và tài liệu module |
| Quyết định kiến trúc mới | Thêm ADR ở [12-decisions](../12-decisions/README.md) |

## Kiểm tra tài liệu

Các script kiểm tra tài liệu dùng trong dự án (link, anchor, Mermaid, schema, route, bí mật, `src/` không đổi) nằm ở `docs/superpowers/doccheck/` và **chỉ có ở local** (thư mục bị ignore); chưa có trong CI. Chúng cần `mermaid` và `jsdom` cài ngoài repository. Các script sinh tài liệu collection và API (`gen-db.cjs`, `gen-api.mjs`) đọc schema và controller thật nên giữ bảng field, index và route khớp code; phần mô tả tiếng Việt do người viết.

## Known Limitation

Tài liệu không tự cập nhật khi code đổi và CI không kiểm tra tài liệu; sai lệch phát hiện bằng cách chạy lại các script trên.
