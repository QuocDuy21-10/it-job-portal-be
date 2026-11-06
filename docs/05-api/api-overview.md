# Tổng quan API

REST API của DevLink Backend: 116 route trên 16 controller. Tài liệu này mô tả các quy ước chung; từng route nằm ở [endpoints/](endpoints/). Phần thời gian thực (Socket.IO, stream chat) ở [realtime.md](realtime.md).

## Địa chỉ và tài liệu tương tác

| Hạng mục | Giá trị | Nguồn |
|---|---|---|
| Tiền tố | `/api/v1` | `setGlobalPrefix('api')` và `enableVersioning({ type: URI, defaultVersion: ['1'] })` trong [app.setup.ts](../../src/app.setup.ts) |
| Cổng local | `8081` (biến `PORT`) | [env.validation.ts](../../src/config/env.validation.ts) |
| Swagger UI | `http://localhost:8081/api` | [main.ts](../../src/main.ts) |
| Khi nào bật Swagger | Khi `NODE_ENV` khác `production`, hoặc `SWAGGER_ENABLED=true` | [main.ts](../../src/main.ts) |
| Bảo mật trong Swagger | Bearer JWT, tên scheme `token` | [main.ts](../../src/main.ts) |

Swagger là nguồn mô tả chính thức theo thời gian thực của route; các bảng trong thư mục này sinh từ cùng decorator (`@ApiOperation`, `@ApiQuery`, `@ApiResponse`) và DTO, nhưng không tự cập nhật. Khi hai nguồn khác nhau, Swagger và code đúng.

## Xác thực

| Cách | Chi tiết |
|---|---|
| Header | `Authorization: Bearer <access_token>`. Access token nhận từ `POST /auth/login` trong body phản hồi |
| Refresh token | Cookie `refresh_token` (`httpOnly`, `sameSite=strict`, `secure` ở production). Client không đọc được; gọi `GET /auth/refresh` kèm cookie để lấy access token mới |
| Mặc định | **Mọi route cần JWT** trừ route gắn `@Public()`. `@OptionalAuth()` nhận cả khách lẫn người dùng đăng nhập |
| Vai trò | `@Roles(...)` giới hạn theo `SUPER ADMIN`, `HR`, `NORMAL USER`. Xem [user-roles](../01-product/user-roles.md) |
| Kiểm tra trạng thái | Mỗi request kiểm tra tài khoản còn hoạt động, chưa khóa, chưa xóa, không chờ xóa |

Cột "Auth" trong từng tài liệu endpoint đọc từ decorator của route và của class controller.

## Định dạng phản hồi thành công

`TransformInterceptor` bọc kết quả của handler ([transform.interceptor.ts](../../src/utils/transform.interceptor.ts)):

```json
{
  "statusCode": 200,
  "message": "Get list jobs",
  "data": { }
}
```

| Field | Giá trị |
|---|---|
| `statusCode` | Mã HTTP của phản hồi |
| `message` | Chuỗi từ `@ResponseMessage('...')`, hoặc `null` nếu route không khai báo |
| `data` | Giá trị handler trả về |

Route gắn `@SkipTransform()` **không** được bọc, ví dụ các route stream chat.

Mã thành công mặc định của Nest: `201` cho `POST`, `200` cho các method còn lại, trừ khi có `@HttpCode`.

## Định dạng lỗi

Dự án **không** có exception filter tùy biến cho nội dung lỗi. `SentryGlobalFilter` chỉ báo lỗi không phải `HttpException` lên Sentry và giữ nguyên phản hồi ([app.module.ts](../../src/app.module.ts)). Vì vậy lỗi theo dạng mặc định của NestJS:

```json
{
  "message": "Job with ID 665f1a2b3c4d5e6f70819301 not found",
  "error": "Not Found",
  "statusCode": 404
}
```

| Mã | Nguyên nhân thường gặp |
|---|---|
| `400` | DTO sai (`message` là **mảng** các lỗi validate), ID không đúng định dạng, vi phạm quy tắc nghiệp vụ |
| `401` | Thiếu hoặc sai token, tài khoản bị khóa hoặc vô hiệu |
| `403` | Sai vai trò, hoặc tài khoản đang chờ xóa |
| `404` | Không tìm thấy bản ghi |
| `429` | Vượt giới hạn tốc độ |

Lỗi validate dạng mảng, ví dụ: `{ "message": ["email must be an email"], "error": "Bad Request", "statusCode": 400 }`.

**Known Limitation:** một số nơi dùng `400` cho lỗi thiếu quyền (ví dụ `GET /resumes/:id/analysis` và HR xem công ty khác) thay vì `403`, nên client không nên dựa vào `403` để nhận biết thiếu quyền. Với route stream, lỗi sau khi đã gửi header không đổi được mã HTTP; xem [realtime.md](realtime.md).

## Validation

`ValidationPipe({ whitelist: true })` toàn cục ([app.setup.ts](../../src/app.setup.ts)):

- Field **không có** decorator trong DTO bị **loại bỏ im lặng** khỏi body, không báo lỗi (`forbidNonWhitelisted` không bật).
- `transform` không bật, nên query string vẫn là chuỗi khi vào handler (nhiều service tự ép `+page`, `+limit`).
- DTO dùng `class-validator`; bảng DTO trong từng endpoint liệt kê decorator của mỗi field.

## Phân trang, lọc và sắp xếp

### Phân trang

Các route danh sách phân trang nhận `page` (từ 1) và `limit`, và trả:

```json
{
  "statusCode": 200,
  "message": "Get list jobs",
  "data": {
    "result": [],
    "meta": {
      "pagination": {
        "current_page": 1,
        "per_page": 10,
        "total_pages": 0,
        "total": 0
      }
    }
  }
}
```

Dạng `result` + `meta.pagination` có ở `jobs`, `skills`, `subscribers`, `resumes`, `users`, `job-search` và các danh sách tương tự. **Ngoại lệ:** `GET /cv-profiles` trả `{ data, total, page, limit }` ([cv-profiles.service.ts](../../src/cv-profiles/cv-profiles.service.ts)). Giá trị mặc định `limit` thường là 10; trần tối đa khác nhau theo route và được ghi ở bảng query của từng endpoint.

### Lọc và sắp xếp bằng query string

Nhiều route danh sách đọc bộ lọc từ toàn bộ query string bằng thư viện [`api-query-params`](https://www.npmjs.com/package/api-query-params) (`aqp`). Ví dụ `GET /api/v1/jobs?level=Senior&sort=-createdAt&page=1&limit=10`. Cú pháp cụ thể (toán tử so sánh, regex, `sort=-field`) do thư viện quy định; tài liệu này không liệt kê lại.

Mức lọc đầu vào **không đồng nhất** giữa các service:

| Service | Allowlist trường lọc/sắp xếp | Chặn toán tử nguy hiểm |
|---|---|---|
| `jobs`, `users`, `companies` | Có (`ALLOWED_FILTER_FIELDS`, `ALLOWED_SORT_FIELDS`) | Có (`$where`, `$function`, `$expr`, `$accumulator`, `$jsReduce`) |
| `resumes` | Có định nghĩa, nhưng lời gọi `sanitizeAqpQuery` **bị comment** ([resumes.service.ts](../../src/resumes/resumes.service.ts)) | Không áp dụng |
| `skills`, `notifications` | Không | Không |

**Known Limitation (mức trung bình, chưa kiểm chứng khai thác):** `GET /resumes` nhận bộ lọc, `populate` và `projection` thô từ query string. Route chỉ cho `HR` và `SUPER ADMIN`, và phạm vi công ty của HR được gán **sau** khi parse (`filter.companyId = user.company._id`), nên HR không đổi được công ty qua query. Tuy vậy việc không lọc toán tử và cho phép `populate` tùy ý là bề mặt tấn công không cần thiết. `GET /notifications` cũng giữ `filter.userId` sau parse nhưng nhận `populate` và `projection` thô. Chưa thử khai thác thực tế vì chưa chạy được MongoDB.

## Giới hạn tốc độ

`ThrottlerModule` khai báo ba mức dùng chung ([app.module.ts](../../src/app.module.ts)), lưu trong Redis:

| Tên | Cửa sổ | Giới hạn |
|---|---|---|
| `burst` | 1 giây | 5 |
| `sustained` | 10 giây | 20 |
| `default` | 60 giây | 60 |

**Chỉ có hiệu lực ở controller hoặc route gắn `ThrottlerGuard`**: `auth`, `chat`, `job-search`, `resumes` (route `cv-online`, `upload-cv`). Các route khác không bị giới hạn tốc độ. `@Throttle` trên route ghi đè mức `default`. Vượt giới hạn trả `429`. IP lấy từ `X-Forwarded-For` khi đặt `TRUST_PROXY`.

## CORS và header

| Hạng mục | Giá trị |
|---|---|
| Origin cho phép | Danh sách trong `CORS_ORIGINS` (hoặc `FE_URL`), cách nhau bằng dấu phẩy |
| Method | `GET, HEAD, PUT, PATCH, POST, DELETE` |
| Cookie | `credentials: true` |
| `X-Request-Id` | Tái dùng nếu hợp lệ (`^[\w-]{1,128}$`), nếu không sinh UUID; luôn trả lại trong header phản hồi |
| Security header | `helmet()` mặc định |

## Danh sách tài liệu endpoint

| Nhóm | Tài liệu | Số route |
|---|---|---|
| Xác thực | [auth](endpoints/auth.md) | 17 |
| Người dùng | [users](endpoints/users.md) | 14 |
| Công ty | [companies](endpoints/companies.md) | 8 |
| Tin tuyển dụng | [jobs](endpoints/jobs.md) | 7 |
| Hồ sơ ứng tuyển | [resumes](endpoints/resumes.md) | 14 |
| CV trực tuyến | [cv-profiles](endpoints/cv-profiles.md) | 9 |
| Kỹ năng | [skills](endpoints/skills.md) | 8 |
| Đăng ký gợi ý | [subscribers](endpoints/subscribers.md) | 7 |
| Thông báo | [notifications](endpoints/notifications.md) | 5 |
| Chat AI | [chat](endpoints/chat.md) | 15 |
| Tìm kiếm hợp nhất | [job-search](endpoints/job-search.md) | 2 |
| Nguồn tin ngoài | [job-sources](endpoints/job-sources.md) | 4 |
| File | [files](endpoints/files.md) | 2 |
| Thống kê | [statistics](endpoints/statistics.md) | 2 |
| Email | [mail](endpoints/mail.md) | 1 |
| Sức khỏe | [health](endpoints/health.md) | 1 |

Controller `databases` không có route nào.
