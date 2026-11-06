# Thời gian thực: Socket.IO và stream chat

Backend có hai cơ chế đẩy dữ liệu về client ngoài REST thông thường:

| Cơ chế | Dùng cho | Giao thức |
|---|---|---|
| Socket.IO, namespace `/notifications` | Thông báo mới | WebSocket (Socket.IO) |
| Stream trả lời chat AI | Hiển thị câu trả lời từng phần | HTTP `POST`, `Content-Type: text/event-stream` |

Backend **không** dùng endpoint `@Sse` của NestJS. Stream chat là `POST` với phản hồi dạng SSE, nên client phải dùng `fetch` đọc stream (không dùng `EventSource`, vốn chỉ hỗ trợ `GET`).

## Socket.IO: thông báo

Nguồn: [notifications.gateway.ts](../../src/notifications/notifications.gateway.ts).

### Kết nối

| Hạng mục | Giá trị |
|---|---|
| Namespace | `/notifications` |
| Xác thực | Access token qua `handshake.auth.token`, hoặc header `Authorization: Bearer <token>`. Xác minh bằng `JWT_ACCESS_TOKEN_SECRET` |
| Thiếu hoặc sai token | Server ngắt kết nối ngay |
| Phòng | Mỗi kết nối vào phòng `user_<userId>`; nhiều thiết bị của một người cùng nhận |
| CORS | `origin: true`, `credentials: true` |

Ví dụ phía client (minh họa):

```js
import { io } from 'socket.io-client';

const socket = io('https://api.example.com/notifications', {
  auth: { token: accessToken },
});

socket.on('notification:new', notification => {
  // cập nhật chuông thông báo
});
```

### Sự kiện từ server tới client

| Sự kiện | Khi nào | Payload |
|---|---|---|
| `notification:new` | Mỗi lần `NotificationsService.create` lưu một thông báo | Toàn bộ document thông báo vừa lưu, xem [notifications](../04-database/collections/notifications.md) |

Server không khai báo `@SubscribeMessage`, nên client **không** gửi sự kiện nào lên server. Đánh dấu đã đọc, xóa, đếm chưa đọc đều qua REST: [notifications](endpoints/notifications.md).

### Known Limitation

- **Chỉ xác minh chữ ký token**: gateway dùng `JwtService.verifyAsync` và không tải người dùng để kiểm tra khóa tài khoản, khác với route REST (`JwtStrategy` kiểm tra trạng thái mỗi request). Người dùng bị khóa vẫn giữ kết nối socket đến khi access token hết hạn. Suy ra từ mã nguồn, chưa chạy thử.
- **Token chỉ được kiểm tra lúc kết nối**: token hết hạn sau khi đã kết nối không làm ngắt kết nối. Chưa xác minh.
- **Một instance**: bản đồ socket nằm trong bộ nhớ, không có adapter Redis, nên với nhiều instance chỉ socket cùng instance nhận được `notification:new` ([scalability](../02-architecture/scalability.md)).
- Payload chứa cả `createdBy` (email người tạo) và `userId`, vì là toàn bộ document. Chưa kiểm tra cách phía giao diện sử dụng.

## Stream chat AI

Hai route trả stream (cả hai `@SkipTransform`, không bọc `{ statusCode, message, data }`):

| Route | Mô tả |
|---|---|
| `POST /api/v1/chat/message/stream` | Gửi tin, tự tạo hoặc dùng phiên mặc định |
| `POST /api/v1/chat/sessions/:sessionId/messages/stream` | Gửi tin vào một phiên cụ thể |

Chi tiết tham số và DTO: [chat](endpoints/chat.md). Logic chat, guardrail và quota: `03-modules/ai-chat.md` (Phase 3).

### Định dạng

Nguồn: `writeMessageStream` và `formatSseEvent` trong [chat.controller.ts](../../src/chat/chat.controller.ts).

Header phản hồi: `200`, `Content-Type: text/event-stream; charset=utf-8`, `Cache-Control: no-cache, no-transform`, `Connection: keep-alive`. Mỗi sự kiện có dạng:

```text
event: <tên>
data: <dòng 1>
data: <dòng 2>

```

Dữ liệu nhiều dòng được tách thành nhiều dòng `data:`; đối tượng được `JSON.stringify` thành một dòng.

| Sự kiện | `data` | Ý nghĩa |
|---|---|---|
| `token` | Chuỗi văn bản | Một đoạn câu trả lời. Với câu trả lời lấy từ cache, toàn bộ nội dung đến trong một sự kiện |
| `done` | JSON | Kết thúc thành công. Gồm `sessionId`, `conversationId` (cùng giá trị `sessionId`), `response` (văn bản đầy đủ), `intent`, `recommendedJobIds`, `recommendedJobs`, `suggestedActions`, `quota`, và `cacheHit` khi trúng cache |
| `error` | JSON `{ "message": "...", "quota": { "remainingQuota": n, "nextResetTime": <epoch giây> } }` | Lỗi trong lúc xử lý. `quota` chỉ có khi hết hạn mức |

`recommendedJobIds` và `recommendedJobs` chỉ có khi có gợi ý. Danh sách field của `done` lấy từ các `yield` trong [chat.service.ts](../../src/chat/chat.service.ts); kiểu chi tiết của `recommendedJobs`, `suggestedActions`, `quota` chưa được liệt kê ở đây.

Ví dụ (rút gọn, giá trị minh họa):

```text
event: token
data: Dưới đây là một số gợi ý

event: done
data: {"sessionId":"665f1a2b3c4d5e6f70819e01","conversationId":"665f1a2b3c4d5e6f70819e01","response":"Dưới đây là một số gợi ý","intent":"job_search","quota":{}}

```

### Lỗi trong stream

Lỗi xảy ra **trước** khi header được gửi (thiếu token, sai vai trò, DTO sai, vượt `ThrottlerGuard`) trả mã HTTP lỗi thông thường, theo [api-overview](api-overview.md#định-dạng-lỗi).

Lỗi xảy ra **sau** khi header `200` đã gửi, bao gồm hết hạn mức chat, được báo bằng sự kiện `error`, và HTTP vẫn là `200`. Client phải xử lý sự kiện `error` chứ không chỉ kiểm tra mã trạng thái. Với lỗi hết quota, `error.quota.nextResetTime` là thời điểm đặt lại tính bằng epoch giây.

Lỗi không phải `HttpException` trả thông điệp chung "Unable to process your message at this time. Please try again later." để không lộ chi tiết nội bộ.

### Rate limit

Hai route stream dùng `ThrottlerGuard` ở cấp class `ChatController` với `@Throttle` mỗi 60 giây giới hạn 15 lần (hằng `CHAT_ROUTE_RPM_LIMIT` trong [chat.constant.ts](../../src/chat/constants/chat.constant.ts)). Hạn mức lượt chat theo ngày là cơ chế riêng, xem [chat-quota-policies](../04-database/collections/chat-quota-policies.md#cách-quota-hoạt-động).

### Known Limitation

- Khi client ngắt kết nối giữa chừng, chưa kiểm tra việc xử lý hủy luồng và hoàn lại quota. Trạng thái: `Chưa xác minh`.
- `jobId` trong body (tùy chọn) được dùng làm ngữ cảnh; nguồn quyết định hiển thị tin cho người hỏi nằm ở `ai-chat.md` (Phase 3).
