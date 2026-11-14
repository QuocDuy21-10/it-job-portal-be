# API CV Profiles

Tiền tố `/api/v1/cv-profiles`. Controller: [cv-profiles.controller.ts](../../../src/cv-profiles/cv-profiles.controller.ts). Module: [cv-profiles](../../03-modules/cv-profiles.md). Collection: [cv-profiles](../../04-database/collections/cv-profiles.md).

`@UseGuards(JwtAuthGuard)` ở cấp class: mọi route cần đăng nhập. Các route `me` thao tác trên CV của chính người gọi.

## Danh sách route

| Route | Auth | Mô tả |
|---|---|---|
| `POST /api/v1/cv-profiles/upsert` | Đăng nhập (mọi vai trò) | Tạo hoặc cập nhật CV của mình, kèm ảnh đại diện |
| `GET /api/v1/cv-profiles/me` | Đăng nhập (mọi vai trò) | Lấy CV của mình |
| `GET /api/v1/cv-profiles/check` | Đăng nhập (mọi vai trò) | Kiểm tra mình đã có CV chưa |
| `PUT /api/v1/cv-profiles/me` | Đăng nhập (mọi vai trò) | Cập nhật CV của mình |
| `DELETE /api/v1/cv-profiles/me` | Đăng nhập (mọi vai trò) | Xóa thật CV của mình |
| `POST /api/v1/cv-profiles/me/deactivate` | Đăng nhập (mọi vai trò) | Tắt CV của mình, không dùng để nộp hồ sơ |
| `POST /api/v1/cv-profiles/me/activate` | Đăng nhập (mọi vai trò) | Bật lại CV của mình |
| `GET /api/v1/cv-profiles/:id` | Đăng nhập, vai trò: SUPER ADMIN | Lấy CV bất kỳ theo ID |
| `GET /api/v1/cv-profiles` | Đăng nhập, vai trò: SUPER ADMIN | Liệt kê mọi CV có phân trang |

## Ghi chú

- `POST /cv-profiles/upsert` nhận dữ liệu CV kèm ảnh đại diện (theo Swagger "with Avatar Upload"); dữ liệu được chuẩn hóa về dạng chuẩn rồi tạo hoặc cập nhật, và đồng bộ họ tên, email, ảnh với tài khoản.
- Mỗi người một CV. `isActive = false` chặn nộp hồ sơ bằng CV này.
- `DELETE /cv-profiles/me` xóa thật (không xóa mềm).
- **Phân trang không đồng nhất:** `GET /cv-profiles` trả `{ data, total, page, limit }`, khác dạng `result` + `meta.pagination` của phần còn lại ([api-overview](../api-overview.md#phân-trang)).
- Mọi trường ngày trong CV là chuỗi, không phải Date.

## Chi tiết từng route

### `POST /api/v1/cv-profiles/upsert`

Tạo hoặc cập nhật CV của mình, kèm ảnh đại diện

- **Auth:** Đăng nhập (mọi vai trò)
- **Handler:** `upsertCvProfile` trong [cv-profiles.controller.ts](../../../src/cv-profiles/cv-profiles.controller.ts)
- **Mã thành công:** HttpStatus.OK, `message` = "CV Profile saved successfully"

**Body:** field `cvData` kiểu `string`

**Upload:** nhận file qua `multipart/form-data` (`@UploadedFile`).

**Phản hồi theo Swagger**

| Mã | Mô tả |
|---|---|
| 200 | CV Profile saved successfully with avatar URL |
| 400 | Bad Request - Invalid file type or validation failed |
| 401 | Unauthorized - Invalid or missing JWT token |

### `GET /api/v1/cv-profiles/me`

Lấy CV của mình

- **Auth:** Đăng nhập (mọi vai trò)
- **Handler:** `getCurrentUserCv` trong [cv-profiles.controller.ts](../../../src/cv-profiles/cv-profiles.controller.ts)
- **Mã thành công:** 200, `message` = "CV Profile retrieved successfully"

**Phản hồi theo Swagger**

| Mã | Mô tả |
|---|---|
| 200 | CV Profile retrieved successfully |
| 401 | Unauthorized - Invalid or missing JWT token |

### `GET /api/v1/cv-profiles/check`

Kiểm tra mình đã có CV chưa

- **Auth:** Đăng nhập (mọi vai trò)
- **Handler:** `checkCvProfileExists` trong [cv-profiles.controller.ts](../../../src/cv-profiles/cv-profiles.controller.ts)
- **Mã thành công:** 200, `message` = "CV Profile check completed"

**Phản hồi theo Swagger**

| Mã | Mô tả |
|---|---|
| 200 | Check completed successfully |
| 401 | Unauthorized - Invalid or missing JWT token |

### `PUT /api/v1/cv-profiles/me`

Cập nhật CV của mình

- **Auth:** Đăng nhập (mọi vai trò)
- **Handler:** `updateCurrentUserCv` trong [cv-profiles.controller.ts](../../../src/cv-profiles/cv-profiles.controller.ts)
- **Mã thành công:** 200, `message` = "CV Profile updated successfully"

**Body: `CreateCvProfileDto`** ([create-cv-profile.dto.ts](../../../src/cv-profiles/dto/create-cv-profile.dto.ts))

| Field | Kiểu | Bắt buộc | Validation | Ví dụ |
|---|---|---|---|---|
| `personalInfo` | PersonalInfoDto | Có | ValidateNested | — |
| `education` | EducationDto[] | Không | IsArray, ValidateNested | [ { id: 'edu-1', school: 'Đại học Bách Khoa TPHCM', degree: … |
| `experience` | ExperienceDto[] | Không | IsArray, ValidateNested | [ { id: 'exp-1', company: 'Tech Corp', position: 'Senior Bac… |
| `skills` | SkillDto[] | Không | IsArray, ValidateNested | [ { id: 'skill-1', name: 'NestJS', level: 'Advanced' }, { id… |
| `languages` | LanguageDto[] | Không | IsArray, ValidateNested | [ { id: 'lang-1', name: 'Vietnamese', proficiency: 'Native' … |
| `projects` | ProjectDto[] | Không | IsArray, ValidateNested | [ { id: 'proj-1', name: 'E-commerce Platform', description: … |
| `certificates` | CertificateDto[] | Không | IsArray, ValidateNested | [ { id: 'cert-1', name: 'AWS Certified Developer', issuer: '… |
| `awards` | AwardDto[] | Không | IsArray, ValidateNested | [ { id: 'award-1', name: 'Best Developer 2023', date: '2023-… |

_Kiểu lồng `PersonalInfoDto`_

| Field | Kiểu | Bắt buộc | Validation | Ví dụ |
|---|---|---|---|---|
| `fullName` | string | Có | IsString, MaxLength(100) | 'Nguyễn Văn A' |
| `title` | string | Không | IsString, MaxLength(100) | 'Senior Full Stack Developer' |
| `avatar` | string | Không | IsString, MaxLength(500) | 'http://localhost:8000/images/avatar/profile-1234567890.jpg' |
| `phone` | string | Có | IsString, MaxLength(20) | '0123456789' |
| `email` | string | Không | IsEmail | 'nguyenvana@example.com' |
| `birthday` | string | Không | IsString | '1995-05-15' |
| `gender` | string | Không | IsString, MaxLength(20) | 'Nam' |
| `address` | string | Không | IsString, MaxLength(200) | '123 Đường ABC, Quận 1, TPHCM' |
| `personalLink` | string | Không | IsString, MaxLength(200) | 'https://linkedin.com/in/nguyenvana' |
| `bio` | string | Không | IsString, MaxLength(1000) | 'Experienced Full Stack Developer with 5+ years of experienc… |

_Kiểu lồng `EducationDto`_

| Field | Kiểu | Bắt buộc | Validation | Ví dụ |
|---|---|---|---|---|
| `id` | string | Có | IsString | 'edu-1' |
| `school` | string | Có | IsString, MaxLength(200) | 'Đại học Bách Khoa TPHCM' |
| `degree` | string | Có | IsString, MaxLength(100) | 'Bachelor of Engineering' |
| `field` | string | Có | IsString, MaxLength(100) | 'Computer Science' |
| `startDate` | string | Có | IsString | '2013-09-01' |
| `endDate` | string | Có | IsString | '2017-06-30' |
| `description` | string | Không | IsString, MaxLength(1000) | 'GPA: 3.8/4.0 - Graduated with honors' |

_Kiểu lồng `ExperienceDto`_

| Field | Kiểu | Bắt buộc | Validation | Ví dụ |
|---|---|---|---|---|
| `id` | string | Có | IsString | 'exp-1' |
| `company` | string | Có | IsString, MaxLength(100) | 'Tech Corp Vietnam' |
| `position` | string | Có | IsString, MaxLength(100) | 'Senior Backend Developer' |
| `startDate` | string | Có | IsNotEmpty, IsString | '2020-01-01' |
| `endDate` | string | Có | IsNotEmpty, IsString | '2023-12-31' |
| `description` | string | Không | IsString, MaxLength(1000) | 'Developed and maintained microservices using NestJS, MongoD… |

_Kiểu lồng `SkillDto`_

| Field | Kiểu | Bắt buộc | Validation | Ví dụ |
|---|---|---|---|---|
| `id` | string | Có | IsString | 'skill-1' |
| `name` | string | Có | IsString, MaxLength(100) | 'NestJS' |
| `level` | string | Có | IsString, MaxLength(50) | 'Advanced' |

_Kiểu lồng `LanguageDto`_

| Field | Kiểu | Bắt buộc | Validation | Ví dụ |
|---|---|---|---|---|
| `id` | string | Có | IsString | 'lang-1' |
| `name` | string | Có | IsString, MaxLength(50) | 'English' |
| `proficiency` | string | Có | IsString, MaxLength(50) | 'Fluent' |

_Kiểu lồng `ProjectDto`_

| Field | Kiểu | Bắt buộc | Validation | Ví dụ |
|---|---|---|---|---|
| `id` | string | Có | IsString | 'proj-1' |
| `name` | string | Có | IsString, MaxLength(200) | 'E-commerce Platform' |
| `description` | string | Không | IsString, MaxLength(1000) | 'Full-stack e-commerce solution with payment integration and… |
| `position` | string | Có | IsString, MaxLength(100) | 'Lead Developer' |
| `link` | string | Không | IsString, MaxLength(200) | 'https://github.com/username/ecommerce' |

_Kiểu lồng `CertificateDto`_

| Field | Kiểu | Bắt buộc | Validation | Ví dụ |
|---|---|---|---|---|
| `id` | string | Có | IsString | 'cert-1' |
| `name` | string | Có | IsString, MaxLength(200) | 'AWS Certified Developer - Associate' |
| `issuer` | string | Có | IsString, MaxLength(200) | 'Amazon Web Services' |
| `date` | string | Có | IsString | '2022-06-15' |

_Kiểu lồng `AwardDto`_

| Field | Kiểu | Bắt buộc | Validation | Ví dụ |
|---|---|---|---|---|
| `id` | string | Có | IsString | 'award-1' |
| `name` | string | Có | IsString, MaxLength(200) | 'Best Developer of the Year' |
| `date` | string | Có | IsString | '2023-12-01' |
| `description` | string | Không | IsString, MaxLength(500) | 'Awarded for outstanding performance and innovation in backe… |

**Phản hồi theo Swagger**

| Mã | Mô tả |
|---|---|
| 200 | CV Profile updated successfully |
| 400 | Bad Request - Validation failed |
| 401 | Unauthorized - Invalid or missing JWT token |

### `DELETE /api/v1/cv-profiles/me`

Xóa thật CV của mình

- **Auth:** Đăng nhập (mọi vai trò)
- **Handler:** `deleteCurrentUserCv` trong [cv-profiles.controller.ts](../../../src/cv-profiles/cv-profiles.controller.ts)
- **Mã thành công:** HttpStatus.NO_CONTENT

**Phản hồi theo Swagger**

| Mã | Mô tả |
|---|---|
| 204 | CV Profile deleted successfully |
| 404 | CV Profile not found |
| 401 | Unauthorized - Invalid or missing JWT token |

### `POST /api/v1/cv-profiles/me/deactivate`

Tắt CV của mình, không dùng để nộp hồ sơ

- **Auth:** Đăng nhập (mọi vai trò)
- **Handler:** `deactivateCvProfile` trong [cv-profiles.controller.ts](../../../src/cv-profiles/cv-profiles.controller.ts)
- **Mã thành công:** 201, `message` = "CV Profile deactivated successfully"

**Phản hồi theo Swagger**

| Mã | Mô tả |
|---|---|
| 200 | CV Profile deactivated successfully |
| 404 | CV Profile not found |
| 401 | Unauthorized - Invalid or missing JWT token |

### `POST /api/v1/cv-profiles/me/activate`

Bật lại CV của mình

- **Auth:** Đăng nhập (mọi vai trò)
- **Handler:** `activateCvProfile` trong [cv-profiles.controller.ts](../../../src/cv-profiles/cv-profiles.controller.ts)
- **Mã thành công:** 201, `message` = "CV Profile activated successfully"

**Phản hồi theo Swagger**

| Mã | Mô tả |
|---|---|
| 200 | CV Profile activated successfully |
| 404 | CV Profile not found |
| 401 | Unauthorized - Invalid or missing JWT token |

### `GET /api/v1/cv-profiles/:id`

Lấy CV bất kỳ theo ID. **Không có kiểm tra quyền** (xem cảnh báo)

- **Auth:** Đăng nhập (mọi vai trò)
- **Handler:** `getCvProfileById` trong [cv-profiles.controller.ts](../../../src/cv-profiles/cv-profiles.controller.ts)
- **Mã thành công:** 200, `message` = "CV Profile retrieved successfully"

**Path params**

| Tên | Kiểu | Mô tả |
|---|---|---|
| `id` | string | CV Profile ID (MongoDB ObjectId) |

**Phản hồi theo Swagger**

| Mã | Mô tả |
|---|---|
| 200 | CV Profile retrieved successfully |
| 400 | Bad Request - Invalid ID format |
| 404 | CV Profile not found |
| 401 | Unauthorized - Invalid or missing JWT token |

### `GET /api/v1/cv-profiles`

Liệt kê mọi CV có phân trang. **Không có kiểm tra quyền** (xem cảnh báo)

- **Auth:** Đăng nhập (mọi vai trò)
- **Handler:** `getAllCvProfiles` trong [cv-profiles.controller.ts](../../../src/cv-profiles/cv-profiles.controller.ts)
- **Mã thành công:** 200, `message` = "CV Profiles retrieved successfully"

**Query**

| Tên | Bắt buộc | Mô tả | Ví dụ |
|---|---|---|---|
| `page` | Không | Page number (default: 1) | 1 |
| `limit` | Không | Items per page (default: 10) | 10 |

**Phản hồi theo Swagger**

| Mã | Mô tả |
|---|---|
| 200 | CV Profiles retrieved successfully |
| 401 | Unauthorized - Invalid or missing JWT token |
| 403 | Forbidden - Admin access required |
