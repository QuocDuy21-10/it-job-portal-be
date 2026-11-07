# Module Files

## Overview

Nhận file tải lên (ảnh đại diện, CV, logo công ty), kiểm tra theo chính sách từng thư mục, lưu trên đĩa và xóa file khi cần. File được phục vụ tĩnh từ thư mục `public/`.

## Responsibilities

- Kiểm tra thư mục đích, loại file và dung lượng trước khi ghi.
- Ghi file vào `public/images/<thư mục>/`.
- Xóa file, và dọn file mồ côi theo yêu cầu của module khác.

## Architecture

| Thành phần | File | Vai trò |
|---|---|---|
| Controller (2 route, `/api/v1/files`) | [files.controller.ts](../../src/files/files.controller.ts) | `POST upload`, `DELETE remove` |
| Cấu hình Multer | [multer.config.ts](../../src/files/multer.config.ts) | Chọn thư mục, đặt tên file, lọc loại file |
| Chính sách | [upload-policy.ts](../../src/files/constants/upload-policy.ts) | MIME, đuôi file, dung lượng, vai trò theo thư mục |
| Guard | [upload-auth.guard.ts](../../src/files/guards/upload-auth.guard.ts) | Đọc header `folder_type`, kiểm tra vai trò |
| Service | [files.service.ts](../../src/files/files.service.ts) | Xóa file, dọn file mồ côi |

## Dependencies

Không import module nghiệp vụ. `companies` và `cv-profiles` import `files`.

## Business Rules

Thư mục đích lấy từ header `folder_type` (không phân biệt hoa thường). Giá trị không hợp lệ bị `400`.

| `folder_type` | Loại file | Tối đa | Vai trò được phép |
|---|---|---|---|
| `avatar` | jpg, jpeg, png, gif, webp | 5 MB | Mọi người dùng đăng nhập |
| `cv` | pdf, doc, docx | 5 MB | Mọi người dùng đăng nhập |
| `resumes` | pdf, doc, docx, txt | 5 MB | Mọi người dùng đăng nhập |
| `company` | jpg, jpeg, png, gif (không có webp) | 5 MB | Chỉ `HR` và `SUPER ADMIN` (`403` nếu không) |

Nguồn: [upload-policy.ts](../../src/files/constants/upload-policy.ts).

- Đường dẫn ghi: `<thư mục chạy>/public/images/<folder_type>/`.
- Đuôi file lấy từ bảng MIME khi có, nếu không thì dùng đuôi của tên gốc.
- `DELETE /files/remove` chỉ `HR` và `SUPER ADMIN`.

## Data Model

Không có collection. Đường dẫn file được lưu ở field của collection khác (`users.avatar`, `companies.logo`, `resumes.url`, `cvprofiles.personalInfo.avatar`).

## API

`POST /files/upload`, `DELETE /files/remove`. Chi tiết ở `05-api/endpoints/files.md` (Phase 3).

## Error Handling

| Tình huống | Lỗi |
|---|---|
| `folder_type` thiếu hoặc sai | `400` kèm danh sách giá trị hợp lệ |
| Sai loại file | `400` kèm đuôi hợp lệ |
| Sai vai trò (thư mục `company`) | `403` |

## Known Limitation

- File lưu trên đĩa cục bộ, không dùng chung giữa nhiều instance, xem [scalability](../02-architecture/scalability.md).
- Chỉ kiểm tra MIME do client khai báo và đuôi file (theo cấu hình Multer), chưa thấy kiểm tra nội dung thật (magic bytes). Trạng thái: `Chưa xác minh`.
- `DELETE /files/remove` cho phép HR xóa file; chưa kiểm tra có giới hạn HR chỉ xóa file thuộc công ty mình không.
- Thư mục `public/` nằm trong `.gitignore`, nên file tải lên không thuộc repository.

## Testing

2 file test trong `src/files/`.

## Source References

[src/files/](../../src/files/), phục vụ tĩnh ở [app.setup.ts](../../src/app.setup.ts) (`useStaticAssets`).
