# Hướng dẫn viết và bảo trì tài liệu

Tài liệu này quy định cách viết `docs/` của DevLink Backend để các tài liệu nhất quán, đối chiếu được với source code và không lệch nhau theo thời gian.

## Nguyên tắc

1. **Code là nguồn sự thật.** Khi tài liệu và code khác nhau, code đúng và tài liệu phải được sửa trong cùng Pull Request.
2. **Mỗi sự thật chỉ có một nơi ghi chính.** Nơi khác dẫn liên kết, không chép lại.
3. **Chỉ mô tả cái đã có.** Không suy đoán tính năng chưa triển khai. Điều chưa kiểm chứng phải được đánh dấu.
4. **Tài liệu hoàn chỉnh quan trọng hơn số lượng file.** Không tạo file rỗng hoặc mô tả chung chung.

## Nguồn sự thật cho từng loại thông tin

| Thông tin | Nguồn | Tài liệu chính |
|---|---|---|
| Field, kiểu dữ liệu, index của collection | `src/**/schemas/*.schema.ts` | `04-database/collections/` |
| Route, DTO, quyền truy cập | `src/**/*.controller.ts`, `dto/` | `05-api/endpoints/` |
| Biến môi trường | `.env.example`, [env.validation.ts](../../src/config/env.validation.ts) | `14-reference/` |
| Lệnh chạy | [package.json](../../package.json) | [00-getting-started/](../00-getting-started/) |
| CI/CD, Docker | [ci.yml](../../.github/workflows/ci.yml), [Dockerfile](../../Dockerfile), file compose | `09-infrastructure/` |

Không đọc hoặc chép nội dung file `.env` thật vào tài liệu.

## Quy ước đặt tên và ngôn ngữ

- Tên file và thư mục: tiếng Anh, `kebab-case`, ví dụ `job-ingestion.md`.
- Nội dung: tiếng Việt. Thuật ngữ kỹ thuật được giải thích ở lần xuất hiện đầu tiên trong mỗi tài liệu.
- Tránh emoji. Dùng bảng khi so sánh nhiều thuộc tính (field, biến môi trường, trạng thái).
- Sơ đồ dùng [Mermaid](https://mermaid.js.org/), hiển thị trực tiếp trên GitHub. Mỗi sơ đồ phải có phần giải thích đi kèm.

## Nhãn trạng thái

Dùng đúng năm nhãn sau để người đọc phân biệt hiện trạng với kế hoạch:

| Nhãn | Ý nghĩa |
|---|---|
| `Current Implementation` | Hành vi đang có trong code, đã đối chiếu |
| `Design Decision` | Lựa chọn thiết kế và lý do của nó |
| `Known Limitation` | Giới hạn hoặc lỗi đã biết trong code hiện tại |
| `Future Improvement` | Hướng cải tiến chưa triển khai |
| `Chưa xác minh` | Thông tin chưa được kiểm chứng bằng code hoặc lệnh chạy thực tế |

Quyết định kiến trúc chỉ ghi trạng thái `Accepted` khi có bằng chứng trong code hoặc lịch sử git. Quyết định suy luận ghi là `Proposed`.

## Liên kết

- Dùng đường dẫn tương đối.
- Liên kết tới source chỉ trỏ tới file, không kèm số dòng, vì số dòng thay đổi khi code đổi.
- Liên kết tới mục cụ thể trong tài liệu khác dùng anchor của tiêu đề.

## Dữ liệu trong ví dụ

- Chỉ dùng dữ liệu giả. Email dùng miền `example.com`.
- Chuỗi kết nối viết dạng `mongodb://<user>:<password>@host:27017/<db>`.
- Không đưa token, khóa API, mật khẩu hoặc dữ liệu cá nhân thật vào tài liệu.

## Template

### Collection (`04-database/collections/<name>.md`)

```markdown
# <Tên> (`<tên collection>`)
Mục đích, đường dẫn schema nguồn, phân loại dữ liệu (có dữ liệu cá nhân hay không)

## Data dictionary
| Field | Type | Required | Default | Ràng buộc | Ý nghĩa |
(ghi cả nested field dạng `a.b`)

## Indexes
| Keys | Thuộc tính (unique, TTL, partial) | Phục vụ truy vấn |

## Quan hệ
Reference (ObjectId) hay embedded. MongoDB không tự ràng buộc reference.

## Ví dụ document
## Vòng đời, soft-delete, lưu ý migration
```

### Module (`03-modules/<name>.md`)

Overview, Responsibilities, Architecture, Dependencies, Business Rules, Data Model, API, Processing Flow, Error Handling, Testing, Source References.

### Endpoint (`05-api/endpoints/<controller-prefix>.md`)

Tên file trùng với tiền tố trong `@Controller('...')`. Bảng route ghi đúng dạng `` `METHOD /api/v1/path` `` kèm cột Auth. Mỗi route mô tả params, query, body, ví dụ response và mã lỗi.

### Nghiệp vụ (`06-workflows/use-cases/<name>.md`)

Actor và mục đích, Preconditions, Postconditions, Main flow, Alternative flow, Error flow, Business rules, Edge cases, liên kết tới sequence và state diagram.

## Khi nào phải cập nhật tài liệu

Cập nhật trong cùng Pull Request khi thay đổi:

| Thay đổi | Tài liệu cần sửa |
|---|---|
| Schema hoặc index | Tài liệu collection tương ứng |
| Route, DTO hoặc quyền truy cập | Tài liệu endpoint tương ứng |
| Biến môi trường | `.env.example` và tài liệu biến môi trường |
| Queue, cron, quy tắc nghiệp vụ | Tài liệu module và workflow liên quan |
| Script trong `package.json` | Hướng dẫn chạy local |
