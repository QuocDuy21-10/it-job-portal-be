# API Files

Tiền tố `/api/v1/files`. Controller: [files.controller.ts](../../../src/files/files.controller.ts). Module: [files](../../03-modules/files.md).

## Danh sách route

| Route | Auth | Mô tả |
|---|---|---|
| `POST /api/v1/files/upload` | Đăng nhập (mọi vai trò), cần header `folder_type` | Tải một file lên thư mục chọn bằng header `folder_type` |
| `DELETE /api/v1/files/remove` | Đăng nhập, vai trò: SUPER ADMIN, HR | Xóa một file đã tải lên (quản trị viên hoặc HR) |

## Upload

`POST /files/upload` nhận `multipart/form-data` với một file. Thư mục đích chọn bằng **header** `folder_type`, không phải field trong body:

| `folder_type` | Loại file | Tối đa | Ai được phép |
|---|---|---|---|
| `avatar` | jpg, jpeg, png, gif, webp | 5 MB | Người dùng đăng nhập |
| `cv` | pdf, doc, docx | 5 MB | Người dùng đăng nhập |
| `resumes` | pdf, doc, docx, txt | 5 MB | Người dùng đăng nhập |
| `company` | jpg, jpeg, png, gif | 5 MB | Chỉ `HR` và `SUPER ADMIN` |

Phản hồi (`data`) theo `getFileInfo` ([files.service.ts](../../../src/files/files.service.ts)):

```json
{
  "fileName": "<tên file do server đặt>",
  "originalName": "logo.png",
  "mimeType": "image/png",
  "size": 12345,
  "folderType": "company",
  "url": "<đường dẫn truy cập file>"
}
```

Giá trị trong ví dụ là minh họa. Tên file do server đặt, không dùng tên gốc.

## Xóa file

`DELETE /files/remove` chỉ `HR` và `SUPER ADMIN`, nhận `fileName` và `folderType` (khớp mẫu `Matches`, xem DTO) và trả `{ "deleted": true }`.

## Known Limitation

Route xóa không kiểm tra file thuộc về ai: bất kỳ HR nào biết `folderType` và `fileName` đều xóa được file đó. `Chưa xác minh` chi tiết trong `FilesService.deleteFile`.

## Chi tiết từng route

### `POST /api/v1/files/upload`

Tải một file lên thư mục chọn bằng header `folder_type`

- **Auth:** Đăng nhập (mọi vai trò), cần header `folder_type`
- **Handler:** `uploadFile` trong [files.controller.ts](../../../src/files/files.controller.ts)
- **Mã thành công:** 201, `message` = "Upload single file"

**Upload:** nhận file qua `multipart/form-data` (`@UploadedFile`).

**Phản hồi theo Swagger**

| Mã | Mô tả |
|---|---|
| 201 | File uploaded successfully. |

### `DELETE /api/v1/files/remove`

Xóa một file đã tải lên (quản trị viên hoặc HR)

- **Auth:** Đăng nhập, vai trò: SUPER ADMIN, HR
- **Handler:** `deleteFile` trong [files.controller.ts](../../../src/files/files.controller.ts)
- **Mã thành công:** 200, `message` = "Delete file"

**Body: `DeleteFileDto`** ([delete-file.dto.ts](../../../src/files/dto/delete-file.dto.ts))

| Field | Kiểu | Bắt buộc | Validation | Ví dụ |
|---|---|---|---|---|
| `fileName` | string | Có | IsNotEmpty, IsString, Matches | 'logo-1704067200000.png' |
| `folderType` | string | Có | IsNotEmpty, IsString, Matches | 'company' |

**Phản hồi theo Swagger**

| Mã | Mô tả |
|---|---|
| 200 | File deleted successfully. |
