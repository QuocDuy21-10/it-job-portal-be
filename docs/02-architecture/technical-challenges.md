# Những bài toán kỹ thuật chính và cách giải

Tài liệu này chọn các bài toán khó nhất của DevLink Backend, nêu cách code giải quyết (kèm bằng chứng) và đánh đổi. Không lặp lại chi tiết: mỗi mục dẫn tới tài liệu đầy đủ. Mức độ "đã giải quyết" chỉ dựa trên đọc mã và kết quả thực nghiệm có ghi chú, không dựa trên số liệu vận hành thật.

## 1. Đồng bộ tin từ nhiều nguồn mà không đóng nhầm hàng loạt

**Khó ở đâu.** Bốn nhà cung cấp, hai kiểu (API công khai và trang tổng hợp qua sitemap), mỗi nơi có thể trả danh sách thiếu khi lỗi tạm thời hoặc bị chặn. Nếu coi "vắng mặt" là "đã gỡ" thì một sự cố ngắn xóa sạch tin.

**Cách giải.**

- Vòng đời `ACTIVE`, `STALE`, `CLOSED` với thời gian ân hạn 5 giờ, và chỉ đóng khi vắng trong một lần liệt kê **đầy đủ**.
- Phát hiện danh sách co bất thường (dưới 50% mức nền, hoặc rỗng) và coi là `SUSPECT`: không đóng tin nào.
- Chỉ tải chi tiết tin cần tải (mới, xuất hiện lại, `STALE`, hết hạn làm mới), có trần 150 trang mỗi lần và nghỉ giữa các request; dừng khi gặp 403, 429, captcha.
- Quy tắc là hàm thuần (`JobLifecycleService`), kiểm thử riêng (201 test cho cả module).
- Loại trùng bằng `jobId = sync-<key>` và `upsert` theo khóa tự nhiên.

**Đánh đổi.** Cảnh báo lỗi chỉ là dòng log; tính hợp pháp khi thu thập TopDev và ITviec chưa xác minh. Chi tiết: [job-ingestion](../03-modules/job-ingestion.md), [external-job-lifecycle](../06-workflows/state-machines/external-job-lifecycle.md), [ADR-0005](../12-decisions/0005-external-job-lifecycle.md).

## 2. Xử lý CV bằng AI mà không vượt hạn mức nhà cung cấp

**Khó ở đâu.** Đọc CV bằng Gemini chậm, và hạn mức thấp (15 mỗi phút, 450 mỗi ngày theo mặc định) dùng chung với chat dự phòng và tóm tắt.

**Cách giải.**

- Đưa việc vào hàng đợi với `limiter` 15 mỗi 60 giây và `concurrency` 1; phản hồi `processing` ngay.
- Bộ giữ quota nguyên tử trong Redis, ưu tiên đọc CV: tóm tắt và chat dự phòng phải chừa chỗ.
- Hết quota thì **lên lịch lại** việc có độ trễ và nhiễu ngẫu nhiên, thay vì báo lỗi.
- Điểm số tính bằng code tất định nên không tốn thêm lượt gọi.

**Đánh đổi.** Độ trễ có thể lớn khi quota cạn; phân tích có thể chạy hai lần; cache kết quả đọc CV gần như vô dụng vì sai đơn vị TTL; khớp kỹ năng bằng chuỗi con tạo điểm sai. Chi tiết: [cv-parsing-and-matching](../03-modules/cv-parsing-and-matching.md), [cv-processing](../06-workflows/sequences/cv-processing.md), [ADR-0003](../12-decisions/0003-bullmq-background-processing.md), [ADR-0004](../12-decisions/0004-hybrid-matching.md).

## 3. Tìm kiếm trên hai collection khác cấu trúc bằng một API

**Khó ở đâu.** Tin nội bộ có lương dạng số, hình thức làm việc, trạng thái duyệt; tin ngoài có lương dạng văn bản, cờ từ xa, chính sách hiển thị theo nguồn. Cần phân trang, sắp xếp và tổng số thống nhất.

**Cách giải.** Một pipeline aggregation: chiếu mỗi phía về cùng dạng, ghép bằng `$unionWith`, `$sort` rồi `$facet` để lấy trang và tổng. Bộ lọc không áp dụng được cho tin ngoài (lương, hình thức khác `Remote`) loại phía ngoài một cách tường minh; tin không có lương luôn xuống cuối khi sắp theo lương. Logic dựng pipeline tách thành hàm thuần để test.

**Đánh đổi.** Không cache, tìm từ khóa bằng regex không tận dụng index, `$sort` sau `$unionWith` không dùng index, và việc loại im lặng tin ngoài có thể gây bất ngờ. Chi tiết: [job-search](../03-modules/job-search.md), [unified-job-search](../06-workflows/sequences/unified-job-search.md).

## 4. Chat AI an toàn, rẻ và có kiểm soát

**Khó ở đâu.** Mô hình có thể bị dẫn dắt (prompt injection), bịa tin tuyển dụng, trả lời lạc đề, hoặc tiêu tốn chi phí không giới hạn.

**Cách giải.** Nhiều lớp: lọc đầu vào bằng regex song ngữ, giới hạn lượt theo ngày bằng đặt chỗ nguyên tử và hoàn lại khi lỗi, ngữ cảnh dựng từ dữ liệu thật theo ý định, chỉ chấp nhận mã tin nằm trong ngữ cảnh, hành động thay đổi dữ liệu phải được người dùng xác nhận, làm sạch đầu ra và lọc chủ đề bằng mô hình, cache câu hỏi thường gặp không tiêu hạn mức, nhật ký chi phí từng lượt, dự phòng giữa hai nhà cung cấp.

**Đánh đổi.** Lọc đầu vào dựa trên mẫu nên có thể bị vượt qua, bộ lọc chủ đề fail-open, email người dùng nằm trong prompt. Chi tiết: [ai-chat](../03-modules/ai-chat.md), [ai-chat-streaming](../06-workflows/sequences/ai-chat-streaming.md), [ADR-0007](../12-decisions/0007-reservation-based-chat-quota.md), [ADR-0009](../12-decisions/0009-confirmed-tool-actions.md).

## 5. Cache danh sách đúng theo vai trò và có vô hiệu hóa

**Khó ở đâu.** Cùng một endpoint trả kết quả khác nhau cho khách, HR của từng công ty và quản trị viên; thay đổi dữ liệu phải làm cache liên quan hết hiệu lực.

**Cách giải.** `ListCacheService` đưa phạm vi vai trò vào khóa, gắn thẻ cho mỗi mục và vô hiệu hóa theo thẻ khi ghi; Redis lỗi thì vẫn phục vụ từ database. Chi tiết: [caching-strategy](../02-architecture/caching-strategy.md), [ADR-0008](../12-decisions/0008-redis-tagged-list-cache.md).

**Điểm cần cẩn trọng.** Lớp `CACHE_MANAGER` trông giống cache Redis nhưng chạy trong bộ nhớ; các thực nghiệm kiểm chứng điều này là một phần giá trị của tài liệu.

## 6. Phiên nhiều thiết bị với refresh token xoay vòng

**Khó ở đâu.** Cho phép đăng nhập nhiều thiết bị, thu hồi từng phiên, khóa tài khoản có hiệu lực ngay, mà không lưu token thô.

**Cách giải.** Lưu HMAC của refresh token, tối đa 5 phiên, xoay vòng một lần dùng, và kiểm tra trạng thái tài khoản mỗi request. **Đánh đổi:** truy vấn người dùng mỗi request; làm mới không có giao dịch và không phát hiện tái sử dụng. Chi tiết: [auth-and-sessions](../03-modules/auth-and-sessions.md), [refresh-token](../06-workflows/sequences/refresh-token.md).

## Điều tài liệu rút ra về chất lượng

Các bài toán trên được giải khá cẩn thận ở phần quy tắc nghiệp vụ (lifecycle, quota, guardrail), còn các điểm yếu tập trung ở **ranh giới giữa các thành phần**: kiểu `Mixed` do khai báo `Types.ObjectId`, index khai báo trùng, đơn vị TTL, hàng đợi thiếu `jobId`, phân quyền không đồng đều giữa các route, và dữ liệu cá nhân còn sót khi xóa. Danh sách đầy đủ: [documentation-coverage](../14-reference/documentation-coverage.md#phát-hiện-chính-từ-việc-đối-chiếu-code).
