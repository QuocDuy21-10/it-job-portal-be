# Checklist bảo mật production

Mỗi mục có trạng thái dựa trên **bằng chứng trong repository**, không phải khẳng định rằng hệ thống an toàn:

| Nhãn | Nghĩa |
|---|---|
| Đã có | Có trong code hoặc cấu hình, đã đối chiếu |
| Một phần | Có nhưng chưa đủ hoặc chưa nhất quán |
| Chưa có | Không thấy trong source |
| Chưa xác minh | Phụ thuộc môi trường chạy thật, chưa kiểm tra được |

Cần người vận hành tự xác nhận các mục `Chưa xác minh` trên hệ thống đang chạy trước khi coi là sẵn sàng.

## Cấu hình và bí mật

| Hạng mục | Trạng thái | Bằng chứng |
|---|---|---|
| File `.env` thật không nằm trong git | Đã có | `.gitignore` chặn `.env`, `.env.production`; chỉ `.env.example` được track |
| `.env.example` không chứa khóa thật | Đã có | Đã quét mẫu khóa; chỉ có mật khẩu dev mẫu `123456` |
| App từ chối khởi động khi thiếu secret | Đã có | [env.validation.ts](../../src/config/env.validation.ts) |
| Ở production bắt buộc `FE_URL`, `CORS_ORIGINS` | Đã có | như trên |
| Secret JWT, OTP đủ mạnh | Chưa xác minh | Không kiểm tra độ dài; hướng dẫn dùng `openssl rand -hex 32` |
| Hai secret JWT khác nhau cho access và refresh | Đã có | Hai biến riêng |
| Mật khẩu Mongo, Redis ngẫu nhiên và mạnh | Một phần | Compose prod bắt buộc đặt (`:?`); độ mạnh do người vận hành. Mẫu local dùng `123456` |
| Ứng dụng kết nối MongoDB bằng quyền tối thiểu | Chưa có | Compose prod dùng tài khoản root cho `MONGO_URL` |
| Xoay vòng khóa | Chưa có | `DEPLOYMENT.md` chỉ nhắc xoay vòng, không có quy trình; đổi `JWT_*` đăng xuất mọi người |

## Mạng và truyền tải

| Hạng mục | Trạng thái | Bằng chứng |
|---|---|---|
| Chỉ backend được publish, chỉ trên `127.0.0.1` | Đã có | [docker-compose.prod.yml](../../docker-compose.prod.yml) |
| Mongo, Redis không publish ra ngoài | Đã có | như trên; mạng `backend` nội bộ |
| Redis có mật khẩu, bật AOF | Đã có | `--requirepass`, `--appendonly yes` |
| TLS | Chưa xác minh | Dựa vào nginx hoặc Caddy ngoài repository ([deployment](../09-infrastructure/deployment.md)) |
| `TRUST_PROXY` đặt đúng | Chưa xác minh | Cấu hình tay; sai thì rate limit theo IP của proxy |
| Tường lửa chỉ mở SSH, 80, 443 | Chưa xác minh | Khuyến nghị trong `DEPLOYMENT.md`, không thể kiểm tra |
| Cookie refresh `Secure` + `SameSite=Strict` | Đã có | Ở `NODE_ENV=production`; yêu cầu frontend và API cùng site qua HTTPS |

## Ứng dụng

| Hạng mục | Trạng thái | Bằng chứng |
|---|---|---|
| Header bảo mật | Đã có | `helmet()` mặc định, [app.setup.ts](../../src/app.setup.ts) |
| CORS allowlist, có credentials | Đã có | `CORS_ORIGINS` |
| Swagger tắt ở production | Đã có | Chỉ bật khi `SWAGGER_ENABLED=true` |
| Validate đầu vào, bỏ field lạ | Đã có | `ValidationPipe({ whitelist: true })` |
| Lọc truy vấn từ query string | Một phần | Có cho `jobs`, `users`, `companies`; không cho `resumes`, `skills`, `notifications` |
| Rate limit | Một phần | Chỉ `auth`, `chat`, `job-search`, `resumes` (2 route); route khác không giới hạn |
| Phân quyền theo vai trò | Một phần | Có `@Roles`; lỗ hổng `cv-profiles` ([authorization](authorization.md)) |
| Chính sách mật khẩu | Một phần | Không nhất quán, không độ phức tạp |
| 2FA, khóa tài khoản sau nhiều lần sai | Chưa có | |
| Chống đoán OTP | Đã có | 5 lần sai, chờ 60 giây |
| Container chạy không phải root | Đã có | `USER nestjs` ở stage `production` |
| Ảnh Docker | Một phần | `node:24-alpine`; Dependabot theo dõi; không quét image trong CI |

## Dữ liệu và vận hành

| Hạng mục | Trạng thái | Bằng chứng |
|---|---|---|
| Che header nhạy cảm trong log | Đã có | Ba header |
| Không ghi dữ liệu cá nhân vào log | **Chưa có** | `cleanedText`, email lúc xóa tài khoản ([data-protection](data-protection.md#nơi-dữ-liệu-cá-nhân-xuất-hiện-trong-log-known-limitation)) |
| File tải lên có kiểm soát loại, dung lượng, tên | Đã có | |
| File CV cần xác thực để tải | Chưa có | Phục vụ tĩnh không xác thực |
| Xóa tài khoản xóa đủ dữ liệu cá nhân | Chưa có | [account-deletion](../06-workflows/use-cases/account-deletion.md#dữ-liệu-sau-khi-xóa) |
| Seed không tạo tài khoản mẫu ở production | **Chưa có** | Xem bên dưới |
| Sao lưu có lịch và đã thử khôi phục | Chưa xác minh | Chỉ có lệnh mẫu trong `DEPLOYMENT.md` |
| Sao lưu được mã hóa, giữ ngoài máy chủ | Chưa xác minh | `DEPLOYMENT.md` chỉ nói "copy off the server" |
| Giám sát, cảnh báo | Một phần | Health check, Sentry (nếu có DSN); không có metric hay cảnh báo hàng đợi |
| Quét phụ thuộc | Một phần | CI `npm audit --omit=dev --audit-level=critical` (chỉ mức critical) và Dependabot hằng tuần |
| Tuân thủ quy định bảo vệ dữ liệu | Chưa xác minh | Ngoài phạm vi tài liệu |

## Mục cần xử lý trước khi chạy production: seed

`DEPLOYMENT.md` mục 2.4 hướng dẫn chạy `npm run seed` ở lần triển khai đầu để tạo tài khoản quản trị. Seed ([seed.service.ts](../../src/databases/seeds/seed.service.ts), [users.data.ts](../../src/databases/seeds/data/users.data.ts)) tạo **một admin (`EMAIL_ADMIN`), 20 HR (tên `hr` kèm số thứ tự) và 75 ứng viên (tên `candidate` kèm số thứ tự), email đều thuộc tên miền `seed.local`**, cùng dùng một mật khẩu băm từ `INIT_PASSWORD`, kèm công ty, tin, CV và hồ sơ mẫu. Seed không kiểm tra môi trường. Nếu chạy nguyên trạng ở production sẽ có 95 tài khoản mẫu cùng mật khẩu đã biết, trong đó 20 HR có thể đăng tin.

Cách giảm thiểu hiện có: đặt `INIT_PASSWORD` mạnh và xóa các tài khoản `@seed.local` sau khi seed. Seed có idempotent (chạy lại có tạo trùng không): `Chưa xác minh`. Việc tách seed "chỉ admin" cho production là `Future Improvement`.

## Kiểm tra nhanh trước khi mở

1. Đặt đủ biến bắt buộc; `NODE_ENV=production`; `SWAGGER_ENABLED` không đặt.
2. Mật khẩu và secret sinh ngẫu nhiên.
3. Không seed dữ liệu mẫu, hoặc xóa tài khoản `@seed.local`.
4. Reverse proxy có TLS; `TRUST_PROXY=1`; đóng mọi cổng ngoài SSH và 80/443.
5. Xử lý rủi ro `cv-profiles` ([authorization](authorization.md)) trước khi có người dùng thật.
6. Có lịch sao lưu đã thử khôi phục.
7. Có `SENTRY_DSN` và theo dõi `GET /api/v1/health`.
