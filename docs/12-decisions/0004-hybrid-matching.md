# ADR-0004: AI chỉ trích xuất, điểm phù hợp tính bằng code tất định

- **Trạng thái:** Accepted
- **Bằng chứng:** [AGENTS.md](../../AGENTS.md) ("Treat AI as assistive only: models extract or generate content, but backend services own deterministic rules and final behavior"); [matching.service.ts](../../src/matching/matching.service.ts) không import nhà cung cấp AI.

## Bối cảnh

Cần điểm số giải thích được, lặp lại được và không phụ thuộc mô hình.

## Quyết định

Gemini chỉ đọc CV thành dữ liệu có cấu trúc. Điểm 0 đến 100 do `MatchingService` tính theo công thức cố định (kỹ năng 50%, kinh nghiệm 30%, học vấn 20%), mức ưu tiên theo ngưỡng. Nhận xét điểm mạnh yếu sinh từ quy tắc.

## Hệ quả

Cùng đầu vào cho cùng điểm, không tốn token cho chấm điểm, dễ kiểm thử. Đánh đổi: chất lượng phụ thuộc quy tắc; khớp kỹ năng bằng chuỗi con tạo khớp sai và không có test cho `matching` ([cv-parsing-and-matching](../03-modules/cv-parsing-and-matching.md#known-limitation)).

## Mức tin cậy của lý do

Nguyên tắc nêu tường minh ở `AGENTS.md` và thể hiện trong code.
