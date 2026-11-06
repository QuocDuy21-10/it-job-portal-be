# Xử lý sự cố

Bảng triệu chứng, nguyên nhân khả dĩ và cách kiểm tra. Mọi thông báo lỗi trích từ source. Các bước chưa chạy thử trên hệ thống thật được ghi rõ.

## Khởi động

| Triệu chứng | Nguyên nhân | Cách xử lý |
|---|---|---|
| `Missing required environment variables: ...` | Thiếu biến bắt buộc ([env.validation.ts](../../src/config/env.validation.ts)) | Bổ sung `MONGO_URL`, `JWT_*`, `OTP_SECRET`; ở production thêm `FE_URL`, `CORS_ORIGINS` |
| Dịch vụ AI không khởi động / `GeminiService` báo thiếu khóa | Thiếu `GEMINI_API_KEY` | Đặt khóa; xem [ai-providers](../07-integrations/ai-providers.md) |
| Lỗi `AI_GROQ_*` khi khởi động | `AIService` kiểm tra nhóm biến ngân sách Groq | Đặt các biến theo `.env.example` |
| Không kết nối MongoDB | Sai `MONGO_URL`; container chưa khỏe; mật khẩu có ký tự `@ / :` | `docker compose ps`; dùng mật khẩu hex ([deployment](../09-infrastructure/deployment.md)) |
| Không kết nối Redis | Sai `REDIS_HOST`, `REDIS_PASSWORD` | Kiểm tra Redis; compose prod bắt buộc `REDIS_PASSWORD` |
| `npm run dev:services` / `dev:stop` / `migrate:locations` lỗi | Script trỏ tới file không tồn tại | Dùng `npm run docker:dev` / `docker:down`; xem [local-development](../00-getting-started/local-development.md#known-limitation-script-dev-bị-thiếu) |
| Container `unhealthy` | `GET /api/v1/health` thất bại: Mongo hoặc Redis lỗi | `docker compose logs backend`; thử `curl` health trong container |

## Đăng nhập và phiên

| Triệu chứng | Nguyên nhân | Cách xử lý |
|---|---|---|
| `401` "Token không hợp lệ hoặc đã hết hạn" | Access token hết hạn hoặc sai | Gọi `GET /auth/refresh` |
| Làm mới token trả `400` "Session not found or already used" | Refresh token đã dùng, đã đăng xuất, hoặc bị đẩy khỏi giới hạn 5 phiên; hai tab làm mới cùng lúc | Đăng nhập lại; điều phối làm mới ở client |
| Cookie `refresh_token` không được gửi | Production dùng `Secure` + `SameSite=Strict`; frontend và API khác site hoặc dùng HTTP | Chạy cùng site qua HTTPS |
| `401` "Tài khoản đã bị khóa" / "bị vô hiệu hóa" | `isLocked` hoặc `isActive = false` | Quản trị viên mở khóa; tài khoản chưa xác thực quá 15 phút đã bị xóa tự động |
| `403` "Tài khoản đang chờ bị xóa" | Đã yêu cầu xóa tài khoản | Hủy bằng link trong email (token có thể đã mất sau khi backend khởi động lại, xem Known Limitation của [auth-and-sessions](../03-modules/auth-and-sessions.md#known-limitation)) |
| Link đặt lại mật khẩu báo hết hạn dù mới gửi | Backend vừa khởi động lại; token nằm trong bộ nhớ | Yêu cầu link mới |
| OTP "không chính xác" / `403` | Sai mã; từ 5 lần sai bị chặn | Chờ hết hạn (5 phút) rồi gửi lại; gửi lại có chờ 60 giây |
| `429 Too Many Requests` | Vượt `@Throttle` hoặc throttler toàn cục | Chờ; kiểm tra `TRUST_PROXY` nếu mọi người dùng chung bị chặn |
| Mọi người dùng bị `429` cùng lúc | `TRUST_PROXY` chưa đặt nên mọi request mang IP của proxy | Đặt `TRUST_PROXY=1` ([deployment](../09-infrastructure/deployment.md)) |

## Hồ sơ và CV

| Triệu chứng | Nguyên nhân | Cách xử lý |
|---|---|---|
| Hồ sơ kẹt `processing` / `isParsed = false` | Hàng đợi chưa chạy; hết quota Gemini; văn bản CV không hợp lệ | Xem `parseError`, `analysisError` của bản ghi; `GET /resumes/queue/stats`; log "Rescheduled parse" |
| `parseError` "Invalid CV text: Text too short" | CV scan ảnh hoặc rỗng; dưới 100 ký tự, dưới 50 từ | Yêu cầu file có chữ; giới hạn 100 đến 50.000 ký tự |
| `analysisError` "Resume must be parsed before analysis" | Việc phân tích chạy trước khi đọc xong | Sẽ tự hết khi việc `analyze` do bước đọc sinh ra chạy; hoặc `POST /resumes/:id/reanalyze` |
| `analysisError` "Job is no longer active" | Tin đã hết hoạt động | Không phân tích được cho tới khi tin hoạt động trở lại |
| Điểm thấp hoặc cao bất thường | Khớp kỹ năng bằng chuỗi con; mức thành thạo mặc định 70 | [cv-parsing-and-matching](../03-modules/cv-parsing-and-matching.md#known-limitation) |
| Nộp CV trực tuyến báo "Your CV profile is inactive" | CV bị tắt | `POST /cv-profiles/me/activate` |
| Upload `400` "Invalid folder_type" | Thiếu hoặc sai header `folder_type` | Dùng `avatar`, `cv`, `resumes`, `company` |

## Tin từ nguồn ngoài

| Triệu chứng | Nguyên nhân | Cách xử lý |
|---|---|---|
| Nguồn không đồng bộ | `enabled = false`; việc `sync-<key>` còn trong hàng đợi; lỗi liên tiếp | `GET /job-sources`, `GET /job-sources/:key/runs` |
| Lần chạy `SUSPECT` | Danh sách nguồn co dưới 50% mức nền hoặc rỗng | Kiểm tra nguồn; không tin nào bị đóng vì vắng mặt |
| Lần chạy `PARTIAL` | Bị chặn 403, 429, captcha khi tải chi tiết | Chờ lần sau; không tăng tốc độ (đã giới hạn 1 request mỗi giây) |
| Tin ngoài mất khỏi tìm kiếm | Nguồn bị `HIDDEN`; tin `CLOSED`; hết `expiresAt` | Xem trạng thái [external-jobs](../04-database/collections/external-jobs.md) |
| Mô tả tin ngoài trống | Nguồn `LINK_ONLY` | Đổi `displayPolicy` sang `FULL` rồi chờ đồng bộ (đổi sang `LINK_ONLY` xóa mô tả đã lưu) |
| `POST /job-sources/:key/sync` trả `queued` nhưng không có gì xảy ra | Việc cùng `jobId` đã tồn tại (đang chờ hoặc chạy) | Chờ việc hiện tại; BullMQ bỏ qua việc trùng `jobId` |

## Chat AI

| Triệu chứng | Nguyên nhân | Cách xử lý |
|---|---|---|
| Sự kiện `error` kèm `quota.nextResetTime` | Hết hạn mức ngày (30/100) | Chờ đến thời điểm đặt lại, hoặc đổi `dailyLimit` trong `chat_quota_policies` |
| `400` "Your message appears to contain instructions..." | Guardrail chặn mẫu rủi ro cao | Diễn đạt lại; kể cả câu hỏi nghề nghiệp có "write Python" có thể bị chặn nhầm |
| Câu trả lời là thông báo từ chối song ngữ | Bộ lọc chủ đề cho là lạc đề | Hỏi lại trong phạm vi nghề nghiệp IT |
| Chat chậm hoặc lỗi | Groq lỗi: tự chuyển sang Gemini nếu bật dự phòng và còn quota | Xem `fallbackUsed` trong `ai_usage_logs` |
| Quota chat về 0 sau khi Redis mất dữ liệu | Bộ đếm nằm trong Redis | Chờ sang ngày; bộ đếm tự đặt lại |

## Dữ liệu

| Triệu chứng | Nguyên nhân | Cách xử lý |
|---|---|---|
| Danh sách tin/công ty cũ tối đa 60 giây / 3 phút | Cache danh sách | Chờ hết TTL; cache tự xóa khi dữ liệu đổi qua API |
| Dashboard lệch giữa các lần tải | Cache trong bộ nhớ, TTL 3 đến 15 phút | Chờ hoặc khởi động lại |
| Truy vấn bằng chuỗi không ra kết quả với `cvprofiles`/`chat_*` | `userId` là `Mixed`; truy vấn phải dùng `ObjectId` | [database-overview](../04-database/database-overview.md#kiểu-objectid-thực-tế) |
| Bản ghi đã xóa vẫn xuất hiện ở truy vấn mới | Plugin xóa mềm không lọc `findOne`, `aggregate`, `update*` | Thêm `isDeleted` tường minh |
| Chỉ mục mong đợi (TTL, unique) không tồn tại | Khai báo index trùng key pattern | `db.<collection>.getIndexes()` ([database-overview](../04-database/database-overview.md#known-limitation-khai-báo-index-trùng-key-pattern)) |

## Thu thập thông tin khi báo lỗi

1. `X-Request-Id` trong header phản hồi.
2. Dòng log theo `req.id`.
3. Sự kiện Sentry có tag `request_id` (nếu bật).
4. Với hồ sơ: `parseError`, `analysisError`, `isParsed`, `isAnalyzed`.
5. Với nguồn tin: bản ghi `crawl_runs` gần nhất.

Không dán token, OTP, nội dung CV hay `.env` vào ticket.
