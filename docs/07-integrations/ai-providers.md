# Tích hợp nhà cung cấp AI (Groq và Gemini)

Hai nhà cung cấp, chọn và chuyển dự phòng qua lớp [ai.service.ts](../../src/ai/ai.service.ts). Cách dùng trong chat: [ai-chat](../03-modules/ai-chat.md). Trong đọc CV: [cv-parsing-and-matching](../03-modules/cv-parsing-and-matching.md).

## Phân vai

| Việc | Nhà cung cấp mặc định | Dự phòng |
|---|---|---|
| Chat | Groq | Gemini (bật mặc định) |
| Tóm tắt hội thoại | Groq | Gemini (bật mặc định) |
| Phân loại chủ đề, ý định | Groq | Không |
| Đọc CV | **Gemini** (cố định) | Không |

Nguồn: [ai.constants.ts](../../src/ai/ai.constants.ts) (`DEFAULT_AI_CHAT_PRIMARY_PROVIDER = groq`, `DEFAULT_AI_SUMMARY_PRIMARY_PROVIDER = groq`, hai cờ dự phòng mặc định bật) và [ai.service.ts](../../src/ai/ai.service.ts) (`parseCV` luôn gọi `geminiService`).

## Cấu hình

| Biến | Tác dụng | Mặc định trong code |
|---|---|---|
| `GROQ_API_KEY` | Khóa Groq. Thiếu thì Groq không khả dụng và chỉ ghi cảnh báo | — |
| `GROQ_CHAT_MODEL` | Mô hình chat | `openai/gpt-oss-20b` |
| `GROQ_SUMMARY_MODEL` | Mô hình tóm tắt | Cùng mô hình chat |
| `GROQ_TIMEOUT_MS` | Thời gian chờ | 30000 |
| `GROQ_MAX_RETRIES` | Số lần SDK thử lại | 2 |
| `GEMINI_API_KEY` | Khóa Gemini; **bắt buộc**, `GeminiService` không khởi động nếu thiếu | — |
| `GEMINI_MODEL` | Mô hình Gemini | `gemini-3.1-flash-lite` |
| `GEMINI_DAILY_BUDGET` và các biến dự trữ | Ngân sách quota | 450 mỗi ngày, 15 mỗi phút |
| `AI_CHAT_PRIMARY_PROVIDER`, `AI_SUMMARY_PRIMARY_PROVIDER` | Đổi nhà cung cấp chính | `groq` |
| `AI_CHAT_GEMINI_FALLBACK_ENABLED`, `AI_SUMMARY_GEMINI_FALLBACK_ENABLED` | Bật tắt dự phòng | bật |
| `AI_GROQ_*` (lịch sử, token đầu vào, số tin, ...) | Ngân sách ngữ cảnh gửi cho Groq | `.env.example` ghi là bắt buộc, `AIService` kiểm tra |
| `AI_COST_GROQ_*` | Đơn giá để ước tính chi phí | tùy chọn |

Danh sách đầy đủ: `.env.example` và `14-reference` (Phase 4).

## Chuyển dự phòng

Lỗi Groq được coi là đủ điều kiện chuyển sang Gemini: giới hạn tốc độ, lỗi kết nối, hết thời gian, lỗi máy chủ 5xx ([groq.service.ts](../../src/groq/groq.service.ts)). Chuyển sang Gemini còn phải được bộ giữ quota cho phép (loại `chat-fallback`, chừa 2 mỗi phút và 25 mỗi ngày). Mỗi lần chuyển được ghi bằng `fallbackUsed`.

## Quota Gemini

Đặt chỗ nguyên tử bằng Lua trong Redis; đọc CV có ưu tiên cao nhất. Chi tiết: [cv-parsing-and-matching](../03-modules/cv-parsing-and-matching.md#giữ-quota-gemini). Ngưỡng cảnh báo ngày 70%, 85%, 95%; cách phát cảnh báo (log hay kênh khác): `Chưa xác minh`.

## Dữ liệu gửi đi

| Dữ liệu | Tới | Ghi chú |
|---|---|---|
| Văn bản CV đã làm sạch | Gemini | Dữ liệu cá nhân của ứng viên |
| Tin nhắn người dùng, hồ sơ (gồm email), tin phù hợp, 10 tin lịch sử | Groq, hoặc Gemini khi dự phòng | Trong system prompt |
| Văn bản câu trả lời | Groq | Để phân loại chủ đề |

Điều khoản lưu giữ và huấn luyện của hai nhà cung cấp nằm ngoài repository; cần đối chiếu riêng khi đánh giá quyền riêng tư.

## Độ tin cậy và giới hạn

- Nhiệt độ chat cố định 0,7 trong code (một dòng 0,4 bị comment).
- Phân loại chủ đề fail-open khi lỗi.
- Không có kiểm thử với nhà cung cấp thật trong repository (test dùng mock). Trạng thái: `Chưa xác minh` trên môi trường thật.
