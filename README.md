<div align="center">
  <img src="assets/logo.png" alt="DevLink Logo" width="250" />
</div>

# 🚀 DevLink Backend

<div align="center">
  <img src="https://img.shields.io/badge/NestJS-E0234E?style=for-the-badge&logo=nestjs&logoColor=white" alt="NestJS" />
  <img src="https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/MongoDB-4EA94B?style=for-the-badge&logo=mongodb&logoColor=white" alt="MongoDB" />
  <img src="https://img.shields.io/badge/Redis-DC382D?style=for-the-badge&logo=redis&logoColor=white" alt="Redis" />
  <img src="https://img.shields.io/badge/Google_Gemini-8E75C2?style=for-the-badge&logo=googlegemini&logoColor=white" alt="Gemini" />
  <img src="https://img.shields.io/badge/Swagger-85EA2D?style=for-the-badge&logo=swagger&logoColor=black" alt="Swagger" />
  <img src="https://img.shields.io/badge/Socket.IO-010101?style=for-the-badge&logo=socketdotio&logoColor=white" alt="Socket.IO" />
  <img src="https://img.shields.io/badge/Sentry-362D59?style=for-the-badge&logo=sentry&logoColor=white" alt="Sentry" />
  <img src="https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white" alt="Docker" />
  <a href="https://quocduy21-10.github.io/it-job-portal-be/"><img src="https://img.shields.io/badge/Docs-Docusaurus-3ECC5F?style=for-the-badge&logo=docusaurus&logoColor=white" alt="Documentation" /></a>
</div>

<br />

Backend NestJS duy nhất cho DevLink (cổng việc làm IT tại Việt Nam), bao gồm xác thực, quản lý công ty và tin tuyển dụng, hồ sơ ứng tuyển, CV trực tuyến, phân tích và đối sánh CV có hỗ trợ AI, chat tư vấn nghề nghiệp, thông báo, tải tệp lên và thống kê.

---

## 📚 Tài liệu

👉 **Trang tài liệu chi tiết: [quocduy21-10.github.io/it-job-portal-be](https://quocduy21-10.github.io/it-job-portal-be/)**

Trang này mô tả kiến trúc, từ điển dữ liệu của toàn bộ 17 collection MongoDB, 116 route API, các luồng nghiệp vụ, tích hợp, bảo mật và vận hành. Trang được xây dựng bằng Docusaurus (mã nguồn trong [`docs-site/`](docs-site)) và được triển khai lên GitHub Pages bởi `.github/workflows/docs.yml`.

Nguồn Markdown cũng nằm trong [`docs/`](docs/README.md); hãy bắt đầu từ [mục lục](docs/SUMMARY.md). Khi README này và tài liệu không khớp với mã nguồn, mã nguồn là chuẩn xác.

---

## 🖥️ Repository Frontend

Ứng dụng frontend đi kèm của **DevLink** nằm trong repository frontend:
👉 **<a href="https://github.com/QuocDuy21-10/it-job-portal-fe" target="_blank" rel="noopener noreferrer" style="color: blue; text-decoration: underline;">Repository Frontend DevLink</a>**

---

## 🎯 Dự án giải quyết vấn đề gì

**DevLink** tập trung toàn bộ các luồng backend cần thiết cho một sàn việc làm hiện đại:

- **Ứng viên:** Đăng ký, quản lý hồ sơ, tải lên/tạo CV, ứng tuyển, lưu việc làm, theo dõi công ty và nhận gợi ý việc làm.
- **Nhà tuyển dụng & Quản trị viên:** Quản lý công ty, đăng và duyệt tin tuyển dụng, xem xét hồ sơ ứng tuyển và theo dõi thống kê nền tảng.
- **Tích hợp AI:** Phân tích tệp CV, chuyển thành dữ liệu có cấu trúc, tính điểm phù hợp công việc theo cách xác định (deterministic) và hỗ trợ chat tư vấn nghề nghiệp bằng AI, đồng thời giữ các quy tắc nghiệp vụ trong các service backend.

---

## ✨ Tính năng

- **🔐 Xác thực và phiên đăng nhập:**
  - Đăng ký bằng email, đăng nhập, JWT access & refresh token.
  - Đăng nhập Google OAuth, đặt lại mật khẩu.
  - Phiên đa thiết bị, đăng xuất tất cả, xóa tài khoản và hủy yêu cầu xóa.
- **👤 Người dùng, vai trò và phân quyền:**
  - CRUD người dùng, truy cập theo vai trò.
  - Phân quyền theo vai trò (`@Roles`), khóa/mở khóa tài khoản.
  - Việc làm đã lưu và công ty đang theo dõi.
- **🏢 Công ty và việc làm:**
  - Hồ sơ công ty, tự động dọn dẹp logo.
  - CRUD việc làm, quy trình duyệt tin, giới thiệu các công ty tuyển dụng nhiều nhất.
  - Hỗ trợ tìm kiếm theo từ khóa, mẫu xóa mềm (soft-delete) để đảm bảo an toàn dữ liệu.
- **🌐 Việc làm bên ngoài và tìm kiếm hợp nhất:**
  - Đồng bộ định kỳ (mỗi 6 giờ) từ Greenhouse, Lever, TopDev và ITviec với vòng đời ACTIVE/STALE/CLOSED và chính sách hiển thị theo từng nguồn.
  - Một API tìm kiếm chung cho việc làm nội bộ và bên ngoài (`GET /api/v1/job-search`).
- **📄 Hồ sơ ứng tuyển và hồ sơ CV:**
  - Ứng tuyển bằng hồ sơ, kho lưu tệp CV đã tải lên.
  - Hồ sơ CV trực tuyến có cấu trúc.
  - Phân tích hồ sơ ứng tuyển, luồng phân tích lại (reparse/reanalyze) và theo dõi trạng thái hàng đợi.
- **🤖 AI và đối sánh:**
  - Trích xuất văn bản (PDF, DOC, DOCX, TXT).
  - Google Gemini phân tích CV thành dữ liệu JSON có cấu trúc.
  - Tính điểm phù hợp công việc theo cách xác định (deterministic).
  - Chatbot tư vấn nghề nghiệp Groq/Gemini với nhận diện ý định, rào chắn chủ đề đầu vào/đầu ra, định dạng phản hồi và cache FAQ.
  - Hành động công cụ trong chat, chính sách hạn mức AI theo người dùng, nhật ký sử dụng AI và cơ chế dự phòng an toàn.
- **🔔 Thông báo và người đăng ký:**
  - Thông báo thời gian thực trong ứng dụng qua Socket.IO (WebSocket gateway) kèm số lượng chưa đọc.
  - Đăng ký nhận email, đăng ký theo kỹ năng.
  - Thông báo cho người theo dõi và email gợi ý việc làm.
- **⚙️ Hạ tầng và vận hành:**
  - Cache Redis và hàng đợi tác vụ nền BullMQ.
  - Mẫu email SMTP (dùng Handlebars).
  - Tài liệu tương tác Swagger/OpenAPI và [trang tài liệu Docusaurus](https://quocduy21-10.github.io/it-job-portal-be/).
  - Ghi log JSON có cấu trúc (Pino) và theo dõi lỗi (Sentry).
  - Giới hạn tốc độ dựa trên Redis (Throttler), Helmet, CORS, validation pipe và response envelope.
  - Kiểm tra sức khỏe (Terminus) và dashboard thống kê.
  - CI/CD: GitHub Actions (lint, kiểm tra kiểu, test, build, `npm audit`, build Docker) và triển khai tài liệu lên GitHub Pages.

---

## 🛠️ Công nghệ sử dụng

| Thành phần | Công nghệ |
| :--- | :--- |
| **Runtime & Ngôn ngữ** | <a href="https://nodejs.org" target="_blank" rel="noopener noreferrer" style="color: blue; text-decoration: underline;">Node.js</a> 24, <a href="https://www.npmjs.com" target="_blank" rel="noopener noreferrer" style="color: blue; text-decoration: underline;">npm</a>, <a href="https://www.typescriptlang.org" target="_blank" rel="noopener noreferrer" style="color: blue; text-decoration: underline;">TypeScript</a> 5 |
| **Framework Backend** | <a href="https://nestjs.com" target="_blank" rel="noopener noreferrer" style="color: blue; text-decoration: underline;">NestJS</a> 10 (<a href="https://fastify.dev" target="_blank" rel="noopener noreferrer" style="color: blue; text-decoration: underline;">Fastify</a> or <a href="https://expressjs.com" target="_blank" rel="noopener noreferrer" style="color: blue; text-decoration: underline;">Express</a> tương thích, ở đây dùng <a href="https://expressjs.com" target="_blank" rel="noopener noreferrer" style="color: blue; text-decoration: underline;">Express</a> here) |
| **Cơ sở dữ liệu** | <a href="https://www.mongodb.com" target="_blank" rel="noopener noreferrer" style="color: blue; text-decoration: underline;">MongoDB</a> 7, <a href="https://mongoosejs.com" target="_blank" rel="noopener noreferrer" style="color: blue; text-decoration: underline;">Mongoose</a> (<a href="https://www.npmjs.com/package/soft-delete-plugin-mongoose" target="_blank" rel="noopener noreferrer" style="color: blue; text-decoration: underline;">soft-delete-plugin-mongoose</a>) |
| **Cache & Hàng đợi** | <a href="https://redis.io" target="_blank" rel="noopener noreferrer" style="color: blue; text-decoration: underline;">Redis</a> 7, <a href="https://bullmq.io" target="_blank" rel="noopener noreferrer" style="color: blue; text-decoration: underline;">BullMQ</a>, <a href="https://github.com/redis/ioredis" target="_blank" rel="noopener noreferrer" style="color: blue; text-decoration: underline;">ioredis</a> |
| **Thời gian thực** | <a href="https://socket.io" target="_blank" rel="noopener noreferrer" style="color: blue; text-decoration: underline;">Socket.IO</a> via <a href="https://docs.nestjs.com/websockets/gateways" target="_blank" rel="noopener noreferrer" style="color: blue; text-decoration: underline;">@nestjs/websockets</a> |
| **Bảo mật & Xác thực** | <a href="https://www.passportjs.org" target="_blank" rel="noopener noreferrer" style="color: blue; text-decoration: underline;">Passport</a>, <a href="https://jwt.io" target="_blank" rel="noopener noreferrer" style="color: blue; text-decoration: underline;">JWT</a>, <a href="https://developers.google.com/identity/protocols/oauth2" target="_blank" rel="noopener noreferrer" style="color: blue; text-decoration: underline;">Google OAuth</a>, <a href="https://casl.js.org" target="_blank" rel="noopener noreferrer" style="color: blue; text-decoration: underline;">CASL</a>, <a href="https://www.npmjs.com/package/bcryptjs" target="_blank" rel="noopener noreferrer" style="color: blue; text-decoration: underline;">bcryptjs</a>, <a href="https://helmetjs.github.io" target="_blank" rel="noopener noreferrer" style="color: blue; text-decoration: underline;">Helmet</a>, <a href="https://docs.nestjs.com/security/rate-limiting" target="_blank" rel="noopener noreferrer" style="color: blue; text-decoration: underline;">Throttler</a> (lưu trữ bằng Redis) |
| **Giám sát** | <a href="https://getpino.io" target="_blank" rel="noopener noreferrer" style="color: blue; text-decoration: underline;">Pino</a> (<a href="https://github.com/iamolegga/nestjs-pino" target="_blank" rel="noopener noreferrer" style="color: blue; text-decoration: underline;">nestjs-pino</a>), <a href="https://sentry.io" target="_blank" rel="noopener noreferrer" style="color: blue; text-decoration: underline;">Sentry</a>, <a href="https://docs.nestjs.com/recipes/terminus" target="_blank" rel="noopener noreferrer" style="color: blue; text-decoration: underline;">Terminus</a> kiểm tra sức khỏe |
| **Xử lý AI** | <a href="https://ai.google.dev" target="_blank" rel="noopener noreferrer" style="color: blue; text-decoration: underline;">Google Gemini</a> (Gemini 3.1 Flash Lite), <a href="https://groq.com" target="_blank" rel="noopener noreferrer" style="color: blue; text-decoration: underline;">Groq</a> |
| **API & Tài liệu** | <a href="https://swagger.io" target="_blank" rel="noopener noreferrer" style="color: blue; text-decoration: underline;">Swagger</a>/<a href="https://www.openapis.org" target="_blank" rel="noopener noreferrer" style="color: blue; text-decoration: underline;">OpenAPI</a> via <a href="https://docs.nestjs.com/openapi/introduction" target="_blank" rel="noopener noreferrer" style="color: blue; text-decoration: underline;">@nestjs/swagger</a> |
| **Tệp & Email** | <a href="https://github.com/expressjs/multer" target="_blank" rel="noopener noreferrer" style="color: blue; text-decoration: underline;">Multer</a>, <a href="https://www.npmjs.com/package/pdf-parse" target="_blank" rel="noopener noreferrer" style="color: blue; text-decoration: underline;">pdf-parse</a>, <a href="https://www.npmjs.com/package/mammoth" target="_blank" rel="noopener noreferrer" style="color: blue; text-decoration: underline;">mammoth</a>, <a href="https://nodemailer.com" target="_blank" rel="noopener noreferrer" style="color: blue; text-decoration: underline;">Nodemailer</a>, <a href="https://handlebarsjs.com" target="_blank" rel="noopener noreferrer" style="color: blue; text-decoration: underline;">Handlebars</a> |
| **Tài liệu** | <a href="https://docusaurus.io" target="_blank" rel="noopener noreferrer" style="color: blue; text-decoration: underline;">Docusaurus</a> on <a href="https://pages.github.com" target="_blank" rel="noopener noreferrer" style="color: blue; text-decoration: underline;">GitHub Pages</a> |
| **Kiểm thử & Công cụ** | <a href="https://github.com/features/actions" target="_blank" rel="noopener noreferrer" style="color: blue; text-decoration: underline;">GitHub Actions</a>, <a href="https://typicode.github.io/husky" target="_blank" rel="noopener noreferrer" style="color: blue; text-decoration: underline;">Husky</a>, <a href="https://commitlint.js.org" target="_blank" rel="noopener noreferrer" style="color: blue; text-decoration: underline;">commitlint</a>, <a href="https://github.com/lint-staged/lint-staged" target="_blank" rel="noopener noreferrer" style="color: blue; text-decoration: underline;">lint-staged</a>, <a href="https://www.docker.com" target="_blank" rel="noopener noreferrer" style="color: blue; text-decoration: underline;">Docker</a>, <a href="https://jestjs.io" target="_blank" rel="noopener noreferrer" style="color: blue; text-decoration: underline;">Jest</a>, <a href="https://eslint.org" target="_blank" rel="noopener noreferrer" style="color: blue; text-decoration: underline;">ESLint</a>, <a href="https://prettier.io" target="_blank" rel="noopener noreferrer" style="color: blue; text-decoration: underline;">Prettier</a> |

---

## 🚀 Bắt đầu nhanh

### 📋 Yêu cầu

- **Node.js** 24 (xem `.nvmrc`; `engines` yêu cầu `>=24`)
- **npm**
- **Docker & Docker Compose** (khuyến nghị để chạy MongoDB và Redis cục bộ)

---

### 📦 Cài đặt

```bash
npm install
```

---

### ⚙️ Cấu hình môi trường

Sao chép `.env.example` thành `.env` (`cp .env.example .env`) và điền các giá trị bí mật. `.env` bị Git bỏ qua. Các khóa bắt buộc được kiểm tra khi khởi động, nên thiếu khóa nào ứng dụng sẽ dừng kèm thông báo lỗi rõ ràng. Về triển khai VPS, xem [DEPLOYMENT.md](DEPLOYMENT.md).

<details>
<summary><b>🔑 Xem các biến môi trường tối thiểu cho môi trường local</b></summary>

Các biến bắt buộc để chạy môi trường phát triển local:

| Biến | Mục đích | Giá trị ví dụ |
| :--- | :--- | :--- |
| `PORT` | Cổng HTTP mà NestJS sử dụng | `8081` |
| `NODE_ENV` | Môi trường chạy | `development` |
| `MONGO_URL` | URI kết nối MongoDB | `mongodb://root:123456@localhost:27017/my-job-portal?authSource=admin` |
| `MONGO_INITDB_ROOT_USERNAME` | Tài khoản root MongoDB trong Docker | `root` |
| `MONGO_INITDB_ROOT_PASSWORD` | Mật khẩu root MongoDB trong Docker | `123456` |
| `MONGO_INITDB_DATABASE` | Tên cơ sở dữ liệu MongoDB trong Docker | `my-job-portal` |
| `FE_URL` | URL frontend dùng trong luồng xác thực/email | `http://localhost:3000` |
| `CORS_ORIGINS` | Các origin (phân tách bằng dấu phẩy) được phép gọi API kèm cookie (mặc định là `FE_URL`) | `http://localhost:3000` |
| `TRUST_PROXY` | Đặt thành `1` khi chạy sau nginx/Caddy để giới hạn tốc độ nhận đúng IP thật của client | *để trống ở local* |
| `SWAGGER_ENABLED` | Mở Swagger khi `NODE_ENV=production` | `false` |
| `JWT_ACCESS_TOKEN_SECRET` | Khóa bí mật ký access token | `replace-with-local-secret` |
| `JWT_ACCESS_EXPIRES_IN` | Thời hạn access token | `15m` |
| `JWT_REFRESH_TOKEN_SECRET` | Khóa bí mật ký refresh token | `replace-with-local-secret` |
| `JWT_REFRESH_EXPIRES_IN` | Thời hạn refresh token | `7d` |
| `EMAIL_ADMIN` | Email seed/admin | `admin@example.com` |
| `INIT_PASSWORD` | Mật khẩu seed/admin | `change-me` |
| `SMTP_HOST` | SMTP host để gửi email | `smtp.gmail.com` |
| `SMTP_EMAIL` | Tài khoản gửi SMTP | `your-email@example.com` |
| `SMTP_PASSWORD` | Mật khẩu SMTP hoặc app password | `replace-with-local-secret` |
| `GOOGLE_CLIENT_ID` | Client ID của Google OAuth | `replace-with-google-client-id` |
| `GOOGLE_CLIENT_SECRET` | Client secret của Google OAuth | `replace-with-google-client-secret` |
| `GEMINI_API_KEY` | API key của Gemini | `replace-with-gemini-key` |
| `GROQ_API_KEY` | API key của Groq | `replace-with-groq-key` |
| `REDIS_HOST` | Host Redis | `localhost` |
| `REDIS_PORT` | Cổng Redis | `6379` |
| `REDIS_PASSWORD` | Mật khẩu Redis (nếu có dùng) | *Để trống với Docker local* |
| `REDIS_QUEUE_DB` | Chỉ số DB Redis cho BullMQ | `0` |
| `REDIS_CACHE_DB` | Chỉ số DB Redis cho cache | `1` |
| `REDIS_TTL` | TTL của cache (mili giây) | `3600000` |
| `OTP_SECRET` | Khóa bí mật ký/mã hóa OTP | `replace-with-local-secret` |

</details>

<details>
<summary><b>🤖 Xem các biến tinh chỉnh AI Chat</b></summary>

| Biến | Mục đích |
| :--- | :--- |
| `AI_GROQ_HISTORY_LIMIT` | Số tin nhắn chat trước đó đưa vào ngữ cảnh |
| `AI_GROQ_MAX_INPUT_TOKENS` | Ngân sách token đầu vào cho các request Groq |
| `AI_GROQ_MAX_MATCHING_JOBS` | Số việc làm phù hợp tối đa đưa vào ngữ cảnh chat |
| `AI_GROQ_MAX_SEARCH_RESULTS` | Số kết quả tìm kiếm tối đa mà công cụ chat sử dụng |
| `AI_GROQ_MAX_COMPANY_ITEMS` | Số công ty tối đa đưa vào ngữ cảnh chat |
| `AI_GROQ_MAX_TOP_SKILLS` | Số kỹ năng hàng đầu tối đa trong phân tích của chat |
| `AI_GROQ_MAX_TOP_COMPANIES` | Số công ty hàng đầu tối đa trong phân tích của chat |
| `AI_GROQ_MAX_SUMMARY_CHARS` | Độ dài tối đa của bản tóm tắt được tạo |

</details>

---

### 🐳 Dịch vụ hạ tầng

Khởi động các container MongoDB và Redis bằng Docker Compose:

```bash
npm run docker:dev
```

Lệnh này khởi chạy cơ sở dữ liệu và bộ cache đã được cấu hình sẵn cho môi trường phát triển.

---

### 🚀 Chạy ứng dụng

Khởi động backend NestJS ở chế độ phát triển:

```bash
npm run dev
```

Sau khi chạy, các endpoint sau khả dụng:

*   **Tài liệu API Swagger:** `http://localhost:8081/api`
*   **Điểm vào API có phiên bản:** `http://localhost:8081/api/v1`
*   **Kiểm tra sức khỏe hệ thống:** `http://localhost:8081/api/v1/health`

#### 🐋 Chạy toàn bộ stack trong Docker

Để chạy MongoDB, Redis và backend NestJS hoàn toàn trong các container Docker, chạy:

```bash
npm run docker:full
```

---

## 🛠️ Tham khảo CLI & Script

Bảng tra nhanh các lệnh thường dùng trong workspace:

| Lệnh | Tác dụng |
| :--- | :--- |
| `npm run dev` | Chạy NestJS ở chế độ watch |
| `npm run start` | Chạy NestJS một lần |
| `npm run start:prod` | Chạy ứng dụng đã build từ `dist/` |
| `npm run build` | Biên dịch dự án NestJS |
| `npm run lint` | Chạy ESLint kèm tự động sửa |
| `npm run format` | Định dạng tệp bằng Prettier |
| `npm test` | Chạy unit test Jest |
| `npm run test:e2e` | Chạy test end-to-end |
| `npm run test:cov` | Chạy test kèm độ phủ mã |
| `npm run docker:dev` | Khởi chạy container MongoDB và Redis local |
| `npm run docker:full` | Khởi chạy MongoDB, Redis và backend trong container |
| `npm run docker:down` | Dừng và gỡ toàn bộ container Docker |
| `npm run docker:logs` | Theo dõi log của container Docker |
| `npm run dev:services` / `npm run dev:stop` | Khởi động / dừng các dịch vụ dev local qua `scripts/` |
| `npm run migrate:locations` | Migration chạy một lần để chuẩn hóa địa điểm của việc làm/công ty |
| `npm run seed` | Seed dữ liệu mẫu: kỹ năng, nguồn việc làm, công ty, một tài khoản admin, 20 tài khoản HR và 75 tài khoản ứng viên (cùng dùng `INIT_PASSWORD`), việc làm, CV và hồ sơ ứng tuyển. **Không chạy nguyên trạng trên production** |

---

## 📂 Cấu trúc dự án

```text
.
├── src/
│   ├── main.ts                   # Điểm khởi chạy ứng dụng (Swagger, logger, shutdown hook)
│   ├── app.setup.ts              # Pipeline HTTP toàn cục (helmet, guard, pipe, CORS, versioning)
│   ├── app.module.ts             # Kết nối toàn cục (cơ sở dữ liệu, hàng đợi, throttling)
│   │
│   ├── auth/                     # Xác thực (JWT, đăng nhập, Google OAuth)
│   ├── users/                    # Tài khoản người dùng, thao tác CRUD
│   ├── roles/                    # Schema và DTO của vai trò
│   ├── sessions/                 # Theo dõi phiên người dùng (đăng xuất tất cả, khóa)
│   ├── casl/                     # ERole enum, RolesGuard, @Roles (các ability CASL đã được định nghĩa nhưng chưa được áp dụng)
│   ├── profile-identity/         # Giữ đồng bộ các trường danh tính của người dùng và hồ sơ CV
│   │
│   ├── companies/                # Quản lý hồ sơ công ty
│   ├── jobs/                     # Tin tuyển dụng, duyệt tin và lọc
│   ├── job-ingestion/           # Nguồn việc làm bên ngoài, đồng bộ và vòng đời
│   ├── job-search/               # Tìm kiếm hợp nhất việc làm nội bộ và bên ngoài
│   ├── resumes/                  # Hồ sơ ứng tuyển và tệp CV
│   ├── cv-profiles/              # Hồ sơ ứng viên trực tuyến
│   │
│   ├── cv-parser/                # Trích xuất văn bản và pipeline phân tích bằng AI
│   ├── matching/                 # Thuật toán đối sánh hồ sơ - việc làm cốt lõi
│   ├── gemini/                   # Kết nối Google Gemini API
│   ├── groq/                     # Kết nối Groq API
│   ├── chat/                     # Engine chatbot tư vấn nghề nghiệp AI
│   ├── queues/                   # Hàng đợi BullMQ cho xử lý nền
│   │
│   ├── files/                    # Lưu trữ cục bộ & quản lý tải tệp lên
│   ├── mail/                     # Tích hợp SMTP và mẫu email Handlebars
│   ├── notifications/            # Thông báo trong ứng dụng (REST + Socket.IO gateway)
│   ├── subscribers/              # Đăng ký theo kỹ năng của người dùng
│   ├── statistics/               # Phân tích & báo cáo dashboard
│   │
│   ├── databases/                # Dữ liệu seed (plugin soft-delete được thiết lập trong app.module.ts)
│   ├── config/                   # Kiểm tra biến môi trường khi khởi động
│   ├── redis/                    # Thiết lập Redis adapter
│   ├── health/                   # Các endpoint kiểm tra sức khỏe Terminus
│   ├── ai/                       # Tiện ích và prompt AI dùng chung
│   ├── skills/                   # Danh mục kỹ năng được kiểm soát
│   ├── scripts/                  # Script tùy biến (benchmark hiệu năng)
│   ├── instrument.ts             # Khởi tạo Sentry
│   └── utils/                    # Tiện ích dùng chung
│
├── docs/                         # Tài liệu Markdown (00-getting-started ... 14-reference)
├── docs-site/                    # Trang Docusaurus được xuất bản lên GitHub Pages
├── agent_docs/                   # Hướng dẫn theo tác vụ cho AI coding agent
├── test/                         # Cấu hình test E2E
├── .github/workflows/            # ci.yml (kiểm tra) và docs.yml (triển khai tài liệu)
├── Dockerfile                    # Build container production đa tầng (multi-stage)
├── docker-compose.yml            # Điều phối docker cho MongoDB, Redis và backend
└── package.json                  # Manifest chính của workspace
```

---

## 🔌 Quy ước & cách dùng API

- **Response Envelope:** Mọi phản hồi đều theo định dạng thống nhất:
  ```json
  {
    "statusCode": 200,
    "message": "Action completed successfully",
    "data": { ... }
  }
  ```
- **Xác thực & Phân quyền:** Mặc định, các endpoint yêu cầu JWT access token. Bảo vệ hoặc mở công khai bằng:
  - `@Public()` - Cho phép truy cập endpoint mà không cần token.
  - `@OptionalAuth()` - Lấy phiên người dùng nếu có, nhưng không chặn truy cập.
  - `@Roles(...)` - Giới hạn route cho các vai trò cụ thể (`SUPER ADMIN`, `HR`, `NORMAL USER`). `@CheckPolicies(...)` và `PoliciesGuard` có tồn tại nhưng chưa được route nào sử dụng, nên các ability CASL chưa được áp dụng.
- **Endpoint có phiên bản:** Mọi route API đều có phiên bản và tiền tố. Ví dụ: `/api/v1/auth/login`, `/api/v1/jobs`, `/api/v1/resumes`, and `/api/v1/chat/message`.
- **Kiểm tra dữ liệu:** Pipeline validation toàn cục kiểm tra payload bằng class-validator và tự động loại bỏ các thuộc tính không nằm trong whitelist.
- **Tệp tải lên:** Các tệp được tải lên (như CV hoặc logo công ty) được đặt trong `public/images/` và phục vụ dưới dạng tĩnh.
- **Tài liệu tương tác (Swagger):** Khởi động server và truy cập `http://localhost:8081/api` để thao tác với các endpoint API. Bạn có thể xác thực bằng Bearer JWT token ngay trên giao diện Swagger.

---

## 🔒 Giấy phép

Dự án hiện được đánh dấu là `UNLICENSED` và là dự án riêng tư.
