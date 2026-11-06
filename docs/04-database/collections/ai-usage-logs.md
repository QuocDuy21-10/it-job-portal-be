# AI Usage Logs (`ai_usage_logs`)

Mỗi bản ghi là nhật ký một lần gọi AI: dùng nhà cung cấp nào, tốn bao nhiêu token, có trúng cache không, có bị chặn bởi guardrail hay quota không. Phục vụ kiểm soát chi phí và gỡ lỗi.

- **Nguồn schema:** [ai-usage-log.schema.ts](../../../src/chat/schemas/ai-usage-log.schema.ts)
- **Phân loại dữ liệu:** gắn với `userId` nhưng **không chứa nội dung hội thoại**, chỉ số liệu kỹ thuật.
- **Soft-delete:** plugin thêm `isDeleted` và `deletedAt`.

## Data dictionary

| Field | Type | Required | Default | Ràng buộc | Ý nghĩa |
|---|---|---|---|---|---|
| `userId` | Mixed | Có | — | ref: `User` | Người dùng thực hiện yêu cầu |
| `conversationId` | Mixed | Không | — | ref: `Conversation` | Mã hội thoại ở cấu trúc cũ. Model đích không còn tồn tại |
| `sessionId` | Mixed | Không | — | ref: `ChatSession` | Phiên chat phát sinh yêu cầu |
| `operationType` | String | Có | — | — | Loại thao tác AI (chat, tóm tắt, phân loại...). Chuỗi tự do |
| `provider` | String | Không | — | — | Nhà cung cấp AI đã dùng |
| `model` | String | Không | — | — | Tên mô hình đã dùng |
| `intent` | String | Không | — | — | Ý định người dùng được nhận diện |
| `intentDetectionSource` | String | Không | — | — | Cách nhận diện ý định (luật hay mô hình) |
| `promptTokens` | Number | Không | — | — | Số token đầu vào do nhà cung cấp báo |
| `completionTokens` | Number | Không | — | — | Số token đầu ra do nhà cung cấp báo |
| `totalTokens` | Number | Không | — | — | Tổng token |
| `estimatedPromptTokens` | Number | Không | — | — | Số token đầu vào ước tính phía backend |
| `latencyMs` | Number | Không | — | — | Độ trễ của lần gọi, mili giây |
| `estimatedCostUsd` | Number | Không | — | — | Chi phí ước tính, USD. Bằng 0 nếu chưa cấu hình đơn giá |
| `costEstimated` | Boolean | Không | `false` | — | `true` khi số token đầu vào là ước tính của backend (nhà cung cấp không báo số thật) |
| `cacheHit` | Boolean | Không | `false` | — | Phản hồi lấy từ cache, không gọi AI |
| `cacheCategory` | String | Không | — | — | Nhóm cache được trúng |
| `requestStartedAt` | Date | Không | — | — | Thời điểm bắt đầu xử lý |
| `requestCompletedAt` | Date | Không | — | — | Thời điểm hoàn tất |
| `success` | Boolean | Có | — | — | Lần gọi thành công hay không |
| `fallbackUsed` | Boolean | Không | `false` | — | Đã chuyển sang nhà cung cấp dự phòng |
| `guardrailFlags` | [String] | Không | `[]` | — | Các cờ guardrail được kích hoạt |
| `errorCategory` | String | Không | — | — | Nhóm lỗi nếu thất bại |
| `quotaConsumed` | Boolean | Không | `false` | — | Lượt này đã tính vào quota |
| `quotaRemaining` | Number | Không | — | — | Quota còn lại sau lượt này |
| `quotaResetAt` | Date | Không | — | — | Thời điểm quota được đặt lại |
| `quotaUnavailable` | Boolean | Không | `false` | — | Không đọc được quota (ví dụ Redis lỗi) |
| `quotaRollback` | Boolean | Không | `false` | — | Quota đã được hoàn lại |
| `topicGuardBlocked` | Boolean | Không | — | — | Bị chặn bởi bộ lọc chủ đề |
| `topicGuardCategory` | String | Không | — | — | Nhóm chủ đề bị chặn |
| `topicGuardLatencyMs` | Number | Không | — | — | Độ trễ của bước lọc chủ đề, mili giây |
| `createdAt` | Date | Không | — | immutable | Thời điểm tạo, do `timestamps` hoặc plugin |
| `updatedAt` | Date | Không | — | — | Thời điểm sửa gần nhất, do `timestamps` |
| `isDeleted` | Boolean | Có | `false` | thêm bởi plugin xóa mềm | Cờ xóa mềm. `true` nghĩa là bản ghi đã bị xóa khỏi nghiệp vụ nhưng vẫn còn trong database |
| `deletedAt` | Date | Không | `null` | thêm bởi plugin xóa mềm | Thời điểm xóa mềm |

Hầu hết các field có `index: true` ở mức field (21 index). Với collection ghi nhiều như nhật ký, số index lớn làm chậm ghi và tốn bộ nhớ. Chưa đo xem index nào thật sự được dùng. Trạng thái: `Chưa xác minh`.

## Indexes

| Keys | Thuộc tính | Mục đích |
|---|---|---|
| `{ userId: 1 }` | — | Index đơn lẻ từ `index: true` trên field |
| `{ conversationId: 1 }` | — | Index đơn lẻ trên field kế thừa |
| `{ sessionId: 1 }` | — | Index đơn lẻ từ `index: true` trên field |
| `{ operationType: 1 }` | — | Index đơn lẻ từ `index: true` trên field |
| `{ intent: 1 }` | — | Index đơn lẻ từ `index: true` trên field |
| `{ cacheHit: 1 }` | — | Index đơn lẻ từ `index: true` trên field |
| `{ cacheCategory: 1 }` | — | Index đơn lẻ từ `index: true` trên field |
| `{ requestStartedAt: 1 }` | — | Index đơn lẻ từ `index: true` trên field |
| `{ requestCompletedAt: 1 }` | — | Index đơn lẻ từ `index: true` trên field |
| `{ success: 1 }` | — | Index đơn lẻ từ `index: true` trên field |
| `{ errorCategory: 1 }` | — | Index đơn lẻ từ `index: true` trên field |
| `{ quotaConsumed: 1 }` | — | Index đơn lẻ từ `index: true` trên field |
| `{ quotaRollback: 1 }` | — | Index đơn lẻ từ `index: true` trên field |
| `{ topicGuardBlocked: 1 }` | — | Index đơn lẻ từ `index: true` trên field |
| `{ createdAt: -1 }` | — | Xem nhật ký mới nhất |
| `{ userId: 1, createdAt: -1 }` | — | Nhật ký của một người dùng |
| `{ sessionId: 1, createdAt: -1 }` | — | Nhật ký của một phiên |
| `{ provider: 1, success: 1, createdAt: -1 }` | — | Thống kê tỉ lệ thành công theo nhà cung cấp |
| `{ operationType: 1, createdAt: -1 }` | — | Thống kê theo loại thao tác |
| `{ cacheHit: 1, cacheCategory: 1, createdAt: -1 }` | — | Thống kê tỉ lệ trúng cache |
| `{ quotaConsumed: 1, quotaRollback: 1, createdAt: -1 }` | — | Thống kê tiêu thụ và hoàn quota |

## Quan hệ

| Field | Loại | Đích |
|---|---|---|
| `userId` | Reference, `ref: 'User'` | `users`. Mixed, xem [database-overview](../database-overview.md#kiểu-objectid-thực-tế) |
| `sessionId` | Reference, `ref: 'ChatSession'` | `chat_sessions`. Mixed |
| `conversationId` | Reference, `ref: 'Conversation'` | Model **không tồn tại**, field kế thừa từ cấu trúc cũ |

## Ví dụ document

```json
{
  "_id": "665f1a2b3c4d5e6f7081a101",
  "userId": "665f1a2b3c4d5e6f70819201",
  "sessionId": "665f1a2b3c4d5e6f70819e01",
  "operationType": "chat",
  "provider": "groq",
  "model": "example-model",
  "intent": "job_search",
  "promptTokens": 900,
  "completionTokens": 250,
  "totalTokens": 1150,
  "latencyMs": 820,
  "estimatedCostUsd": 0.0004,
  "costEstimated": true,
  "cacheHit": false,
  "success": true,
  "fallbackUsed": false,
  "guardrailFlags": [],
  "quotaConsumed": true,
  "quotaRemaining": 29,
  "topicGuardBlocked": false
}
```

Các giá trị `operationType`, `model`, `intent`, chi phí trong ví dụ là minh họa. Schema không giới hạn tập giá trị của `operationType`, `provider`, `intent`.

## Lưu ý

- **Known Limitation:** không có TTL, bản ghi tăng vô hạn. Với tải chat lớn, đây là collection tăng nhanh nhất.
- `estimatedCostUsd` được tính từ số token và **đơn giá cấu hình**, đọc lần lượt từ các biến `AI_COST_<PROVIDER>_<MODEL>_<PROMPT|COMPLETION>_USD_PER_1K`, `AI_COST_<PROVIDER>_<PROMPT|COMPLETION>_USD_PER_1K`, `AI_COST_<PROMPT|COMPLETION>_USD_PER_1K` ([ai-usage.service.ts](../../../src/chat/ai-usage.service.ts)). **Không đặt biến nào thì đơn giá là 0 và chi phí ghi là 0**, nên con số 0 không có nghĩa là miễn phí. Mẫu ngắn nhất, ví dụ `AI_COST_PROMPT_USD_PER_1K` hoặc `AI_COST_GROQ_COMPLETION_USD_PER_1K`, đủ để bật tính chi phí.
- `costEstimated = true` khi số token đầu vào là **ước tính của backend** vì nhà cung cấp không báo số thật; không liên quan tới việc đơn giá có được đặt hay không.
- `quotaRollback` đánh dấu lượt chat bị hoàn quota (ví dụ lỗi nhà cung cấp), xem [chat-quota-policies](chat-quota-policies.md#cách-quota-hoạt-động).
