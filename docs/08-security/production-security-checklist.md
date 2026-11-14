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
| Secret JWT, OTP đủ mạnh | Đã có | Ở production `validateEnv` từ chối khởi động khi secret ngắn hơn 32 ký tự ([env.validation.ts](../../src/config/env.validation.ts)) |
| Hai secret JWT khác nhau cho access và refresh | Đã có | Hai biến riêng; ở production `validateEnv` từ chối hai giá trị trùng nhau |
| Mật khẩu Mongo, Redis ngẫu nhiên và mạnh | Một phần | Compose prod bắt buộc đặt (`:?`); độ mạnh do người vận hành. Mẫu local dùng `123456` |
| Ứng dụng kết nối MongoDB bằng quyền tối thiểu | Chưa có | Compose prod dùng tài khoản root cho `MONGO_URL` |
| Xoay vòng khóa | Chưa có | `DEPLOYMENT.md` chỉ nhắc xoay vòng, không có quy trình; đổi `JWT_*` đăng xuất mọi người |

## Mạng và truyền tải

| Hạng mục | Trạng thái | Bằng chứng |
|---|---|---|
| Chỉ backend được publish, chỉ trên `127.0.0.1` | Đã có | [docker-compose.prod.yml](../../docker-compose.prod.yml) |
| Mongo, Redis không publish ra ngoài | Đã có | như trên; mạng `backend` nội bộ |
| Redis có mật khẩu, bật AOF | Đã có | `--requirepass`, `--appendonly yes` |
| TLS | Chưa xác minh | Caddy trong compose (`Caddyfile`), chưa kiểm chứng với chứng chỉ thật ([deployment](../09-infrastructure/deployment.md)) |
| `TRUST_PROXY` đặt đúng | Chưa xác minh | Cấu hình tay; sai thì rate limit theo IP của proxy |
| Tường lửa chỉ mở SSH, 80, 443 | Chưa xác minh | Khuyến nghị trong `DEPLOYMENT.md`, không thể kiểm tra |
| Cookie refresh `Secure` + `SameSite=Strict` | Đã có | Ở `NODE_ENV=production`; yêu cầu frontend và API cùng site qua HTTPS |

## Ứng dụng

| Hạng mục | Trạng thái | Bằng chứng |
|---|---|---|
| Header bảo mật | Đã có | `helmet()` mặc định, [app.setup.ts](../../src/app.setup.ts) |
| CORS allowlist, có credentials | Đã có | `CORS_ORIGINS` |
| WebSocket thông báo | Đã có | Allowlist origin từ `CORS_ORIGINS`, chỉ nhận access token, kiểm tra trạng thái tài khoản lúc kết nối ([notifications.gateway.ts](../../src/notifications/notifications.gateway.ts)). Socket đã kết nối không bị ngắt khi tài khoản bị khóa sau đó |
| Swagger tắt ở production | Đã có | Chỉ bật khi `SWAGGER_ENABLED=true` |
| Validate đầu vào, bỏ field lạ | Đã có | `ValidationPipe({ whitelist: true })` |
| Lọc truy vấn từ query string | Một phần | Có cho `jobs`, `users`, `companies`; không cho `resumes`, `skills`, `notifications` |
| Rate limit | Đã có | `ThrottlerGuard` toàn cục: nền 20/giây, 100/10 giây, 300/phút theo IP và route; `auth`, `chat`, `job-search` giữ mức chặt ([api-overview](../05-api/api-overview.md#giới-hạn-tốc-độ)) |
| Phân quyền theo vai trò | Một phần | Có `@Roles`; CASL chưa được thực thi ([authorization](authorization.md)) |
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
| File tải lên có kiểm soát loại, dung lượng, tên | Đã có | Theo MIME và đuôi do client khai báo; không kiểm tra magic bytes. Rủi ro chấp nhận: file được đổi tên thành UUID với đuôi từ allowlist, không nhận SVG hay HTML, helmet gửi `nosniff` |
| File CV cần xác thực để tải | Đã có | Lưu ngoài `public/`, trả qua endpoint có kiểm tra quyền (`test/resumes.e2e-spec.ts`) |
| Xóa tài khoản xóa đủ dữ liệu cá nhân | Chưa có | [account-deletion](../06-workflows/use-cases/account-deletion.md#dữ-liệu-sau-khi-xóa) |
| Seed không tạo tài khoản mẫu ở production | Đã có | Dữ liệu mẫu chỉ tạo khi `NODE_ENV` là `development` hoặc `test` ([seed.service.ts](../../src/databases/seeds/seed.service.ts)) |
| Sao lưu có lịch và đã thử khôi phục | Chưa xác minh | Chỉ có lệnh mẫu trong `DEPLOYMENT.md` |
| Sao lưu được mã hóa, giữ ngoài máy chủ | Chưa xác minh | `DEPLOYMENT.md` chỉ nói "copy off the server" |
| Giám sát, cảnh báo | Một phần | Health check, Sentry (nếu có DSN), metric Prometheus và alert email qua profile `monitoring` ([alerts](../11-operations/alerts.md)) |
| Quét phụ thuộc | Một phần | CI `npm audit --omit=dev --audit-level=critical` (chỉ mức critical) và Dependabot hằng tuần |
| Tuân thủ quy định bảo vệ dữ liệu | Chưa xác minh | Ngoài phạm vi tài liệu |

## Seed ở production

Ngoài `development` và `test`, `npm run seed` chỉ tạo kỹ năng, nguồn tin và tài khoản `EMAIL_ADMIN`, và từ chối `INIT_PASSWORD` ngắn hơn 12 ký tự. Nếu trước đây đã chạy seed đầy đủ trên máy chủ thật thì các tài khoản `@seed.local` vẫn còn: xóa chúng thủ công.

## Kiểm tra nhanh trước khi mở

1. Đặt đủ biến bắt buộc; `NODE_ENV=production`; `SWAGGER_ENABLED` không đặt.
2. Mật khẩu và secret sinh ngẫu nhiên.
3. Không còn tài khoản `@seed.local` nào trong database.
4. Reverse proxy có TLS; `TRUST_PROXY=1`; đóng mọi cổng ngoài SSH và 80/443.
5. Có lịch sao lưu đã thử khôi phục.
6. Có `SENTRY_DSN` và theo dõi `GET /api/v1/health/ready`.
