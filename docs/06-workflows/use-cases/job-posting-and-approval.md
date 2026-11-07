# Use case: đăng tin và duyệt tin

## Actor và mục đích

| Actor | Mục đích |
|---|---|
| HR | Đăng, sửa, xóa tin của công ty mình |
| Quản trị viên | Đăng tin, duyệt hoặc từ chối tin, xem mọi tin |
| Khách và ứng viên | Xem tin đã duyệt, còn hạn |

## Precondition và postcondition

| | Giá trị |
|---|---|
| Precondition | Người đăng có vai trò `HR` hoặc `SUPER ADMIN`; công ty tồn tại; kỹ năng nằm trong danh mục; địa điểm hợp lệ |
| Postcondition tạo tin | Tin `approvalStatus = PENDING`, `isActive` theo yêu cầu; chưa hiển thị công khai |
| Postcondition duyệt | `approvalStatus` là `APPROVED` hoặc `REJECTED`, ghi người duyệt và thời điểm |

## Luồng chính

1. HR gửi `POST /jobs` (tên, kỹ năng, công ty, địa điểm, lương, số lượng, cấp bậc, hình thức, mô tả, ngày bắt đầu và kết thúc, `isActive`).
2. Hệ thống chuẩn hóa kỹ năng theo danh mục, tạo snapshot công ty, suy ra địa điểm chuẩn hóa, lưu tin `PENDING`, xóa cache liên quan, đưa việc thông báo người theo dõi công ty vào hàng đợi.
3. Quản trị viên xem tin (`GET /jobs` thấy mọi trạng thái) và gửi `PATCH /jobs/:id/approve` với `APPROVED` hoặc `REJECTED` kèm ghi chú tùy chọn.
4. Tin `APPROVED`, `isActive` và còn hạn hiển thị cho công chúng và vào tìm kiếm hợp nhất.
5. Khi quá `endDate`, cron mỗi giờ tắt tin và gửi email cho người tạo.

## Luồng thay thế

| Luồng | Mô tả |
|---|---|
| Từ chối | `REJECTED` kèm `approvalNote` (tối đa 500 ký tự); tin không hiển thị công khai, HR vẫn thấy |
| Đổi quyết định | Quản trị viên duyệt lại giữa `APPROVED` và `REJECTED` |
| HR sửa tin đã duyệt | `PATCH /jobs/:id`; vẫn `APPROVED`, không qua duyệt lại |
| Xóa tin | Xóa mềm một hoặc hàng loạt |

## Luồng lỗi

| Tình huống | Kết quả |
|---|---|
| Kỹ năng không có trong danh mục | `400` "Unknown skills: ..." |
| Địa điểm không hợp lệ | `400` |
| `endDate` không sau `startDate` | `400` (validator `IsAfter`) |
| HR thao tác tin công ty khác | Bị từ chối theo kiểm tra sở hữu |
| Duyệt bởi vai trò khác | `403` |

## Quy tắc nghiệp vụ

[business-rules](../../01-product/business-rules.md#tin-tuyển-dụng), [job-approval](../state-machines/job-approval.md), [jobs](../../03-modules/jobs.md).

## Edge case

- Email "tin mới" cho người theo dõi công ty được gửi lúc tạo tin, trước khi duyệt; tin bị từ chối vẫn có thể đã được báo ([jobs](../../03-modules/jobs.md#known-limitation)).
- Email gợi ý hằng tuần không lọc theo trạng thái duyệt ([queues](../../03-modules/queues.md#job-recommendation)).
- Tin hết hạn biến mất khỏi công khai ngay khi quá `endDate`, kể cả trước khi cron chạy, vì bộ lọc hiển thị cũng kiểm tra `endDate`.
- Snapshot công ty trong tin không đổi khi công ty đổi tên.
