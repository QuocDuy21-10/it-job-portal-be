# Module AI Chat

## Overview

Trợ lý AI tư vấn nghề nghiệp IT tại Việt Nam cho người dùng đã đăng nhập: gợi ý việc làm, thông tin công ty, góp ý CV, hỏi đáp nền tảng. Backend **không** để mô hình tự quyết mọi thứ: lọc đầu vào, nhận diện ý định, dựng ngữ cảnh từ dữ liệu thật, giới hạn lượt dùng, kiểm tra đầu ra, và chỉ chấp nhận gợi ý tin nằm trong ngữ cảnh đã cung cấp.

API: [chat endpoints](../05-api/endpoints/chat.md). Stream SSE: [realtime](../05-api/realtime.md#stream-chat-ai). Trình tự: [ai-chat-streaming](../06-workflows/sequences/ai-chat-streaming.md). Dữ liệu: [chat-sessions](../04-database/collections/chat-sessions.md), [chat-messages](../04-database/collections/chat-messages.md), [chat-tool-actions](../04-database/collections/chat-tool-actions.md), [chat-quota-policies](../04-database/collections/chat-quota-policies.md), [ai-usage-logs](../04-database/collections/ai-usage-logs.md).

## Architecture

| Thành phần | File | Vai trò |
|---|---|---|
| Điều phối | [chat.service.ts](../../src/chat/chat.service.ts) | Một lượt chat: chuẩn bị, quota, gọi AI, kiểm tra, lưu |
| Lọc đầu vào | [chat-guardrail.service.ts](../../src/chat/chat-guardrail.service.ts) | Làm sạch tin nhắn, chặn mẫu tấn công prompt |
| Nhận diện ý định | [chat-intent.service.ts](../../src/chat/chat-intent.service.ts) | Phân loại câu hỏi |
| Ngữ cảnh | [chat-context.service.ts](../../src/chat/chat-context.service.ts) và [context-providers/](../../src/chat/context-providers/) | Dựng dữ liệu thật đưa vào prompt |
| Dựng prompt | [chat-prompt.builder.ts](../../src/chat/chat-prompt.builder.ts) | Ghép system prompt theo ý định |
| Hạn mức | [chat-quota.service.ts](../../src/chat/chat-quota.service.ts) | Đếm lượt theo ngày trong Redis |
| Kiểm tra đầu ra | [chat-response-formatter.service.ts](../../src/chat/chat-response-formatter.service.ts), [chat-output-topic-guard.service.ts](../../src/chat/chat-output-topic-guard.service.ts) | Làm sạch, chặn trả lời lạc đề |
| Hành động cần xác nhận | [chat-tool-action.service.ts](../../src/chat/chat-tool-action.service.ts) | Đề xuất rồi chờ người dùng xác nhận |
| Cache | [chat-cache.service.ts](../../src/chat/chat-cache.service.ts) | Cache câu hỏi thường gặp |
| Nhật ký dùng AI | [ai-usage.service.ts](../../src/chat/ai-usage.service.ts) | Ghi `ai_usage_logs`, thống kê cho quản trị |
| Nhà cung cấp | [ai.service.ts](../../src/ai/ai.service.ts), [groq.service.ts](../../src/groq/groq.service.ts), [gemini.service.ts](../../src/gemini/gemini.service.ts) | Chọn nhà cung cấp, gọi mô hình |

`chat` import `ai`, `cv-profiles`, `jobs`, `users`, `companies`, `skills`, `matching` ([module-dependencies](../02-architecture/module-dependencies.md)).

## Một lượt chat (đường stream)

Theo `streamMessage` trong [chat.service.ts](../../src/chat/chat.service.ts):

1. **Chuẩn bị lượt** (`prepareChatTurn`): xác định phiên, kiểm tra và làm sạch tin nhắn bằng guardrail, nhận diện ý định, dựng ngữ cảnh và system prompt, nạp lịch sử.
2. **Câu hỏi thường gặp có trong cache?** Nếu có, trả luôn (một sự kiện `token` rồi `done`), **không** gọi AI và **không đặt chỗ quota**; chỉ đọc trạng thái quota.
3. **Đặt chỗ quota** (`chatQuotaService.reserve`). Hết hạn mức: ném `ChatQuotaExceededException`.
4. **Gọi AI dạng stream** qua `AIService.streamChat`, đẩy từng đoạn `token`.
5. **Kiểm tra đầu ra**: làm sạch văn bản, kiểm tra chủ đề.
6. **Xác thực gợi ý tin**: chỉ giữ mã tin nằm trong tập `validJobIds` của ngữ cảnh đã dựng (`validateRecommendedJobIds`).
7. **Lưu**: ghi tin nhắn người dùng và trợ lý, cập nhật phiên, ghi `ai_usage_logs`, tóm tắt hội thoại khi cần.
8. Phát sự kiện `done`.

Nếu lỗi xảy ra trước khi có `token` nào, hạn mức được **hoàn lại** (`rollback`) và `quotaRollback` được ghi vào nhật ký. Đường không stream (`POST /chat/message`) có cùng trình tự nhưng trả JSON và cho phép dùng AI để phân loại ý định khi luật không đủ chắc chắn; đường stream đặt `allowAiIntentClassifier: false`.

## Ý định (`EChatIntent`)

`job_advisor`, `company_info`, `cv_review`, `job_matching`, `faq`, `recruiter_support`, `general`.

Phân loại ưu tiên theo luật (`deterministic`) hoặc theo kiểu phiên (`session_type`). Chỉ khi cho phép và độ tin cậy dưới ngưỡng `AI_CONFIDENCE_THRESHOLD` mới nhờ mô hình phân loại (nguồn `ai`); nếu phân loại AI lỗi thì dùng kết quả luật (nguồn `fallback`). Nguồn được ghi trong `intentDetectionSource`.

## Ngữ cảnh và prompt

System prompt gồm: vai trò ("Expert AI Career Advisor for Dev Link"), ý định, tên người dùng, phần dữ liệu theo ý định, tóm tắt hội thoại trước, và các quy tắc ([chat-prompt.builder.ts](../../src/chat/chat-prompt.builder.ts)).

| Ý định | Dữ liệu đưa vào prompt |
|---|---|
| `job_advisor` | Ngữ cảnh nền tảng, hồ sơ người dùng, tin phù hợp với họ, số tin đã nộp, kết quả tìm kiếm theo câu hỏi |
| `company_info` | Ngữ cảnh nền tảng, công ty được nhắc tới (tên, địa chỉ, mô tả, số tin đang tuyển), kết quả tìm kiếm |
| `cv_review` | Hồ sơ người dùng và các tín hiệu đánh giá CV |
| `job_matching` | Dữ liệu từ `JobMatchingContextProvider` |
| `faq` | Dữ liệu FAQ |
| `recruiter_support` | Chỉ dẫn chung cho nhà tuyển dụng, dặn "Do not expose candidate private data" |
| `general` | Chỉ trả lời nếu liên quan sự nghiệp IT, việc làm, CV, phỏng vấn, tuyển dụng |

Lịch sử đưa vào tối đa **10 tin gần nhất** (`MAX_HISTORY_MESSAGES`). Ngữ cảnh người dùng cache 5 phút và ngữ cảnh nền tảng 30 phút trong `CACHE_MANAGER` (bộ nhớ), bị xóa khi CV đổi ([caching-strategy](../02-architecture/caching-strategy.md)).

**Dữ liệu cá nhân gửi cho nhà cung cấp AI.** Ngữ cảnh `profile` được tuần tự hóa vào prompt và có `email`, kỹ năng và số năm kinh nghiệm của người dùng ([chat-context.service.ts](../../src/chat/chat-context.service.ts)). Tin nhắn người dùng cũng được gửi. Cả hai tới Groq hoặc Gemini, là bên thứ ba.

## Guardrail (lớp bảo vệ)

### Đầu vào

`ChatGuardrailService` làm sạch tin nhắn rồi đối chiếu với các mẫu regex, mỗi mẫu có mức rủi ro:

| Nhóm | Ví dụ cờ | Mức |
|---|---|---|
| Ghi đè chỉ dẫn | `ignore_previous_instructions`, `instruction_override`, `persona_override`, `vi_injection` | Cao |
| Lộ prompt | `reveal_system_prompt`, `prompt_probe`, `prompt_extraction` | Cao hoặc trung bình |
| Đổi vai trò | `role_override`, `roleplay_bypass`, `vi_roleplay_bypass` | Cao |
| Vượt rào | `jailbreak` | Cao |
| Yêu cầu sinh mã | `code_generation_request` | Cao |

Rủi ro **cao** bị chặn bằng `ChatGuardrailBlockedException` (`400`, "Your message appears to contain instructions that cannot be processed by the chatbot."). Rủi ro trung bình chỉ gắn cờ vào `guardrailFlags`. Mẫu có cả tiếng Anh lẫn tiếng Việt.

### Đầu ra

Làm sạch đầu ra: loại thẻ `<script>`, thuộc tính sự kiện (`onclick=`), liên kết `javascript:` và gắn cờ tương ứng (`output_script_removed`, `output_event_handler_removed`, ...). Sau đó `ChatOutputTopicGuardService` nhờ một mô hình phân loại (Groq, `response_format: json_object`, nhiệt độ 0,1) xác định câu trả lời có thuộc chủ đề IT hay không; nếu lạc đề thì thay bằng thông báo từ chối song ngữ ("Xin lỗi, mình chỉ hỗ trợ tư vấn nghề nghiệp IT tại Việt Nam...").

**Fail-open:** nếu bộ phân loại không khả dụng hoặc ném lỗi, câu trả lời **được cho qua** (`classifier_unavailable`, `classifier_error`). Bộ lọc chủ đề vì vậy là lớp giảm thiểu, không phải đảm bảo.

### Chống ảo giác về tin tuyển dụng

Mô hình chỉ được gợi ý các mã tin có trong ngữ cảnh đã dựng; mã khác bị loại (`validateRecommendedJobIds`). Thông tin tin hiển thị cho người dùng lấy từ database chứ không từ văn bản mô hình sinh ([chat-recommended-job.dto.ts](../../src/chat/dto/chat-recommended-job.dto.ts)).

## Hành động cần xác nhận (tool action)

Mô hình có thể đề xuất `save_job` (lưu một tin). Thay vì thực hiện, backend tạo một `chat_tool_actions` trạng thái `pending` với `expiresAt` (mặc định 15 phút) và trả `suggestedActions` về client. Chỉ khi người dùng gọi `POST /chat/tool-actions/:actionId/confirm` thì hành động mới chạy; hủy bằng `DELETE`. Nhờ vậy mô hình không thay đổi dữ liệu người dùng nếu chưa có xác nhận tường minh. Hết hạn được xử lý lười ([chat-tool-actions](../04-database/collections/chat-tool-actions.md#vòng-đời)).

## Hạn mức (quota)

Chi tiết: [chat-quota-policies](../04-database/collections/chat-quota-policies.md#cách-quota-hoạt-động). Tóm tắt: bộ đếm trong **Redis**, script Lua nguyên tử, đặt lại theo múi giờ chính sách; `NORMAL USER` 30, `HR` 100, `SUPER ADMIN` không giới hạn mỗi ngày; chính sách đọc từ MongoDB và nhớ ngắn hạn; câu trả lời cache FAQ không tiêu hạn mức. Có thêm giới hạn 15 lượt mỗi phút ở mức route. Khi không đọc được Redis, nhật ký ghi `quotaUnavailable`; cách chat xử lý trường hợp này (cho qua hay chặn): `Chưa xác minh`.

## Nhà cung cấp và dự phòng

Mặc định Groq là nhà cung cấp chính cho chat và tóm tắt, Gemini là dự phòng, đều đổi được bằng biến môi trường ([ai.constants.ts](../../src/ai/ai.constants.ts)). Lỗi **đủ điều kiện chuyển dự phòng** của Groq: giới hạn tốc độ, lỗi kết nối, hết thời gian, lỗi máy chủ 5xx ([groq.service.ts](../../src/groq/groq.service.ts)). Chuyển sang Gemini còn phải qua bộ giữ quota Gemini với loại `chat-fallback` (chừa 2 mỗi phút, 25 mỗi ngày). `fallbackUsed` ghi vào nhật ký. Chi tiết: [ai-providers](../07-integrations/ai-providers.md).

## Ghi nhật ký

Mỗi lượt ghi một `ai_usage_logs` với nhà cung cấp, mô hình, token, độ trễ, chi phí ước tính, trúng cache, cờ guardrail, thông tin quota và kết quả bộ lọc chủ đề. Nhật ký **không** chứa nội dung hội thoại. Nội dung tin nhắn nằm ở `chat_messages`. Quản trị viên xem thống kê qua `GET /chat/admin/usage/*`.

## Known Limitation

| Vấn đề | Chi tiết |
|---|---|
| Guardrail đầu vào dựa trên regex | Chỉ bắt các mẫu đã liệt kê; cách diễn đạt khác, ngôn ngữ khác, hoặc chèn chỉ dẫn qua dữ liệu (ví dụ nội dung mô tả tin hay tên công ty đưa vào prompt) không được phát hiện. Chưa thử tấn công thực tế |
| Dữ liệu nhập tay đưa vào prompt | Mô tả công ty, tên tin, hồ sơ người dùng được tuần tự hóa vào system prompt; nếu chứa chỉ dẫn, mô hình có thể bị ảnh hưởng. Các trường này do người dùng và HR nhập |
| Bộ lọc chủ đề fail-open | Khi bộ phân loại lỗi, câu trả lời lạc đề vẫn đi qua |
| Mẫu `code_generation_request` có thể chặn nhầm | Câu hỏi nghề nghiệp có chứa từ như "write Python" bị coi là rủi ro cao. Chưa đo tỉ lệ chặn nhầm |
| Email người dùng nằm trong prompt | Gửi tới bên thứ ba |
| Dữ liệu hội thoại giữ vô thời hạn | Không TTL; xóa khi xóa tài khoản |
| Chưa xác minh | Hành vi khi client ngắt kết nối giữa stream (có hoàn quota không), và khi Redis lỗi |

## Testing

Có test cho `ChatService`, `ChatController`, guardrail, intent, prompt builder, response formatter, output topic guard, quota, tool action, ai-usage và context providers (xem các file `*.spec.ts` trong [src/chat/](../../src/chat/)). Chưa chạy được với nhà cung cấp AI thật.

## Source References

[src/chat/](../../src/chat/), [src/ai/](../../src/ai/), [src/groq/](../../src/groq/), [src/gemini/](../../src/gemini/).
