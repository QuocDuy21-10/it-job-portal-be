# CV Profiles (`cvprofiles`)

CV trực tuyến có cấu trúc của người dùng. Mỗi người dùng có tối đa **một** CV (quan hệ 1-1 với `users`). CV này được dùng khi nộp hồ sơ nhanh và làm nguồn dữ liệu cho chấm điểm phù hợp.

- **Nguồn schema:** [cv-profile.schema.ts](../../../src/cv-profiles/schemas/cv-profile.schema.ts)
- **Tên collection:** `cvprofiles`. Schema không khai báo `collection` nên Mongoose tự đặt tên từ model `CvProfile`.
- **Phân loại dữ liệu:** **dữ liệu cá nhân nhạy cảm**: họ tên, điện thoại, email, ngày sinh, giới tính, địa chỉ, ảnh, học vấn, kinh nghiệm. Không ghi các giá trị này vào log hay ví dụ công khai.
- **Soft-delete:** plugin thêm `isDeleted` và `deletedAt`, nhưng service xóa CV bằng `deleteOne` nên bản ghi bị **xóa thật** ([cv-profiles.service.ts](../../../src/cv-profiles/cv-profiles.service.ts)).

## Data dictionary

| Field | Type | Required | Default | Ràng buộc | Ý nghĩa |
|---|---|---|---|---|---|
| `userId` | Mixed | Có | — | ref: `User`; unique | Chủ sở hữu CV. Duy nhất, mỗi người một CV |
| `personalInfo` | Subdoc | Có | — | — | Thông tin cá nhân. Embedded, bắt buộc |
| `personalInfo.fullName` | String | Có | — | — | Họ tên đầy đủ |
| `personalInfo.title` | String | Không | — | — | Chức danh hoặc vị trí mong muốn |
| `personalInfo.avatar` | String | Không | — | — | Đường dẫn ảnh đại diện |
| `personalInfo.phone` | String | Có | — | — | Số điện thoại |
| `personalInfo.email` | String | Có | — | — | Email liên hệ |
| `personalInfo.birthday` | String | Không | — | — | Ngày sinh, dạng chuỗi |
| `personalInfo.gender` | String | Không | — | — | Giới tính, dạng chuỗi tự do |
| `personalInfo.address` | String | Không | — | — | Địa chỉ |
| `personalInfo.personalLink` | String | Không | — | — | Liên kết cá nhân (website, LinkedIn, GitHub) |
| `personalInfo.bio` | String | Không | — | — | Giới thiệu bản thân |
| `education` | [Subdoc] | Không | `[]` | — | Danh sách học vấn |
| `education.id` | String | Có | — | — | Mã phần tử do giao diện sinh |
| `education.school` | String | Có | — | — | Tên trường |
| `education.degree` | String | Có | — | — | Bằng cấp |
| `education.field` | String | Có | — | — | Chuyên ngành |
| `education.startDate` | String | Có | — | — | Ngày bắt đầu, dạng chuỗi |
| `education.endDate` | String | Có | — | — | Ngày kết thúc, dạng chuỗi |
| `education.description` | String | Không | — | — | Mô tả thêm |
| `experience` | [Subdoc] | Không | `[]` | — | Danh sách kinh nghiệm làm việc |
| `experience.id` | String | Có | — | — | Mã phần tử do giao diện sinh |
| `experience.company` | String | Có | — | — | Tên công ty |
| `experience.position` | String | Có | — | — | Vị trí đảm nhiệm |
| `experience.startDate` | String | Có | — | — | Ngày bắt đầu, dạng chuỗi |
| `experience.endDate` | String | Có | — | — | Ngày kết thúc, dạng chuỗi |
| `experience.description` | String | Không | — | — | Mô tả công việc |
| `skills` | [Subdoc] | Không | `[]` | — | Danh sách kỹ năng |
| `skills.id` | String | Có | — | — | Mã phần tử do giao diện sinh |
| `skills.name` | String | Có | — | — | Tên kỹ năng |
| `skills.level` | String | Có | — | — | Mức độ thành thạo, chuỗi tự do |
| `languages` | [Subdoc] | Không | `[]` | — | Danh sách ngoại ngữ |
| `languages.id` | String | Có | — | — | Mã phần tử do giao diện sinh |
| `languages.name` | String | Có | — | — | Tên ngôn ngữ |
| `languages.proficiency` | String | Có | — | — | Mức độ sử dụng, chuỗi tự do |
| `projects` | [Subdoc] | Không | `[]` | — | Danh sách dự án |
| `projects.id` | String | Có | — | — | Mã phần tử do giao diện sinh |
| `projects.name` | String | Có | — | — | Tên dự án |
| `projects.position` | String | Có | — | — | Vai trò trong dự án |
| `projects.description` | String | Không | — | — | Mô tả dự án |
| `projects.link` | String | Không | — | — | Liên kết dự án |
| `certificates` | [Subdoc] | Không | `[]` | — | Danh sách chứng chỉ |
| `certificates.id` | String | Có | — | — | Mã phần tử do giao diện sinh |
| `certificates.name` | String | Có | — | — | Tên chứng chỉ |
| `certificates.issuer` | String | Có | — | — | Đơn vị cấp |
| `certificates.date` | String | Có | — | — | Ngày cấp, dạng chuỗi |
| `awards` | [Subdoc] | Không | `[]` | — | Danh sách giải thưởng |
| `awards.id` | String | Có | — | — | Mã phần tử do giao diện sinh |
| `awards.name` | String | Có | — | — | Tên giải thưởng |
| `awards.date` | String | Có | — | — | Ngày nhận, dạng chuỗi |
| `awards.description` | String | Không | — | — | Mô tả thêm |
| `isActive` | Boolean | Không | `true` | — | CV đang bật. `false` thì không dùng để nộp hồ sơ |
| `lastUpdated` | Date | Không | — | — | Lần lưu gần nhất, đặt bởi hook `pre('save')` |
| `createdAt` | Date | Không | `(fn)` | — | Thời điểm tạo |
| `updatedAt` | Date | Không | `(fn)` | — | Thời điểm sửa gần nhất |
| `isDeleted` | Boolean | Có | `false` | thêm bởi plugin xóa mềm | Cờ xóa mềm. `true` nghĩa là bản ghi đã bị xóa khỏi nghiệp vụ nhưng vẫn còn trong database |
| `deletedAt` | Date | Không | `null` | thêm bởi plugin xóa mềm | Thời điểm xóa mềm |

Các mảng con (`education`, `experience`, ...) khai báo `_id: false` nên phần tử không có `_id` riêng. Mỗi phần tử có `id` kiểu chuỗi do phía giao diện sinh ra. Mọi trường ngày (`startDate`, `endDate`, `date`, `birthday`) có kiểu **String**, không phải Date, nên Mongoose không kiểm tra định dạng và không so sánh theo thời gian được.

## Indexes

| Keys | Thuộc tính | Mục đích |
|---|---|---|
| `{ userId: 1 }` | unique | Tìm CV theo chủ sở hữu. Có hai khai báo, xem Known Limitation |
| `{ userId: 1 }` | — | Khai báo thứ hai cho cùng key, không unique |
| `{ personalInfo.email: 1 }` | — | Tra cứu theo email trong CV |
| `{ personalInfo.phone: 1 }` | — | Tra cứu theo số điện thoại trong CV |

### Known Limitation: index `userId` bị khai báo hai lần

`userId` vừa có `unique: true` trên field vừa có `CvProfileSchema.index({ userId: 1 })`. Hai khai báo có cùng key pattern và khác option, Mongoose cũng sẽ cảnh báo duplicate index khi khởi động. Chưa kiểm tra index thực tế trên database (`getIndexes()`), nên không chắc ràng buộc unique có tồn tại. Trạng thái: `Chưa xác minh`.

## Quan hệ

| Field | Loại | Đích |
|---|---|---|
| `userId` | Reference, `ref: 'User'` | `users` |

**Known Limitation:** `userId` khai báo `type: Types.ObjectId` (kiểu giá trị của driver, không phải `Schema.Types.ObjectId`). Qua `@nestjs/mongoose`, Mongoose coi field là **Mixed** và truy vấn không ép chuỗi sang ObjectId (đã kiểm tra: `find({ userId: '<chuỗi>' })` cast ra `String`). Code hiện tại luôn bọc `new Types.ObjectId(userId)` (ví dụ `findByUserId`) nên dữ liệu thực tế là ObjectId. Truy vấn mới viết mà truyền chuỗi sẽ không khớp. Cùng vấn đề ở các collection `chat_*` và `ai_usage_logs`, xem [database-overview](../database-overview.md#kiểu-objectid-thực-tế).

Họ tên, email và ảnh của CV được đồng bộ với `users` bởi [profile-identity-sync.service.ts](../../../src/profile-identity/profile-identity-sync.service.ts).

## Quy tắc nghiệp vụ

- `personalInfo` bắt buộc, trong đó `fullName`, `phone`, `email` bắt buộc. `userId` bắt buộc và duy nhất.
- Các mục `education`, `experience`, `skills`, `languages`, `projects`, `certificates`, `awards` mặc định là mảng rỗng.
- `isActive: false` nghĩa là CV đang tắt: nộp hồ sơ bằng CV này bị từ chối với thông báo "Your CV profile is inactive" ([application-submission.service.ts](../../../src/resumes/services/application-submission.service.ts)).
- Hook `pre('save')` đặt `lastUpdated` mỗi lần `save()`. Hook này **không** chạy với `updateOne`/`findOneAndUpdate`, nên cập nhật bằng các hàm đó không làm đổi `lastUpdated`. Chưa kiểm tra service dùng hàm nào. Trạng thái: `Chưa xác minh`.

## Ví dụ document

Dữ liệu giả.

```json
{
  "_id": "665f1a2b3c4d5e6f70819a01",
  "userId": "665f1a2b3c4d5e6f70819201",
  "personalInfo": {
    "fullName": "Nguyen Van A",
    "title": "Backend Engineer",
    "phone": "0900000000",
    "email": "candidate@example.com",
    "address": "Ho Chi Minh City"
  },
  "education": [
    { "id": "edu-1", "school": "Example University", "degree": "Bachelor", "field": "Computer Science", "startDate": "2018-09", "endDate": "2022-06" }
  ],
  "experience": [
    { "id": "exp-1", "company": "Example Software Co.", "position": "Backend Engineer", "startDate": "2022-07", "endDate": "2026-09", "description": "Built REST APIs." }
  ],
  "skills": [{ "id": "sk-1", "name": "Node.js", "level": "advanced" }],
  "languages": [{ "id": "lg-1", "name": "English", "proficiency": "intermediate" }],
  "projects": [],
  "certificates": [],
  "awards": [],
  "isActive": true,
  "lastUpdated": "2026-10-02T03:00:00.000Z"
}
```

Định dạng chuỗi ngày (`2018-09`) và giá trị `level`/`proficiency` trong ví dụ là minh họa. Schema không ràng buộc các giá trị này.
