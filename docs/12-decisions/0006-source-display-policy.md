# ADR-0006: Chính sách hiển thị theo nguồn, mặc định hạn chế nhất

- **Trạng thái:** Accepted
- **Bằng chứng:** Commits `742e373` và `87e9f23` (2026-10-28); comment trong [job-ingestion.constants.ts](../../src/job-ingestion/job-ingestion.constants.ts): "Sources stored before displayPolicy existed get the most restrictive public policy"; [job-sources.data.ts](../../src/databases/seeds/data/job-sources.data.ts).

## Bối cảnh

Một số nguồn là trang tổng hợp bên thứ ba; không phải nội dung nào cũng nên lưu hoặc hiển thị toàn bộ.

## Quyết định

Mỗi nguồn có `displayPolicy`: `FULL`, `LINK_ONLY` hoặc `HIDDEN`. Nguồn chưa khai báo dùng `LINK_ONLY`. Seed đặt `FULL` cho bốn nguồn ATS và `LINK_ONLY` cho TopDev và ITviec. Với `LINK_ONLY` mô tả không được lưu.

## Hệ quả

Kiểm soát được phạm vi hiển thị theo nguồn. Đánh đổi: đổi sang `LINK_ONLY` xóa mô tả đã lưu; lý do pháp lý cụ thể không được ghi trong repository.

## Mức tin cậy của lý do

Quyết định và giá trị mặc định có bằng chứng; **lý do** pháp lý/thương mại là suy luận (`Proposed`).
