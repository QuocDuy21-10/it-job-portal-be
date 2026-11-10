# Chat Messages (`chat_messages`)

Từng tin nhắn trong một [chat-sessions](chat-sessions.md), gồm lời người dùng, câu trả lời của trợ lý và kết quả công cụ.

- **Nguồn schema:** [chat-message.schema.ts](../../../src/chat/schemas/chat-message.schema.ts)
- **Phân loại dữ liệu:** **có thể chứa dữ liệu cá nhân**: `content` là nội dung người dùng gõ, có thể gồm thông tin về CV, nghề nghiệp. Không ghi `content` vào log.
- **Soft-delete:** plugin thêm `isDeleted` và `deletedAt`.

## Data dictionary

| Field | Type | Required | Default | Ràng buộc | Ý nghĩa |
|---|---|---|---|---|---|
| `sessionId` | Mixed | Có | — | ref: `ChatSession` | Phiên chat chứa tin nhắn |
| `userId` | Mixed | Có | — | ref: `User` | Người dùng sở hữu phiên |
| `role` | String | Có | — | enum: `tool`, `system`, `assistant`, `user` | Người phát tin nhắn: `user`, `assistant`, `system`, `tool` |
| `content` | String | Có | — | — | Nội dung tin nhắn |
| `sequence` | Number | Có | — | — | Số thứ tự tin nhắn trong phiên |
| `relatedJobIds` | [String] | Không | — | — | Mã các tin tuyển dụng được nhắc tới, dạng chuỗi |
| `metadata` | Mixed | Không | — | — | Thông tin kỹ thuật của lượt trả lời (xem cấu trúc bên trên) |
| `createdAt` | Date | Không | — | — | Thời điểm tạo |
| `updatedAt` | Date | Không | — | — | Thời điểm sửa gần nhất |
| `isDeleted` | Boolean | Có | `false` | thêm bởi plugin xóa mềm | Cờ xóa mềm. `true` nghĩa là bản ghi đã bị xóa khỏi nghiệp vụ nhưng vẫn còn trong database |
| `deletedAt` | Date | Không | `null` | thêm bởi plugin xóa mềm | Thời điểm xóa mềm |

`metadata` là `type: Object` tự do, theo `IChatMessageMetadata` ([chat-message-metadata.interface.ts](../../../src/chat/interfaces/chat-message-metadata.interface.ts)): `provider`, `model`, `intent`, `intentDetectionSource`, `latencyMs`, `promptTokens`, `completionTokens`, `totalTokens`, `estimatedPromptTokens`, `fallbackUsed`, `guardrailFlags[]`, `errorCategory`. Đây là thông tin kỹ thuật của lượt trả lời, được tách riêng khỏi `content`.

## Indexes

| Keys | Thuộc tính | Mục đích |
|---|---|---|
| `{ sessionId: 1, sequence: 1 }` | — | Đọc hội thoại theo đúng thứ tự |
| `{ userId: 1, createdAt: -1 }` | — | Tin nhắn gần đây của một người |

## Quan hệ

| Field | Loại | Đích |
|---|---|---|
| `sessionId` | Reference, `ref: 'ChatSession'` | `chat_sessions`. Kiểu Mongoose là Mixed |
| `userId` | Reference, `ref: 'User'` | `users`. Kiểu Mongoose là Mixed |
| `relatedJobIds` | Chuỗi mã tin | `jobs._id` dạng chuỗi, không phải tham chiếu ObjectId |

Về kiểu Mixed của `sessionId` và `userId`, xem [database-overview](../database-overview.md#kiểu-objectid-thực-tế).

## Vai trò tin nhắn (`role`)

`user`, `assistant`, `system`, `tool`. `sequence` đánh số thứ tự trong phiên, cùng `sessionId` tạo thứ tự hội thoại.

## Ví dụ document

```json
{
  "_id": "665f1a2b3c4d5e6f70819f01",
  "sessionId": "665f1a2b3c4d5e6f70819e01",
  "userId": "665f1a2b3c4d5e6f70819201",
  "role": "assistant",
  "content": "Day la mot so tin phu hop voi ban.",
  "sequence": 2,
  "relatedJobIds": ["665f1a2b3c4d5e6f70819301"],
  "metadata": { "provider": "groq", "intent": "job_search", "latencyMs": 820, "fallbackUsed": false },
  "isDeleted": false
}
```

Giá trị `model` và `intent` trong `metadata` là minh họa. Tập giá trị hợp lệ của `intent` nằm ở enum `EChatIntent`.

## Lưu ý

- **Known Limitation:** không có TTL và không có index trên `sessionId` riêng lẻ ngoài index ghép `{ sessionId, sequence }`, đủ cho truy vấn theo phiên.
- Chưa kiểm tra cách `sequence` được cấp khi có hai request đồng thời cùng một phiên. Trạng thái: `Chưa xác minh`.
