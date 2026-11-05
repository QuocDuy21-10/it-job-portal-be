# Resumes (`resumes`)

Hồ sơ ứng tuyển: một ứng viên nộp CV cho một tin tuyển dụng. Bản ghi chứa trạng thái xử lý của nhà tuyển dụng, dữ liệu CV đã trích xuất và kết quả chấm điểm phù hợp.

- **Nguồn schema:** [resume.schema.ts](../../../src/resumes/schemas/resume.schema.ts)
- **Phân loại dữ liệu:** **nhiều dữ liệu cá nhân**: email, số điện thoại, họ tên, học vấn, kinh nghiệm, và `cvStructuredData` là bản sao toàn bộ CV. Không được ghi các giá trị này vào log hay ví dụ công khai.
- **Soft-delete:** có.

## Data dictionary

| Field | Type | Required | Default | Ràng buộc | Ý nghĩa |
|---|---|---|---|---|---|
| `email` | String | Không | — | — | Email ứng viên lúc nộp hồ sơ |
| `userId` | ObjectId | Không | — | — | Ứng viên nộp hồ sơ |
| `url` | String | Không | — | — | Đường dẫn file CV đã tải lên |
| `status` | String | Có | `"PENDING"` | enum: `REJECTED`, `APPROVED`, `INTERVIEWING`, `REVIEWING`, `PENDING` | Trạng thái xử lý hồ sơ của nhà tuyển dụng, mặc định `PENDING` |
| `companyId` | ObjectId | Không | — | ref: `Company` | Công ty nhận hồ sơ, dùng để giới hạn phạm vi xem của HR |
| `jobId` | ObjectId | Không | — | ref: `Job` | Tin tuyển dụng được ứng tuyển |
| `parsedData` | Mixed | Không | — | — | Dữ liệu CV đã trích xuất (xem cấu trúc bên dưới) |
| `aiAnalysis` | Mixed | Không | — | — | Kết quả chấm điểm phù hợp (xem cấu trúc bên dưới) |
| `priority` | String | Không | `"LOW"` | enum: `EXCELLENT`, `HIGH`, `MEDIUM`, `LOW` | Mức ưu tiên suy ra từ điểm phù hợp, mặc định `LOW` |
| `adminNotes` | String | Không | — | — | Ghi chú của quản trị viên |
| `hrNotes` | String | Không | — | — | Ghi chú của nhà tuyển dụng |
| `isParsed` | Boolean | Không | `false` | — | Đã đọc xong nội dung CV |
| `isAnalyzed` | Boolean | Không | `false` | — | Đã chấm điểm xong |
| `parseError` | String | Không | — | — | Thông báo lỗi nếu đọc CV thất bại |
| `analysisError` | String | Không | — | — | Thông báo lỗi nếu chấm điểm thất bại |
| `cvStructuredData` | Mixed | Không | — | — | Bản sao CV trực tuyến tại thời điểm nộp. Dạng `Object` tự do |
| `histories` | [Mixed] | Không | — | — | Nhật ký đổi trạng thái (xem cấu trúc bên dưới) |
| `createdBy` | Mixed | Không | — | — | Người tạo bản ghi, dạng `{ _id, email }` |
| `updatedBy` | Mixed | Không | — | — | Người sửa gần nhất, dạng `{ _id, email }` |
| `deletedBy` | Mixed | Không | — | — | Người xóa mềm, dạng `{ _id, email }` |
| `createdAt` | Date | Không | — | — | Thời điểm tạo, do `timestamps` hoặc plugin |
| `updatedAt` | Date | Không | — | — | Thời điểm sửa gần nhất, do `timestamps` |
| `isDeleted` | Boolean | Không | — | — | Cờ xóa mềm. `true` nghĩa là bản ghi đã bị xóa khỏi nghiệp vụ nhưng vẫn còn trong database |
| `deletedAt` | Date | Không | — | — | Thời điểm xóa mềm |

Các field `parsedData`, `aiAnalysis`, `histories` hiển thị là Mixed trong Mongoose vì khai báo bằng lớp lồng không export. Cấu trúc thật mô tả ở phần dưới. `cvStructuredData` là `type: Object` tự do.

### Cấu trúc `parsedData`

Dữ liệu CV đã chuẩn hóa dùng để chấm điểm.

| Field | Type | Ý nghĩa |
|---|---|---|
| `parsedData.fullName`, `.email`, `.phone` | String | Thông tin liên hệ |
| `parsedData.skills` | [String] | Kỹ năng gốc ứng viên ghi |
| `parsedData.normalizedSkills` | [String] | Kỹ năng đã ghép với danh mục [skills](skills.md) |
| `parsedData.unmappedSkills` | [String] | Kỹ năng không khớp danh mục |
| `parsedData.experience[]` | `{ company, position, duration, description }` | Kinh nghiệm làm việc |
| `parsedData.education[]` | `{ school, degree, major, duration, gpa? }` | Học vấn |
| `parsedData.summary` | String | Tóm tắt |
| `parsedData.yearsOfExperience` | Number | Số năm kinh nghiệm |

### Cấu trúc `aiAnalysis`

| Field | Type | Ý nghĩa |
|---|---|---|
| `aiAnalysis.matchingScore` | Number, min 0, max 100 | Điểm phù hợp tổng |
| `aiAnalysis.skillsMatch[]` | `{ skill, matched, proficiencyLevel? }` | Chi tiết từng kỹ năng của tin |
| `aiAnalysis.strengths`, `.weaknesses` | [String] | Điểm mạnh, điểm yếu |
| `aiAnalysis.summary`, `.recommendation` | String | Nhận xét và đề xuất |
| `aiAnalysis.analyzedAt` | Date | Thời điểm chấm điểm |

Tên `aiAnalysis` dễ gây hiểu nhầm: điểm `matchingScore` do `MatchingService` tính bằng code tất định, không phải do mô hình AI chấm ([matching.service.ts](../../../src/matching/matching.service.ts) không import nhà cung cấp AI). Xem `cv-parsing-and-matching.md` (Phase 3).

### Cấu trúc `histories`

Mảng nhật ký đổi trạng thái: `{ status, updatedAt, updatedBy: { _id, email } }`. Mỗi lần đổi `status` qua API sẽ `$push` một phần tử mới. Phần tử đầu tiên là `PENDING` lúc nộp.

## Indexes

| Keys | Thuộc tính | Mục đích |
|---|---|---|
| `{ priority: 1 }` | — | Lọc theo mức ưu tiên |
| `{ status: 1, priority: 1 }` | — | Lọc theo trạng thái và ưu tiên |
| `{ companyId: 1, status: 1, priority: 1 }` | — | Danh sách hồ sơ của một công ty theo trạng thái và ưu tiên |
| `{ aiAnalysis.matchingScore: -1 }` | — | Sắp xếp theo điểm phù hợp giảm dần |
| `{ jobId: 1, status: 1 }` | — | Danh sách hồ sơ của một tin theo trạng thái |
| `{ userId: 1, createdAt: -1 }` | — | Lịch sử ứng tuyển của một ứng viên, mới nhất trước |
| `{ isParsed: 1, isAnalyzed: 1 }` | — | Tìm hồ sơ chưa được xử lý xong |
| `{ userId: 1, jobId: 1, isDeleted: 1 }` | — | Kiểm tra ứng viên đã nộp cho tin này chưa |

## Quan hệ

| Field | Loại | Đích |
|---|---|---|
| `userId` | ObjectId, không có `ref` | `users`, ứng viên |
| `companyId` | Reference | `companies` |
| `jobId` | Reference | `jobs` |
| `cvStructuredData` | Embedded (bản sao) | Ảnh chụp [cv-profiles](cv-profiles.md) tại thời điểm nộp |

`userId` là ObjectId nhưng không khai báo `ref` (nên không `populate` trực tiếp được) và không `required`. `url` và `email` cũng không bắt buộc. Nghĩa là schema không đảm bảo một hồ sơ luôn có chủ sở hữu hay file CV; việc đó do service kiểm tra.

## Quy tắc nghiệp vụ

**Hai đường nộp hồ sơ:**

| Đường | Khi nào | Xử lý |
|---|---|---|
| CV trực tuyến | Ứng viên nộp bằng `CvProfile` | [application-submission.service.ts](../../../src/resumes/services/application-submission.service.ts) chấm điểm **ngay trong request**, đặt `isParsed` và `isAnalyzed` thành `true`, sao chép CV vào `cvStructuredData` |
| Tải file CV | Ứng viên gửi `url` file | Việc đọc và chấm điểm đi qua hàng đợi `resume-processing` (xem [data-flow](../../02-architecture/data-flow.md#bảy-hàng-đợi)) |

**Trùng đơn:** `checkDuplicateApplication` ngăn một người nộp hai lần cho cùng tin.

**Trạng thái và ưu tiên:**

- `status` khởi tạo là `PENDING`. Người xử lý đổi qua `PATCH`, và code **không kiểm tra thứ tự chuyển** nên mọi trạng thái đều được chấp nhận.
- `priority` suy ra từ `matchingScore` theo ngưỡng `EXCELLENT` ≥ 85, `HIGH` ≥ 70, `MEDIUM` ≥ 50, còn lại `LOW` ([matching.constants.ts](../../../src/matching/constants/matching.constants.ts)). Trọng số điểm: kỹ năng 50%, kinh nghiệm 30%, học vấn 20%.
- Có hàm `determineAutoStatus` (điểm ≥ 85 và tỉ lệ kỹ năng ≥ 70 thì `APPROVED`, điểm < 30 và tỉ lệ < 30 thì `REJECTED`, còn lại `REVIEWING`), nhưng dòng gán `status` trong [resume-queue.processor.ts](../../../src/queues/processors/resume-queue.processor.ts) đang bị comment, nên **điểm chỉ ảnh hưởng `priority`, không tự đổi `status`**.

**Phạm vi HR:** HR chỉ xem và sửa hồ sơ có `companyId` trùng công ty của mình, ngược lại bị `ForbiddenException` ([resumes.service.ts](../../../src/resumes/resumes.service.ts)).

## Ví dụ document

Dữ liệu giả.

```json
{
  "_id": "665f1a2b3c4d5e6f70819701",
  "email": "candidate@example.com",
  "userId": "665f1a2b3c4d5e6f70819201",
  "jobId": "665f1a2b3c4d5e6f70819301",
  "companyId": "665f1a2b3c4d5e6f70819901",
  "status": "REVIEWING",
  "priority": "HIGH",
  "isParsed": true,
  "isAnalyzed": true,
  "parsedData": {
    "fullName": "Nguyen Van A",
    "skills": ["Node.js", "MongoDB"],
    "normalizedSkills": ["Node.js", "MongoDB"],
    "unmappedSkills": [],
    "yearsOfExperience": 4
  },
  "aiAnalysis": {
    "matchingScore": 78,
    "skillsMatch": [{ "skill": "Node.js", "matched": true }],
    "strengths": ["Strong backend experience"],
    "weaknesses": ["No cloud certification"],
    "analyzedAt": "2026-10-02T03:00:00.000Z"
  },
  "histories": [
    { "status": "PENDING", "updatedAt": "2026-10-02T03:00:00.000Z", "updatedBy": { "_id": "665f1a2b3c4d5e6f70819201", "email": "candidate@example.com" } }
  ],
  "isDeleted": false
}
```

## Lưu ý

- **Known Limitation:** không kiểm tra chuyển trạng thái, và `histories` không giới hạn kích thước.
- **Known Limitation:** `cvStructuredData` là bản sao đầy đủ CV (dữ liệu cá nhân), nên khi người dùng xóa hoặc sửa CV, bản trong hồ sơ ứng tuyển **không** đổi. Cách xử lý khi xóa tài khoản cần được kiểm tra ở `account-deletion`. Trạng thái: `Chưa xác minh`.
- `adminNotes` và `hrNotes` là ghi chú nội bộ, không nên trả về cho ứng viên. Quyền xem cụ thể: `Chưa xác minh`.
