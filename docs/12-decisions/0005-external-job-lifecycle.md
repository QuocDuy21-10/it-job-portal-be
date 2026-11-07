# ADR-0005: Vòng đời tin ngoài ACTIVE, STALE, CLOSED kèm chống đóng nhầm

- **Trạng thái:** Accepted
- **Bằng chứng:** Commit `20c1326` "add job lifecycle rules for fetch planning and stale handling" và `595e9c3` "run syncs through a coordinator with ACTIVE/STALE/CLOSED lifecycle"; comment trong [job-ingestion.constants.ts](../../src/job-ingestion/job-ingestion.constants.ts) và [sync-status.enum.ts](../../src/job-ingestion/enums/sync-status.enum.ts).

## Bối cảnh

Nguồn ngoài có thể trả danh sách thiếu do lỗi tạm thời hoặc bị chặn; đóng tin ngay khi vắng mặt sẽ làm mất hàng loạt tin.

## Quyết định

Tin vắng mặt trước hết thành `STALE` (vẫn hiển thị), chỉ đóng sau thời gian ân hạn 5 giờ. Danh sách co dưới 50% mức nền (hoặc rỗng) bị coi là `SUSPECT` và không đóng tin nào vì vắng mặt. Quy tắc nằm trong `JobLifecycleService` dạng hàm thuần để kiểm thử.

## Hệ quả

Giảm rủi ro mất dữ liệu khi nguồn lỗi; có thể có tin đã gỡ vẫn hiển thị vài giờ. Cảnh báo lỗi chỉ là dòng log ([job-ingestion](../03-modules/job-ingestion.md#known-limitation)).

## Mức tin cậy của lý do

Có bằng chứng qua commit và comment (ví dụ "Slightly under the 6h cron so the next scheduled run closes the job despite jitter").
