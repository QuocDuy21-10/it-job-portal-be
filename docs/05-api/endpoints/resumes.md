# API Resumes

Tiền tố `/api/v1/resumes`. Controller: [resumes.controller.ts](../../../src/resumes/resumes.controller.ts). Module: [resumes](../../03-modules/resumes.md). Collection: [resumes](../../04-database/collections/resumes.md).

Hai nhóm người dùng: **ứng viên** nộp và xem hồ sơ của mình (`cv-online`, `upload-cv`, `by-user`, `my-resumes`, `:id/analysis`), và **HR hoặc quản trị viên** xử lý hồ sơ (CRUD, `reparse`, `reanalyze`). `queue/stats` chỉ cho quản trị viên.

## Danh sách route

| Route | Auth | Mô tả |
|---|---|---|
| `POST /api/v1/resumes` | Đăng nhập, vai trò: SUPER ADMIN, HR | Tạo hồ sơ thủ công (quản trị viên hoặc HR) |
| `GET /api/v1/resumes` | Đăng nhập, vai trò: SUPER ADMIN, HR | Danh sách hồ sơ có phân trang. HR chỉ thấy hồ sơ công ty mình |
| `GET /api/v1/resumes/:id` | Đăng nhập, vai trò: SUPER ADMIN, HR | Chi tiết một hồ sơ. HR chỉ xem hồ sơ công ty mình |
| `PATCH /api/v1/resumes/:id` | Đăng nhập, vai trò: SUPER ADMIN, HR | Cập nhật hồ sơ. Đổi `status` ghi `histories` và gửi thông báo cho ứng viên |
| `DELETE /api/v1/resumes/bulk` | Đăng nhập, vai trò: SUPER ADMIN, HR | Xóa mềm nhiều hồ sơ |
| `DELETE /api/v1/resumes/:id` | Đăng nhập, vai trò: SUPER ADMIN, HR | Xóa mềm một hồ sơ |
| `POST /api/v1/resumes/by-user` | Đăng nhập (mọi vai trò) | Lấy các hồ sơ ứng tuyển của chính người gọi (dùng POST, không có body) |
| `POST /api/v1/resumes/my-resumes` | Đăng nhập (mọi vai trò) | Lấy danh sách URL file CV của chính người gọi (dùng POST, không có body) |
| `POST /api/v1/resumes/cv-online` | Đăng nhập (mọi vai trò) | Nộp hồ sơ bằng CV trực tuyến, chấm điểm ngay trong request |
| `POST /api/v1/resumes/upload-cv` | Đăng nhập (mọi vai trò) | Tải file CV và nộp hồ sơ. Việc đọc và phân tích đi qua hàng đợi |
| `GET /api/v1/resumes/:id/analysis` | Đăng nhập (mọi vai trò) | Xem kết quả đọc và phân tích CV (chủ hồ sơ hoặc quản trị viên) |
| `GET /api/v1/resumes/queue/stats` | Đăng nhập, vai trò: SUPER ADMIN | Thống kê hàng đợi xử lý hồ sơ (quản trị viên) |
| `POST /api/v1/resumes/:id/reparse` | Đăng nhập, vai trò: SUPER ADMIN, HR | Đọc lại file CV bằng hàng đợi (quản trị viên hoặc HR) |
| `POST /api/v1/resumes/:id/reanalyze` | Đăng nhập, vai trò: SUPER ADMIN, HR | Chấm điểm lại hồ sơ bằng hàng đợi (quản trị viên hoặc HR) |

## Nộp hồ sơ

| Đường | Route | Giới hạn | Phản hồi |
|---|---|---|---|
| CV trực tuyến | `POST /resumes/cv-online` | 10 lần mỗi 5 phút | Kết quả chấm điểm ngay |
| Tải file | `POST /resumes/upload-cv` | 20 lần mỗi giờ | `status: "processing"`, kèm `jobs.parseJobId`, `jobs.analysisJobId`, `estimatedTime: "30-60 seconds"` (chuỗi trong code) |

`upload-cv` nhận `multipart/form-data` với file CV và `jobId`. Quy tắc nghiệp vụ (trùng đơn, CV bị tắt): [resumes](../../03-modules/resumes.md#business-rules).

## Phạm vi theo vai trò

- `HR` chỉ thấy và sửa hồ sơ có `companyId` trùng công ty của mình; ngược lại `403`.
- `GET /resumes/:id/analysis` chỉ chủ hồ sơ hoặc `SUPER ADMIN`; sai quyền trả **`400`** ("You do not have permission to view this resume") chứ không phải `403`. `HR` không xem được qua route này.

## Lọc và sắp xếp

`GET /resumes` đọc bộ lọc, `populate` và `projection` từ query string. Sắp xếp được định nghĩa giới hạn ở `status`, `priority`, `createdAt`, `updatedAt`, `aiAnalysis.matchingScore` nhưng **bước lọc đầu vào đang bị tắt**, xem [api-overview](../api-overview.md#lọc-và-sắp-xếp-bằng-query-string). Phạm vi công ty của HR được gán sau khi parse nên vẫn có hiệu lực.

## Known Limitation

- `by-user` và `my-resumes` là `POST` dù chỉ đọc dữ liệu, và không nhận body.
- `PATCH /resumes/:id` đổi `status` mà không kiểm tra thứ tự chuyển; mỗi lần đổi thêm một phần tử vào `histories` và gửi thông báo cho ứng viên.
- Điểm phù hợp chỉ ảnh hưởng `priority`; trạng thái tự động đã bị tắt trong processor ([resumes (collection)](../../04-database/collections/resumes.md#quy-tắc-nghiệp-vụ)).

## Chi tiết từng route

### `POST /api/v1/resumes`

Tạo hồ sơ thủ công (quản trị viên hoặc HR)

- **Auth:** Đăng nhập, vai trò: SUPER ADMIN, HR
- **Handler:** `create` trong [resumes.controller.ts](../../../src/resumes/resumes.controller.ts)
- **Mã thành công:** 201, `message` = "Resume created successfully"

**Body: `CreateUserCvDto`** ([create-resume.dto.ts](../../../src/resumes/dto/create-resume.dto.ts))

| Field | Kiểu | Bắt buộc | Validation | Ví dụ |
|---|---|---|---|---|
| `url` | string | Có | IsNotEmpty | 'https://example.com/resume.pdf' |
| `companyId` | mongoose.Schema.Types.ObjectId | Không | IsNotEmpty, IsMongoId | '507f1f77bcf86cd799439011' |
| `jobId` | mongoose.Schema.Types.ObjectId | Không | IsNotEmpty, IsMongoId | '507f1f77bcf86cd799439011' |

### `GET /api/v1/resumes`

Danh sách hồ sơ có phân trang. HR chỉ thấy hồ sơ công ty mình

- **Auth:** Đăng nhập, vai trò: SUPER ADMIN, HR
- **Handler:** `findAll` trong [resumes.controller.ts](../../../src/resumes/resumes.controller.ts)
- **Mã thành công:** 200, `message` = "Resumes have been retrieved successfully"

**Query**

| Tên | Bắt buộc | Mô tả | Ví dụ |
|---|---|---|---|
| `page` | Không |  |  |
| `limit` | Không |  |  |
| *(toàn bộ query string)* | — | Đọc bằng `api-query-params`: hỗ trợ lọc và sắp xếp (xem [api-overview](../api-overview.md#phân-trang-lọc-và-sắp-xếp)) | |

### `GET /api/v1/resumes/:id`

Chi tiết một hồ sơ. HR chỉ xem hồ sơ công ty mình

- **Auth:** Đăng nhập, vai trò: SUPER ADMIN, HR
- **Handler:** `findOne` trong [resumes.controller.ts](../../../src/resumes/resumes.controller.ts)
- **Mã thành công:** 200, `message` = "Resume has been retrieved successfully"

**Path params**

| Tên | Kiểu | Mô tả |
|---|---|---|
| `id` | string |  |

### `PATCH /api/v1/resumes/:id`

Cập nhật hồ sơ. Đổi `status` ghi `histories` và gửi thông báo cho ứng viên

- **Auth:** Đăng nhập, vai trò: SUPER ADMIN, HR
- **Handler:** `update` trong [resumes.controller.ts](../../../src/resumes/resumes.controller.ts)
- **Mã thành công:** 200, `message` = "Resume updated status successfully"

**Path params**

| Tên | Kiểu | Mô tả |
|---|---|---|
| `id` | string |  |

**Body: `UpdateResumeDto`** ([update-resume.dto.ts](../../../src/resumes/dto/update-resume.dto.ts))

| Field | Kiểu | Bắt buộc | Validation | Ví dụ |
|---|---|---|---|---|
| `status` | string | Không | IsNotEmpty, IsEnum(EResumeStatus), IsString | EResumeStatus.PENDING |
| `parsedData` | ParsedDataDto | Không | ValidateNested | — |
| `aiAnalysis` | AIAnalysisDto | Không | ValidateNested | — |
| `priority` | string | Không | IsEnum(EResumePriority) | — |
| `adminNotes` | string | Không | IsString | — |
| `hrNotes` | string | Không | IsString | — |
| `isParsed` | boolean | Không | IsBoolean | — |
| `isAnalyzed` | boolean | Không | IsBoolean | — |
| `parseError` | string | Không | IsString | — |
| `analysisError` | string | Không | IsString | — |

_Kiểu lồng `ParsedDataDto`_

| Field | Kiểu | Bắt buộc | Validation | Ví dụ |
|---|---|---|---|---|
| `fullName` | string | Không | IsString | — |
| `email` | string | Không | IsEmail | — |
| `phone` | string | Không | IsString | — |
| `skills` | string[] | Không | IsArray, IsString | — |
| `normalizedSkills` | string[] | Không | IsArray, IsString | — |
| `unmappedSkills` | string[] | Không | IsArray, IsString | — |
| `experience` | ParsedExperienceDto[] | Không | IsArray, ValidateNested | — |
| `education` | ParsedEducationDto[] | Không | IsArray, ValidateNested | — |
| `summary` | string | Không | IsString | — |
| `yearsOfExperience` | number | Không | IsNumber | — |

_Kiểu lồng `AIAnalysisDto`_

| Field | Kiểu | Bắt buộc | Validation | Ví dụ |
|---|---|---|---|---|
| `matchingScore` | number | Không | IsNumber, Min(0), Max(100) | — |
| `skillsMatch` | SkillMatchDto[] | Không | IsArray, ValidateNested | — |
| `strengths` | string[] | Không | IsArray, IsString | — |
| `weaknesses` | string[] | Không | IsArray, IsString | — |
| `summary` | string | Không | IsString | — |
| `recommendation` | string | Không | IsString | — |
| `analyzedAt` | Date | Không | IsDate | — |

### `DELETE /api/v1/resumes/bulk`

Xóa mềm nhiều hồ sơ

- **Auth:** Đăng nhập, vai trò: SUPER ADMIN, HR
- **Handler:** `bulkRemove` trong [resumes.controller.ts](../../../src/resumes/resumes.controller.ts)
- **Mã thành công:** 200, `message` = "Bulk delete resumes"

**Body: `BulkDeleteDto`** ([bulk-delete.dto.ts](../../../src/utils/dto/bulk-delete.dto.ts))

| Field | Kiểu | Bắt buộc | Validation | Ví dụ |
|---|---|---|---|---|
| `ids` | string[] | Có | IsArray, ArrayMinSize(1), ArrayMaxSize(100), IsMongoId | ['507f1f77bcf86cd799439011', '507f1f77bcf86cd799439012'] |

### `DELETE /api/v1/resumes/:id`

Xóa mềm một hồ sơ

- **Auth:** Đăng nhập, vai trò: SUPER ADMIN, HR
- **Handler:** `remove` trong [resumes.controller.ts](../../../src/resumes/resumes.controller.ts)
- **Mã thành công:** 200, `message` = "Resume deleted successfully"

**Path params**

| Tên | Kiểu | Mô tả |
|---|---|---|
| `id` | string |  |

### `POST /api/v1/resumes/by-user`

Lấy các hồ sơ ứng tuyển của chính người gọi (dùng POST, không có body)

- **Auth:** Đăng nhập (mọi vai trò)
- **Handler:** `getResumeByUser` trong [resumes.controller.ts](../../../src/resumes/resumes.controller.ts)
- **Mã thành công:** 201, `message` = "Resume has been retrieved successfully"

### `POST /api/v1/resumes/my-resumes`

Lấy danh sách URL file CV của chính người gọi (dùng POST, không có body)

- **Auth:** Đăng nhập (mọi vai trò)
- **Handler:** `getResumeOfMe` trong [resumes.controller.ts](../../../src/resumes/resumes.controller.ts)
- **Mã thành công:** 201, `message` = "Resume has been retrieved successfully"

### `POST /api/v1/resumes/cv-online`

Nộp hồ sơ bằng CV trực tuyến, chấm điểm ngay trong request

- **Auth:** Đăng nhập (mọi vai trò)
- **Handler:** `submitCvOnline` trong [resumes.controller.ts](../../../src/resumes/resumes.controller.ts)
- **Mã thành công:** 201, `message` = "CV submitted successfully"
- **Giới hạn tốc độ:** 10 lần mỗi 5 phút

**Body: `SubmitCvOnlineDto`** ([submit-cv-online.dto.ts](../../../src/resumes/dto/submit-cv-online.dto.ts))

| Field | Kiểu | Bắt buộc | Validation | Ví dụ |
|---|---|---|---|---|
| `jobId` | string | Có | IsNotEmpty, IsMongoId | '507f1f77bcf86cd799439011' |

### `POST /api/v1/resumes/upload-cv`

Tải file CV và nộp hồ sơ. Việc đọc và phân tích đi qua hàng đợi

- **Auth:** Đăng nhập (mọi vai trò)
- **Handler:** `uploadCV` trong [resumes.controller.ts](../../../src/resumes/resumes.controller.ts)
- **Mã thành công:** 201, `message` = "CV uploaded and queued for processing"
- **Giới hạn tốc độ:** 20 lần mỗi 1 giờ

**Body: `UploadCvDto`** ([upload-cv.dto.ts](../../../src/resumes/dto/upload-cv.dto.ts))

| Field | Kiểu | Bắt buộc | Validation | Ví dụ |
|---|---|---|---|---|
| `jobId` | string | Có | IsNotEmpty, IsMongoId | '507f1f77bcf86cd799439011' |

**Upload:** nhận file qua `multipart/form-data` (`@UploadedFile`).

### `GET /api/v1/resumes/:id/analysis`

Xem kết quả đọc và phân tích CV (chủ hồ sơ hoặc quản trị viên)

- **Auth:** Đăng nhập (mọi vai trò)
- **Handler:** `getAnalysis` trong [resumes.controller.ts](../../../src/resumes/resumes.controller.ts)
- **Mã thành công:** 200, `message` = "Analysis results retrieved successfully"

**Path params**

| Tên | Kiểu | Mô tả |
|---|---|---|
| `id` | string |  |

### `GET /api/v1/resumes/queue/stats`

Thống kê hàng đợi xử lý hồ sơ (quản trị viên)

- **Auth:** Đăng nhập, vai trò: SUPER ADMIN
- **Handler:** `getQueueStats` trong [resumes.controller.ts](../../../src/resumes/resumes.controller.ts)
- **Mã thành công:** 200, `message` = "Queue statistics retrieved"

### `POST /api/v1/resumes/:id/reparse`

Đọc lại file CV bằng hàng đợi (quản trị viên hoặc HR)

- **Auth:** Đăng nhập, vai trò: SUPER ADMIN, HR
- **Handler:** `reparseCV` trong [resumes.controller.ts](../../../src/resumes/resumes.controller.ts)
- **Mã thành công:** 201, `message` = "Re-parsing queued successfully"

**Path params**

| Tên | Kiểu | Mô tả |
|---|---|---|
| `id` | string |  |

### `POST /api/v1/resumes/:id/reanalyze`

Chấm điểm lại hồ sơ bằng hàng đợi (quản trị viên hoặc HR)

- **Auth:** Đăng nhập, vai trò: SUPER ADMIN, HR
- **Handler:** `reanalyzeCV` trong [resumes.controller.ts](../../../src/resumes/resumes.controller.ts)
- **Mã thành công:** 201, `message` = "Re-analysis queued successfully"

**Path params**

| Tên | Kiểu | Mô tả |
|---|---|---|
| `id` | string |  |
