# CV Parsing và Hybrid Matching

## Overview

Hai bước nối tiếp để biến một CV thành điểm phù hợp với một tin tuyển dụng:

1. **Đọc CV (parsing):** lấy văn bản từ file, nhờ mô hình AI (Gemini) trích xuất thành dữ liệu có cấu trúc.
2. **Chấm điểm (matching):** so dữ liệu đó với yêu cầu của tin bằng **công thức do code quy định**, không phải do AI chấm.

"Hybrid" ở đây nghĩa là AI chỉ làm phần khó với ngôn ngữ tự nhiên (đọc CV), còn điểm số và mức ưu tiên là kết quả tất định, cùng đầu vào luôn cho cùng điểm. Nguyên tắc này khớp với [AGENTS.md](../../AGENTS.md): AI hỗ trợ, backend sở hữu quy tắc cuối cùng.

Sơ đồ trình tự: [cv-processing](../06-workflows/sequences/cv-processing.md). Dữ liệu lưu: [resumes](../04-database/collections/resumes.md).

> Điểm phù hợp là **chỉ báo hỗ trợ**, không phải đánh giá khách quan về ứng viên. Nó chỉ so khớp những gì ứng viên khai trong CV với yêu cầu của tin, và có các giới hạn nêu ở mục Known Limitation.

## Responsibilities

| Thành phần | File | Trách nhiệm |
|---|---|---|
| Lấy văn bản | [cv-parser.service.ts](../../src/cv-parser/cv-parser.service.ts) | PDF, DOC, DOCX, TXT sang văn bản; kiểm tra; làm sạch |
| Đọc bằng AI | [gemini.service.ts](../../src/gemini/gemini.service.ts), [ai.service.ts](../../src/ai/ai.service.ts) | Gửi văn bản cho Gemini, nhận JSON |
| Chuẩn hóa kỹ năng | [skills.service.ts](../../src/skills/skills.service.ts) | Ghép kỹ năng với danh mục, giữ phần không khớp |
| Chấm điểm | [matching.service.ts](../../src/matching/matching.service.ts) và [matching/utils/](../../src/matching/utils/) | Công thức điểm, ưu tiên, nhận xét |
| Điều phối bất đồng bộ | [resume-queue.processor.ts](../../src/queues/processors/resume-queue.processor.ts) | Chạy hai việc `parse-resume` và `analyze-resume` |
| Giữ quota Gemini | [gemini-quota.service.ts](../../src/gemini/gemini-quota.service.ts) | Chống vượt hạn mức gọi Gemini |

## Bước 1: đọc CV

### Trích văn bản

| Định dạng | Thư viện |
|---|---|
| `.pdf` | `pdf-parse` (lớp `PDFParse`) |
| `.doc`, `.docx` | `mammoth` (`extractRawText`) |
| `.txt` | Đọc UTF-8 |
| Khác | Lỗi `Unsupported file type` |

Sau đó văn bản bị **từ chối** nếu: dưới 100 ký tự, trên 50.000 ký tự, hoặc dưới 50 từ (`validateExtractedText`). Văn bản hợp lệ được làm sạch (`cleanText`).

### Trích xuất bằng AI

`GeminiService.parseCV` gửi văn bản đã làm sạch cho Gemini với cấu hình `responseMimeType: application/json`, nhiệt độ và giới hạn token cố định trong code, rồi `JSON.parse` kết quả theo `ParsedDataDto`. Mô hình mặc định là `gemini-3.1-flash-lite`, đổi bằng `GEMINI_MODEL`. Mọi lần gọi đi qua bộ giữ quota và có retry với backoff khi gặp lỗi giới hạn tốc độ ([gemini.service.ts](../../src/gemini/gemini.service.ts)).

### Chuẩn hóa kỹ năng

Kỹ năng AI trả về được đưa qua `SkillsService.normalizeExtractedSkills`: kỹ năng khớp danh mục vào `normalizedSkills`, kỹ năng không khớp vào `unmappedSkills` (không gây lỗi). Hai trường này nằm trong `resumes.parsedData` ([resumes](../04-database/collections/resumes.md#cấu-trúc-parseddata)).

### Giữ quota Gemini

Mọi lần gọi Gemini phải "đặt chỗ" quota trong Redis bằng script Lua nguyên tử ([gemini-quota.service.ts](../../src/gemini/gemini-quota.service.ts)):

| Tham số | Mặc định | Nguồn |
|---|---|---|
| Giới hạn mỗi phút | 15 | `DEFAULT_GEMINI_RPM` |
| Ngân sách mỗi ngày | 450 | `DEFAULT_GEMINI_DAILY_BUDGET`, đổi bằng `GEMINI_DAILY_BUDGET` |
| Ngưỡng cảnh báo ngày | 70%, 85%, 95% | `DEFAULT_GEMINI_DAILY_ALERT_THRESHOLDS` |

Ba loại công việc dùng chung hạn mức, và mỗi loại **chừa** một phần cho loại ưu tiên hơn: một yêu cầu chỉ được cấp khi `đã dùng + đơn vị ≤ giới hạn − phần chừa`.

| Loại | Chừa mỗi phút | Chừa mỗi ngày | Ý nghĩa |
|---|---|---|---|
| `parse` (đọc CV) | 0 | 0 | Được dùng hết hạn mức: ưu tiên cao nhất |
| `chat-fallback` | 2 | 25 | Chat dự phòng nhường chỗ cho đọc CV |
| `summary` | 4 | 50 | Tóm tắt nhường chỗ nhiều nhất |

Khi bị từ chối, `GeminiQuotaDeniedException` mang `scope` (`minute` hoặc `day`) và `retryAfterMs`. Processor **không** coi đây là lỗi: nó lên lịch lại việc `parse-resume` với độ trễ đó (cộng nhiễu ngẫu nhiên `GEMINI_QUOTA_RETRY_JITTER_MS`) rồi kết thúc việc hiện tại thành công với `delayed: true`.

## Bước 2: chấm điểm

`MatchingService.calculateMatch(parsedData, job)` ([matching.service.ts](../../src/matching/matching.service.ts)):

```text
tổng = kỹ năng × 0,5 + kinh nghiệm × 0,3 + học vấn × 0,2     (giới hạn 0 đến 100, làm tròn)
```

Mỗi thành phần có điểm 0 đến 100. Hàm `ensureValidScore` thay giá trị không hợp lệ (NaN) bằng 0 trước khi nhân trọng số.

### Điểm kỹ năng (trọng số 50%)

1. Chuẩn hóa mỗi kỹ năng thành chữ hoa, bỏ ký tự đặc biệt trừ `+` và `#`, rồi quy về nhãn chuẩn bằng bản đồ bí danh của danh mục.
2. Một kỹ năng yêu cầu **được coi là khớp** nếu một kỹ năng của ứng viên bằng nó, hoặc chứa nó, hoặc được nó chứa (so chuỗi con, `isSkillMatch`).
3. Mỗi kỹ năng khớp được điểm theo mức thành thạo: `expert` 100, `advanced` 85, `intermediate` 70, `beginner` 50. Mức được suy từ **từ khóa trong chính chuỗi kỹ năng** của CV (ví dụ "expert NestJS", "advanced NestJS", "proficient"), và **mặc định là `intermediate`**.
4. Điểm kỹ năng = tổng điểm các kỹ năng khớp ÷ (số kỹ năng yêu cầu × 100).

### Điểm kinh nghiệm (trọng số 30%)

Theo số năm kinh nghiệm so với bảng của từng cấp bậc ([matching.constants.ts](../../src/matching/constants/matching.constants.ts)):

| Cấp bậc | Tối thiểu | Lý tưởng | Tối đa |
|---|---|---|---|
| `Internship` | 0 | 0 | 1 |
| `Junior` | 1 | 2 | 3 |
| `Mid` | 2 | 3 | 5 |
| `Senior` | 4 | 6 | 10 |
| `Lead` | 5 | 8 | 15 |
| `Manager` | 6 | 10 | 20 |

| Vùng | Điểm |
|---|---|
| Dưới mức tối thiểu | `năm ÷ tối thiểu × 50` (tối đa 50). `Internship` với 0 năm được 100 |
| Từ tối thiểu đến lý tưởng | Nội suy từ 50 đến 100 |
| Từ lý tưởng đến tối đa | 100 |
| Vượt tối đa | Giảm 2 điểm mỗi năm thừa, tối đa 15, sàn 85 |
| Cấp bậc không có trong bảng | 50 |

### Điểm học vấn (trọng số 20%)

Suy từ chuỗi `degree` của từng mục học vấn: có chứa `phd`/`tiến sĩ`, `master`/`thạc sĩ`, hoặc `bachelor`/`cử nhân`/`đại học`. Không có dữ liệu học vấn: 50. Điểm theo cấp bậc:

| Cấp bậc | Có tiến sĩ hoặc thạc sĩ | Có cử nhân | Không có bằng nào nhận ra |
|---|---|---|---|
| `Internship` | 100 | 100 | 75 |
| `Junior` | 100 | 100 | 60 |
| `Mid` | 100 | 90 | 50 |
| `Senior` | 100 | 80 | 40 |
| `Lead`, `Manager` | 100 | 70 | 30 |

### Mức ưu tiên và khuyến nghị

| Tổng điểm | `priority` | Khuyến nghị (`recommendation`) |
|---|---|---|
| ≥ 85 | `EXCELLENT` | `HIGHLY_RECOMMENDED` |
| ≥ 70 | `HIGH` | `RECOMMENDED` |
| ≥ 50 | `MEDIUM` | `CONSIDER` |
| còn lại | `LOW` | `NOT_RECOMMENDED` |

`strengths`, `weaknesses`, `summary` do các hàm sinh nhận xét từ kết quả trên ([insight-generator.util.ts](../../src/matching/utils/insight-generator.util.ts)). Đây là văn bản mẫu từ quy tắc, không phải văn bản do AI viết.

### Trạng thái tự động (đang tắt)

`determineAutoStatus` đề xuất `APPROVED` (tổng ≥ 85 và điểm kỹ năng ≥ 70), `REJECTED` (tổng < 30 và điểm kỹ năng < 30), còn lại `REVIEWING`. Giá trị này có trong kết quả, nhưng dòng gán `status` ở processor **đang bị comment**, nên điểm không tự đổi trạng thái hồ sơ.

## Xử lý dữ liệu thiếu

| Thiếu gì | Hành vi |
|---|---|
| Kỹ năng | Danh sách rỗng, điểm kỹ năng 0 nếu tin có yêu cầu |
| Số năm kinh nghiệm | Mặc định 0 |
| Học vấn | Điểm học vấn 50 (trung tính) |
| Tin không có kỹ năng yêu cầu | Điểm kỹ năng 0 (không chia cho 0) |
| Cấp bậc không nhận ra | Điểm kinh nghiệm và học vấn 50 |

## Known Limitation

**Khớp kỹ năng bằng chuỗi con tạo khớp sai.** Đã chạy hàm thật `calculateSkillsMatch` (2026-11-05, bản đồ bí danh rỗng):

| CV có | Tin yêu cầu | Kết quả | Nhận xét |
|---|---|---|---|
| `JavaScript` | `Java` | Khớp, 70 điểm | Hai ngôn ngữ khác nhau |
| `Java` | `JavaScript` | Khớp, 70 điểm | Như trên |
| `React` | `C` | Khớp, 70 điểm | Chuỗi `C` nằm trong `REACT` |
| `Go` | `MongoDB` | Khớp, 70 điểm | Chuỗi `GO` nằm trong `MONGODB` |
| `TypeScript` | `Script` | Khớp, 70 điểm | |
| `PostgreSQL` | `SQL` | Khớp, 70 điểm | Có thể chấp nhận |
| `Node.js` / `Python` | `Java` | Không khớp | Đúng |

Hệ quả: điểm kỹ năng có thể **bị thổi phồng** với các kỹ năng có tên ngắn hoặc là chuỗi con của kỹ năng khác. Trong vận hành, bản đồ bí danh đưa kỹ năng về nhãn chuẩn trước khi so, nhưng hai nhãn chuẩn khác nhau vẫn có thể là chuỗi con của nhau (như `Java` và `JavaScript`). Mức ảnh hưởng thực tế phụ thuộc danh mục; chưa đo trên dữ liệu thật.

**Điểm kỹ năng bị chặn ở mức thực tế 70%.** Vì mức thành thạo mặc định là `intermediate` (70) và chỉ nâng khi CV chứa các từ như "expert" hoặc "advanced" ngay trong chuỗi kỹ năng, một CV khớp mọi kỹ năng nhưng không có từ khóa mức độ chỉ đạt 70% điểm kỹ năng (đã xác nhận: khớp 1 trên 1 cho 70). Khi đó tổng điểm tối đa thực tế là `70 × 0,5 + 100 × 0,3 + 100 × 0,2 = 85`, đúng bằng ngưỡng `EXCELLENT`. Tức là chỉ CV hoàn hảo ở cả kinh nghiệm và học vấn mới đạt `EXCELLENT`. Đây là hệ quả của cách suy mức thành thạo, không phải ý định được ghi trong code.

**Khác:**

- Học vấn chỉ nhận ra qua từ khóa trong `degree` (tiếng Anh và tiếng Việt), bằng cấp ghi cách khác bị coi là không có bằng.
- `yearsOfExperience` do AI trích xuất (đường tải file) hoặc được `calculateYearsOfExperience` tính từ các mục kinh nghiệm của CV trực tuyến; không đường nào đối chiếu với nguồn bên ngoài.
- Việc đọc CV gửi **toàn bộ văn bản CV (dữ liệu cá nhân) cho Google Gemini**, một bên thứ ba. Chính sách lưu và sử dụng dữ liệu của bên đó nằm ngoài repository.
- **Nội dung CV có thể ghi vào log.** Processor gọi `this.logger.log('cleanedText:', cleanedText)` ở bước làm sạch ([resume-queue.processor.ts](../../src/queues/processors/resume-queue.processor.ts)). Văn bản đầy đủ của CV (họ tên, điện thoại, email, địa chỉ) có thể xuất hiện trong log ứng dụng. Đã đọc mã; chưa kiểm tra đầu ra log thực tế. Xem `08-security` (Phase 4).
- Một lần nộp bằng file có thể kích hoạt **phân tích hai lần** (xem [queues](queues.md#known-limitation)).
- Các hàm chấm điểm không có chuẩn đối chiếu độc lập (ground truth); chất lượng so với đánh giá của con người chưa được đo.

## Testing

| Thành phần | File test |
|---|---|
| `GeminiQuotaService` | [gemini-quota.service.spec.ts](../../src/gemini/gemini-quota.service.spec.ts) |
| `AIService` | [ai.service.spec.ts](../../src/ai/ai.service.spec.ts) |
| `GroqService` | [groq.service.spec.ts](../../src/groq/groq.service.spec.ts) |
| `ResumeQueueService` | [resume-queue.service.spec.ts](../../src/queues/services/resume-queue.service.spec.ts) |

**`src/matching/` và `src/cv-parser/` không có file test nào** (đã kiểm tra bằng `find ... -name '*.spec.ts'`). Toàn bộ công thức chấm điểm, khớp kỹ năng, điểm kinh nghiệm và học vấn, cùng việc trích văn bản và kiểm tra văn bản CV, chưa có kiểm thử đơn vị trong repository. Các kết quả thực nghiệm ở mục trên chỉ là phép chạy thủ công một lần, không phải test tự động. Processor `resume-queue.processor.ts` cũng không có test. Phần thống kê test nằm ở `10-testing` (Phase 4).

## Source References

[src/cv-parser/](../../src/cv-parser/), [src/matching/](../../src/matching/), [src/gemini/](../../src/gemini/), [src/ai/](../../src/ai/), [resume-queue.processor.ts](../../src/queues/processors/resume-queue.processor.ts).
