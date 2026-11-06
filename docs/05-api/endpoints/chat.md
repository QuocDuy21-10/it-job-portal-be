# API Chat

Tiền tố `/api/v1/chat`. Controller: [chat.controller.ts](../../../src/chat/chat.controller.ts). Collection: [chat-sessions](../../04-database/collections/chat-sessions.md), [chat-messages](../../04-database/collections/chat-messages.md), [chat-tool-actions](../../04-database/collections/chat-tool-actions.md), [ai-usage-logs](../../04-database/collections/ai-usage-logs.md). Logic chat, guardrail và quota: `03-modules/ai-chat.md` (Phase 3).

`ThrottlerGuard` ở cấp class. Các route gửi tin (có `@Throttle`) bị giới hạn **15 lần mỗi phút** (`CHAT_ROUTE_RPM_LIMIT`, [chat.constant.ts](../../../src/chat/constants/chat.constant.ts)); đây là giới hạn theo thời gian ngắn, tách biệt với **hạn mức theo ngày** (`NORMAL USER` 30, `HR` 100, `SUPER ADMIN` không giới hạn, xem [chat-quota-policies](../../04-database/collections/chat-quota-policies.md#cách-quota-hoạt-động)).

## Hai kiểu phản hồi

| Kiểu | Route | Phản hồi |
|---|---|---|
| Một lần (JSON) | `POST /chat/message`, `POST /chat/sessions/:sessionId/messages` | JSON bọc `{ statusCode, message, data }` |
| Stream (SSE) | `POST /chat/message/stream`, `POST /chat/sessions/:sessionId/messages/stream` | `text/event-stream`, không bọc. Xem [realtime](../realtime.md#stream-chat-ai) |

Với route stream, lỗi hết hạn mức đến qua sự kiện `error` (HTTP vẫn `200`). Với route JSON, hết hạn mức ném `ChatQuotaExceededException` (kế thừa `TooManyRequestsException`, thông điệp "Daily chatbot quota exceeded. Please try again after the quota resets."); mã HTTP là `429` ([too-many-requests.exception.ts](../../../src/chat/exceptions/too-many-requests.exception.ts)).

## Danh sách route

| Route | Auth | Mô tả |
|---|---|---|
| `POST /api/v1/chat/message` | Đăng nhập (mọi vai trò) | Gửi một tin tới trợ lý AI và nhận câu trả lời trọn vẹn (không stream) |
| `GET /api/v1/chat/history` | Đăng nhập (mọi vai trò) | Lịch sử hội thoại có phân trang (`limit` tối đa 100) |
| `DELETE /api/v1/chat/clear` | Đăng nhập (mọi vai trò) | Xóa cuộc trò chuyện hiện tại |
| `POST /api/v1/chat/sessions` | Đăng nhập (mọi vai trò) | Tạo phiên chat mới |
| `GET /api/v1/chat/sessions` | Đăng nhập (mọi vai trò) | Liệt kê các phiên chat của tôi |
| `GET /api/v1/chat/sessions/:sessionId/messages` | Đăng nhập (mọi vai trò) | Xem tin nhắn của một phiên |
| `POST /api/v1/chat/sessions/:sessionId/messages` | Đăng nhập (mọi vai trò) | Gửi tin vào một phiên và nhận câu trả lời trọn vẹn |
| `DELETE /api/v1/chat/sessions/:sessionId` | Đăng nhập (mọi vai trò) | Xóa một phiên chat |
| `GET /api/v1/chat/admin/usage/summary` | Đăng nhập, vai trò: SUPER ADMIN | Tổng hợp mức dùng AI (quản trị viên) |
| `GET /api/v1/chat/admin/usage/timeseries` | Đăng nhập, vai trò: SUPER ADMIN | Chuỗi thời gian mức dùng AI (quản trị viên) |
| `GET /api/v1/chat/admin/usage/top-users` | Đăng nhập, vai trò: SUPER ADMIN | Người dùng dùng AI nhiều nhất (quản trị viên) |
| `POST /api/v1/chat/tool-actions/:actionId/confirm` | Đăng nhập (mọi vai trò) | Xác nhận một hành động do trợ lý đề xuất (ví dụ lưu tin) |
| `DELETE /api/v1/chat/tool-actions/:actionId` | Đăng nhập (mọi vai trò) | Hủy một hành động đang chờ |
| `POST /api/v1/chat/message/stream` | Đăng nhập (mọi vai trò) | Gửi một tin và nhận câu trả lời dạng stream SSE |
| `POST /api/v1/chat/sessions/:sessionId/messages/stream` | Đăng nhập (mọi vai trò) | Gửi tin vào một phiên và nhận câu trả lời dạng stream SSE |

## Ràng buộc đầu vào

- `message`: bắt buộc, 1 đến 1000 ký tự.
- `jobId`: tùy chọn, phải là MongoId; dùng làm ngữ cảnh cho câu hỏi về một tin.
- `history`: `page`, `limit` (mặc định 50, tối đa 100).

## Phạm vi dữ liệu

Phiên và tin nhắn gắn với `userId` của người gọi. Quản trị viên mới gọi được nhóm `admin/usage/*`. Việc kiểm tra người gọi chỉ truy cập phiên của chính mình ở các route `sessions/:sessionId/...` nằm trong `ChatService`, chưa được đối chiếu ở đây: `Chưa xác minh`.

## Known Limitation

- `DELETE /chat/clear` và `DELETE /chat/sessions/:sessionId` đều "xóa" cuộc trò chuyện; khác biệt giữa xóa mềm và xóa thật chưa được kiểm tra. Trạng thái: `Chưa xác minh`.
- Hành động công cụ (`tool-actions`) hết hạn lười (lúc truy cập), xem [chat-tool-actions](../../04-database/collections/chat-tool-actions.md#vòng-đời).

## Chi tiết từng route

### `POST /api/v1/chat/message`

Gửi một tin tới trợ lý AI và nhận câu trả lời trọn vẹn (không stream)

- **Auth:** Đăng nhập (mọi vai trò)
- **Handler:** `sendMessage` trong [chat.controller.ts](../../../src/chat/chat.controller.ts)
- **Mã thành công:** 201, `message` = "Message sent successfully"
- **Giới hạn tốc độ:** CHAT_ROUTE_RPM_LIMIT lần mỗi 1 phút

**Body: `SendMessageDto`** ([send-message.dto.ts](../../../src/chat/dto/send-message.dto.ts))

| Field | Kiểu | Bắt buộc | Validation | Ví dụ |
|---|---|---|---|---|
| `message` | string | Có | IsString, IsNotEmpty, MinLength(1), MaxLength(1000) | 'Tôi nên học skill gì để trở thành Senior Backend Engineer?' |
| `jobId` | string | Không | IsMongoId | '507f1f77bcf86cd799439011' |

**Phản hồi theo Swagger**

| Mã | Mô tả |
|---|---|
| 201 | Message sent successfully |
| 400 | Invalid message format |
| 429 | Too many requests - rate limit exceeded |

### `GET /api/v1/chat/history`

Lịch sử hội thoại có phân trang (`limit` tối đa 100)

- **Auth:** Đăng nhập (mọi vai trò)
- **Handler:** `getHistory` trong [chat.controller.ts](../../../src/chat/chat.controller.ts)
- **Mã thành công:** 200, `message` = "History retrieved successfully"

**Query**

| Tên | Bắt buộc | Mô tả | Ví dụ |
|---|---|---|---|
| `page` | Không | Page number (default: 1) |  |
| `limit` | Không | Messages per page (default: 50, max: 100) |  |
| *(toàn bộ query string)* | — | DTO `ConversationHistoryQueryDto` | |

**Query: `ConversationHistoryQueryDto`** ([conversation-history.dto.ts](../../../src/chat/dto/conversation-history.dto.ts))

| Field | Kiểu | Bắt buộc | Validation | Ví dụ |
|---|---|---|---|---|
| `page` | number | Không | IsInt, Min(1) | 1 |
| `limit` | number | Không | IsInt, Min(1), Max(100) | 50 |

**Phản hồi theo Swagger**

| Mã | Mô tả |
|---|---|
| 200 | History retrieved successfully |

### `DELETE /api/v1/chat/clear`

Xóa cuộc trò chuyện hiện tại

- **Auth:** Đăng nhập (mọi vai trò)
- **Handler:** `clearConversation` trong [chat.controller.ts](../../../src/chat/chat.controller.ts)
- **Mã thành công:** 200, `message` = "Conversation cleared successfully"

**Phản hồi theo Swagger**

| Mã | Mô tả |
|---|---|
| 200 | Conversation cleared successfully |

### `POST /api/v1/chat/sessions`

Tạo phiên chat mới

- **Auth:** Đăng nhập (mọi vai trò)
- **Handler:** `createSession` trong [chat.controller.ts](../../../src/chat/chat.controller.ts)
- **Mã thành công:** 201, `message` = "Chat session created successfully"

**Body: `CreateChatSessionDto`** ([create-chat-session.dto.ts](../../../src/chat/dto/create-chat-session.dto.ts))

| Field | Kiểu | Bắt buộc | Validation | Ví dụ |
|---|---|---|---|---|
| `type` | EChatSessionType | Không | IsEnum(EChatSessionType) | — |
| `title` | string | Không | IsString, MaxLength(120) | 'Backend career advice' |

**Phản hồi theo Swagger**

| Mã | Mô tả |
|---|---|
| 201 | Chat session created successfully |

### `GET /api/v1/chat/sessions`

Liệt kê các phiên chat của tôi

- **Auth:** Đăng nhập (mọi vai trò)
- **Handler:** `listSessions` trong [chat.controller.ts](../../../src/chat/chat.controller.ts)
- **Mã thành công:** 200, `message` = "Chat sessions retrieved successfully"

**Phản hồi theo Swagger**

| Mã | Mô tả |
|---|---|
| 200 | Chat sessions retrieved successfully |

### `GET /api/v1/chat/sessions/:sessionId/messages`

Xem tin nhắn của một phiên

- **Auth:** Đăng nhập (mọi vai trò)
- **Handler:** `getSessionMessages` trong [chat.controller.ts](../../../src/chat/chat.controller.ts)
- **Mã thành công:** 200, `message` = "Session messages retrieved successfully"

**Path params**

| Tên | Kiểu | Mô tả |
|---|---|---|
| `sessionId` | string |  |

**Query**

| Tên | Bắt buộc | Mô tả | Ví dụ |
|---|---|---|---|
| `page` | Không | Page number (default: 1) |  |
| `limit` | Không | Messages per page (default: 50, max: 100) |  |
| *(toàn bộ query string)* | — | DTO `ConversationHistoryQueryDto` | |

**Query: `ConversationHistoryQueryDto`** ([conversation-history.dto.ts](../../../src/chat/dto/conversation-history.dto.ts))

| Field | Kiểu | Bắt buộc | Validation | Ví dụ |
|---|---|---|---|---|
| `page` | number | Không | IsInt, Min(1) | 1 |
| `limit` | number | Không | IsInt, Min(1), Max(100) | 50 |

**Phản hồi theo Swagger**

| Mã | Mô tả |
|---|---|
| 200 | Session messages retrieved successfully |

### `POST /api/v1/chat/sessions/:sessionId/messages`

Gửi tin vào một phiên và nhận câu trả lời trọn vẹn

- **Auth:** Đăng nhập (mọi vai trò)
- **Handler:** `sendSessionMessage` trong [chat.controller.ts](../../../src/chat/chat.controller.ts)
- **Mã thành công:** 201, `message` = "Message sent successfully"
- **Giới hạn tốc độ:** CHAT_ROUTE_RPM_LIMIT lần mỗi 1 phút

**Path params**

| Tên | Kiểu | Mô tả |
|---|---|---|
| `sessionId` | string |  |

**Body: `SendMessageDto`** ([send-message.dto.ts](../../../src/chat/dto/send-message.dto.ts))

| Field | Kiểu | Bắt buộc | Validation | Ví dụ |
|---|---|---|---|---|
| `message` | string | Có | IsString, IsNotEmpty, MinLength(1), MaxLength(1000) | 'Tôi nên học skill gì để trở thành Senior Backend Engineer?' |
| `jobId` | string | Không | IsMongoId | '507f1f77bcf86cd799439011' |

**Phản hồi theo Swagger**

| Mã | Mô tả |
|---|---|
| 201 | Message sent successfully |

### `DELETE /api/v1/chat/sessions/:sessionId`

Xóa một phiên chat

- **Auth:** Đăng nhập (mọi vai trò)
- **Handler:** `clearSession` trong [chat.controller.ts](../../../src/chat/chat.controller.ts)
- **Mã thành công:** 200, `message` = "Chat session cleared successfully"

**Path params**

| Tên | Kiểu | Mô tả |
|---|---|---|
| `sessionId` | string |  |

**Phản hồi theo Swagger**

| Mã | Mô tả |
|---|---|
| 200 | Chat session cleared successfully |

### `GET /api/v1/chat/admin/usage/summary`

Tổng hợp mức dùng AI (quản trị viên)

- **Auth:** Đăng nhập, vai trò: SUPER ADMIN
- **Handler:** `getUsageSummary` trong [chat.controller.ts](../../../src/chat/chat.controller.ts)
- **Mã thành công:** 200, `message` = "AI usage summary retrieved successfully"

**Query**

| Tên | Bắt buộc | Mô tả | Ví dụ |
|---|---|---|---|
| *(toàn bộ query string)* | — | DTO `AiUsageQueryDto` | |

**Query: `AiUsageQueryDto`** ([ai-usage-query.dto.ts](../../../src/chat/dto/ai-usage-query.dto.ts))

| Field | Kiểu | Bắt buộc | Validation | Ví dụ |
|---|---|---|---|---|
| `startDate` | string | Không | IsDateString | '2026-05-01T00:00:00.000Z' |
| `endDate` | string | Không | IsDateString | '2026-05-14T23:59:59.999Z' |
| `provider` | AIProvider | Không | IsIn | — |
| `model` | string | Không | IsString | 'llama-3.3-70b-versatile' |
| `intent` | EChatIntent | Không | IsEnum(EChatIntent) | — |

**Phản hồi theo Swagger**

| Mã | Mô tả |
|---|---|
| 200 | AI usage summary retrieved successfully |

### `GET /api/v1/chat/admin/usage/timeseries`

Chuỗi thời gian mức dùng AI (quản trị viên)

- **Auth:** Đăng nhập, vai trò: SUPER ADMIN
- **Handler:** `getUsageTimeseries` trong [chat.controller.ts](../../../src/chat/chat.controller.ts)
- **Mã thành công:** 200, `message` = "AI usage timeseries retrieved successfully"

**Query**

| Tên | Bắt buộc | Mô tả | Ví dụ |
|---|---|---|---|
| *(toàn bộ query string)* | — | DTO `AiUsageTimeseriesQueryDto` | |

**Query: `AiUsageTimeseriesQueryDto`** ([ai-usage-query.dto.ts](../../../src/chat/dto/ai-usage-query.dto.ts))

Kế thừa `AiUsageQueryDto`.

| Field | Kiểu | Bắt buộc | Validation | Ví dụ |
|---|---|---|---|---|
| `days` | number | Không | IsInt, Min(1), Max(90) | 30 |

**Phản hồi theo Swagger**

| Mã | Mô tả |
|---|---|
| 200 | AI usage timeseries retrieved successfully |

### `GET /api/v1/chat/admin/usage/top-users`

Người dùng dùng AI nhiều nhất (quản trị viên)

- **Auth:** Đăng nhập, vai trò: SUPER ADMIN
- **Handler:** `getTopUsers` trong [chat.controller.ts](../../../src/chat/chat.controller.ts)
- **Mã thành công:** 200, `message` = "Top AI users retrieved successfully"

**Query**

| Tên | Bắt buộc | Mô tả | Ví dụ |
|---|---|---|---|
| *(toàn bộ query string)* | — | DTO `AiUsageTopUsersQueryDto` | |

**Query: `AiUsageTopUsersQueryDto`** ([ai-usage-query.dto.ts](../../../src/chat/dto/ai-usage-query.dto.ts))

Kế thừa `AiUsageQueryDto`.

| Field | Kiểu | Bắt buộc | Validation | Ví dụ |
|---|---|---|---|---|
| `limit` | number | Không | IsInt, Min(1), Max(50) | 10 |

**Phản hồi theo Swagger**

| Mã | Mô tả |
|---|---|
| 200 | Top AI users retrieved successfully |

### `POST /api/v1/chat/tool-actions/:actionId/confirm`

Xác nhận một hành động do trợ lý đề xuất (ví dụ lưu tin)

- **Auth:** Đăng nhập (mọi vai trò)
- **Handler:** `confirmToolAction` trong [chat.controller.ts](../../../src/chat/chat.controller.ts)
- **Mã thành công:** 201, `message` = "Chat tool action confirmed successfully"

**Path params**

| Tên | Kiểu | Mô tả |
|---|---|---|
| `actionId` | string |  |

**Phản hồi theo Swagger**

| Mã | Mô tả |
|---|---|
| 201 | Chat tool action confirmed successfully |

### `DELETE /api/v1/chat/tool-actions/:actionId`

Hủy một hành động đang chờ

- **Auth:** Đăng nhập (mọi vai trò)
- **Handler:** `cancelToolAction` trong [chat.controller.ts](../../../src/chat/chat.controller.ts)
- **Mã thành công:** 200, `message` = "Chat tool action canceled successfully"

**Path params**

| Tên | Kiểu | Mô tả |
|---|---|---|
| `actionId` | string |  |

**Phản hồi theo Swagger**

| Mã | Mô tả |
|---|---|
| 200 | Chat tool action canceled successfully |

### `POST /api/v1/chat/message/stream`

Gửi một tin và nhận câu trả lời dạng stream SSE

- **Auth:** Đăng nhập (mọi vai trò)
- **Handler:** `streamMessage` trong [chat.controller.ts](../../../src/chat/chat.controller.ts)
- **Mã thành công:** 201 (phản hồi không bọc `{ statusCode, message, data }`, do `@SkipTransform`)
- **Giới hạn tốc độ:** CHAT_ROUTE_RPM_LIMIT lần mỗi 1 phút

**Body: `SendMessageDto`** ([send-message.dto.ts](../../../src/chat/dto/send-message.dto.ts))

| Field | Kiểu | Bắt buộc | Validation | Ví dụ |
|---|---|---|---|---|
| `message` | string | Có | IsString, IsNotEmpty, MinLength(1), MaxLength(1000) | 'Tôi nên học skill gì để trở thành Senior Backend Engineer?' |
| `jobId` | string | Không | IsMongoId | '507f1f77bcf86cd799439011' |

**Phản hồi theo Swagger**

| Mã | Mô tả |
|---|---|
| 200 | SSE-compatible stream |

### `POST /api/v1/chat/sessions/:sessionId/messages/stream`

Gửi tin vào một phiên và nhận câu trả lời dạng stream SSE

- **Auth:** Đăng nhập (mọi vai trò)
- **Handler:** `streamSessionMessage` trong [chat.controller.ts](../../../src/chat/chat.controller.ts)
- **Mã thành công:** 201 (phản hồi không bọc `{ statusCode, message, data }`, do `@SkipTransform`)
- **Giới hạn tốc độ:** CHAT_ROUTE_RPM_LIMIT lần mỗi 1 phút

**Path params**

| Tên | Kiểu | Mô tả |
|---|---|---|
| `sessionId` | string |  |

**Body: `SendMessageDto`** ([send-message.dto.ts](../../../src/chat/dto/send-message.dto.ts))

| Field | Kiểu | Bắt buộc | Validation | Ví dụ |
|---|---|---|---|---|
| `message` | string | Có | IsString, IsNotEmpty, MinLength(1), MaxLength(1000) | 'Tôi nên học skill gì để trở thành Senior Backend Engineer?' |
| `jobId` | string | Không | IsMongoId | '507f1f77bcf86cd799439011' |

**Phản hồi theo Swagger**

| Mã | Mô tả |
|---|---|
| 200 | SSE-compatible stream |
