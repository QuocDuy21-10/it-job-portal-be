# Sử dụng NestJS Agent Skills

Agent skill là một thư mục chứa `SKILL.md` (quy tắc) và `references/` (ví dụ code) mà coding agent (Claude Code, Codex, Cursor) tự đọc khi công việc khớp với mô tả của skill. Bộ [nestjs/agent-skills](https://github.com/nestjs/agent-skills) do đội ngũ NestJS phát hành qua gói npm `@nestjs/skills`. Tài liệu này dùng phiên bản `0.1.4`.

Mục đích chính của bộ skill: cung cấp cho agent API hiện hành của NestJS và các lỗi vẫn qua được test.

> `Known Limitation`: bộ skill viết cho **NestJS 12**, còn dự án chạy **NestJS 10** với Mongoose. Đọc mục [Phạm vi áp dụng](#phạm-vi-áp-dụng-cho-dự-án-này) trước khi để agent viết code theo skill.

## Cài đặt

Skill nằm ở máy từng người và được git bỏ qua (`.claude/skills/`, `.agents/`), nên mỗi người tự cài một lần. Chạy tại thư mục gốc của repository:

```bash
npx @nestjs/skills@0.1.4 add --agent all
```

| Thư mục được tạo | Agent đọc |
|---|---|
| `.claude/skills/` | Claude Code, Cursor |
| `.agents/skills/` | Codex, Cursor và các công cụ theo chuẩn Agent Skills |

Chỉ dùng một công cụ thì thay `all` bằng `claude` hoặc `agents`. Lệnh chỉ chép file, không sửa `package.json`.

Kiểm tra sau khi cài: mở một phiên agent mới và hỏi:

```text
Liệt kê các skill có tên bắt đầu bằng "nestjs" mà bạn đang thấy.
```

Câu trả lời cần có đủ sáu skill trong bảng bên dưới.

Sau khi cài, thêm quy tắc sau vào file hướng dẫn agent ở máy bạn (`AGENTS.md`, cũng không nằm trong git):

```markdown
## NestJS Agent Skills

- Quy ước của repository và phiên bản đã cài được ưu tiên hơn skill.
- Kiểm tra API tồn tại trong phiên bản đã cài trước khi dùng.
- Không nâng cấp NestJS, đổi sang ESM hoặc Vitest, thay JWT/Passport/CASL, thêm package mà skill gợi ý, trừ khi được yêu cầu.
- Giữ Mongoose, class-validator với `ViValidationPipe`, Jest và response envelope.
```

## Cập nhật và gỡ

Xem danh sách skill trong gói:

```bash
npx @nestjs/skills@0.1.4 list
```

Cập nhật lên bản mới nhất:

```bash
npx @nestjs/skills@latest add --agent all
```

Gỡ các skill do công cụ này cài:

```bash
npx @nestjs/skills@0.1.4 remove --agent all
```

Lệnh cập nhật thay toàn bộ thư mục skill cũ, nên không sửa trực tiếp file trong đó. Sau khi cập nhật, đọc lại phần tương thích trong [README của bộ skill](https://github.com/nestjs/agent-skills#compatibility), rồi sửa số phiên bản trong tài liệu này.

## Cách sử dụng

Bạn không cần gọi skill bằng tay: agent đọc phần mô tả và tự nạp skill khi công việc khớp. Để chắc chắn một skill được dùng, nêu tên nó trong yêu cầu. Trong Claude Code có thể gõ `/` kèm tên skill, ví dụ `/nestjs-feature`. `Chưa xác minh`: cách gọi trực tiếp trên Codex và Cursor.

| Skill | Dùng khi | Mức áp dụng cho dự án |
|---|---|---|
| `nestjs` | Tạo hoặc mở rộng ứng dụng, cấu trúc module, dependency injection | Một phần: dùng mục lỗi thường gặp, bỏ phần tạo dự án mới |
| `nestjs-feature` | Thêm hoặc sửa endpoint, validation, status code, lỗi, SSE | Cao: dùng nhánh class-validator, bỏ nhánh Zod |
| `nestjs-testing` | Viết và sửa unit test, e2e test | Một phần: nguyên tắc dùng được, cú pháp Vitest phải đổi sang Jest |
| `nestjs-production` | Config, log, health check, rate limit, OpenAPI, shutdown | Một phần: dùng làm checklist, bỏ NodeAdapter và Observe |
| `nestjs-auth` | Đăng nhập, session, token, phân quyền | Thấp: chỉ dùng nguyên tắc bảo mật, không dùng package |
| `nestjs-data` | Lưu trữ dữ liệu với Drizzle hoặc TypeORM | Thấp: không hỗ trợ Mongoose, chỉ dùng nguyên tắc chung |

### Câu lệnh mẫu

Thêm câu ràng buộc này vào mọi yêu cầu viết code:

```text
Dự án dùng NestJS 10, Mongoose, class-validator, Jest. Quy ước của repo thắng skill; không đề xuất nâng cấp hay đổi thư viện.
```

Thêm endpoint:

```text
Dùng skill nestjs-feature: thêm endpoint đánh dấu đã đọc tất cả thông báo của người dùng hiện tại.
Kiểm tra status code, DTO và quyền sở hữu, kèm test.
```

Review thay đổi trước khi mở Pull Request:

```text
Dùng skill nestjs và nestjs-feature: review diff của nhánh này, chỉ tìm lỗi mà test hiện tại vẫn qua.
Với mỗi lỗi, nêu request gây lỗi và một test chứng minh. Chưa sửa code.
```

Viết test:

```text
Dùng skill nestjs-testing: viết e2e test cho route mới bằng Jest, dùng lại configureApp và tiện ích trong test/utils.
```

Rà soát trước khi phát hành:

```text
Dùng skill nestjs-production: đối chiếu cấu hình hiện tại với checklist, chỉ báo cáo kèm bằng chứng trong code.
Không cài thêm package.
```

## Phạm vi áp dụng cho dự án này

| Skill giả định | Dự án đang dùng | Cách xử lý |
|---|---|---|
| NestJS 12, ESM, import đuôi `.js` | NestJS 10, CommonJS | Giữ nguyên |
| Vitest (`vi.fn()`) | Jest (`jest.fn()`) | Giữ Jest |
| Zod với `@Body({ schema })` (Nest 12.1+) | class-validator với [ViValidationPipe](../../src/utils/validation/vi-validation.pipe.ts) | Không dùng được trên Nest 10 |
| Drizzle hoặc TypeORM | MongoDB với Mongoose | Chỉ lấy nguyên tắc: lọc theo chủ sở hữu trong query, dựa vào unique index, transaction ngắn |
| `@nestjs/authentication`, `@nestjs/authorization` | JWT, Passport, guard theo vai trò | Không thêm package; xem [Xác thực](../08-security/authentication.md) và [Phân quyền](../08-security/authorization.md) |
| `NodeAdapter` (Nest 12.3+) | Express | Giữ Express |
| NestJS Observe (cần core 11.1.4+) | Sentry, Pino, Prometheus | Không thêm; không chạy `npx @nestjs/observe link` |
| Wildcard có tên của Express 5 (Nest 11+) | Express đi kèm Nest 10 | Không đổi cú pháp route |
| Body lỗi mặc định và response không bọc | Response envelope `{ statusCode, message, data }` | Giữ contract của dự án |

Hai khuyến nghị của skill đã có sẵn trong code: pipeline HTTP dùng chung cho `main.ts` và e2e test ([app.setup.ts](../../src/app.setup.ts)), và `ThrottlerGuard` đăng ký bằng `useExisting` để test thay thế được ([app.module.ts](../../src/app.module.ts)).

Trang [docs.nestjs.com](https://docs.nestjs.com) mà skill dẫn tới mô tả phiên bản mới nhất. Khi API khác nhau, kiểm tra package đã cài trong `node_modules`.

## Checklist lỗi vẫn qua được test

Dùng khi review code do agent viết. Các mục lấy từ bộ skill và đã lọc theo công nghệ của dự án; đây là câu hỏi cần kiểm tra, không phải danh sách lỗi đã xác nhận.

### Validation và HTTP

- `@IsOptional()` bỏ qua mọi rule khi giá trị là `null`. `PartialType()` cũng gắn `@IsOptional()`. Với field được bỏ trống nhưng không được `null`, dùng `@ValidateIf((_, value) => value !== undefined)` hoặc `PartialType(Dto, { skipNullProperties: false })`.
- Object và mảng lồng nhau chỉ được validate khi có cả `@ValidateNested()` và `@Type()`.
- Pipe toàn cục không bật `transform`, nên `@Query('page') page: number` vẫn là chuỗi lúc chạy.
- `@Post()` trả 201. Route không tạo tài nguyên cần `@HttpCode(200)`.
- Route tĩnh như `search` phải khai báo trước `:id`.
- Filter `@Catch()` phải xử lý `HttpException` trước, nếu không 4xx thành 500.
- Trong guard, đọc metadata bằng `reflector.getAllAndOverride` để lấy cả decorator trên class.

### Bảo mật

- Đăng nhập với email không tồn tại phải tốn thời gian tương đương sai mật khẩu.
- Cache theo URL trên route trả dữ liệu riêng từng người sẽ lộ dữ liệu giữa các người dùng.
- Kết nối SSE và WebSocket chỉ xác thực lúc mở. Khi session bị thu hồi hoặc tài khoản bị xóa, phải đóng kết nối.
- CORS kèm credential cần danh sách origin cụ thể.

### Dữ liệu và xử lý nền

- Ghi có điều kiện theo chủ sở hữu trong một câu lệnh, thay vì đọc rồi `save()`. Với Mongoose, ví dụ `findOneAndUpdate({ _id, userId }, ...)` (suy ra từ nguyên tắc của skill, skill không có ví dụ Mongoose).
- Ràng buộc duy nhất dựa vào unique index và bắt lỗi trùng (mã `11000`), không chỉ kiểm tra trước khi insert.
- Job BullMQ có thể chạy lại: đặt `attempts`, `backoff`, `removeOnComplete`, `removeOnFail`, và viết job idempotent.
- `@Cron()` chạy trên mọi instance và theo múi giờ của server.

### Dependency injection và vận hành

- Không dùng `import type` cho class được inject.
- Một class khai báo trong `providers` của hai module tạo ra hai instance.
- Provider `Scope.REQUEST` làm mọi class phụ thuộc cũng thành request-scoped, và `@Cron()` trong đó không chạy.
- Sau reverse proxy, `keepAliveTimeout` của Node nên dài hơn thời gian giữ kết nối rỗi của proxy.

## Quy trình đề xuất

1. Giao việc cho agent kèm câu ràng buộc ở mục [Câu lệnh mẫu](#câu-lệnh-mẫu).
2. Yêu cầu agent nêu skill đã dùng và phần nào của skill đã bỏ qua.
3. Review theo checklist ở trên.
4. Chạy kiểm tra như CI (e2e cần `npm run docker:dev`):

```bash
npx tsc --noEmit && npm run lint && npm test && npm run test:e2e && npm run build
```

Skill giúp agent có thêm kiến thức, không thay thế review và test.

## Xử lý sự cố

| Hiện tượng | Cách xử lý |
|---|---|
| Agent không thấy skill | Mở phiên mới; kiểm tra `.claude/skills/nestjs/SKILL.md` tồn tại; chạy lại lệnh cài |
| Lệnh cài báo thư mục trùng tên không do công cụ cài | Đổi tên thư mục của bạn; chỉ dùng `--force` khi chắc chắn muốn ghi đè |
| Agent đề xuất `@nestjs/authentication`, Zod schema hoặc Vitest | Nhắc câu ràng buộc phiên bản; kiểm tra quy tắc trong `AGENTS.md` |
| Build lỗi vì API không tồn tại | API thuộc Nest 11 hoặc 12; yêu cầu agent dùng API của phiên bản đã cài |

## Tham khảo

- [README của nestjs/agent-skills](https://github.com/nestjs/agent-skills)
- [Chuẩn Agent Skills](https://agentskills.io/specification)
- [Quy trình phát triển](development-workflow.md)
