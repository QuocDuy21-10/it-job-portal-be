# Use case: nộp hồ sơ ứng tuyển và xử lý hồ sơ

## Actor và mục đích

| Actor | Mục đích |
|---|---|
| Ứng viên | Nộp CV cho một tin và xem kết quả phân tích |
| HR | Xem, đánh giá, đổi trạng thái hồ sơ của công ty mình |
| Quản trị viên | Xem và xử lý mọi hồ sơ |
| Hệ thống | Đọc CV, chấm điểm, gửi thông báo |

## Precondition và postcondition

| | Giá trị |
|---|---|
| Precondition | Đã đăng nhập; tin tồn tại (và, với đường file, đang hoạt động khi phân tích); chưa nộp cho tin này; với CV trực tuyến, CV đang bật |
| Postcondition | Có bản ghi `resumes` `PENDING`; đã hoặc sẽ có điểm và mức ưu tiên; HR nhận thông báo |

## Luồng chính A: CV trực tuyến

Ứng viên đã tạo CV (xem [cv-management](cv-management.md)) gửi `POST /resumes/cv-online`. Hệ thống chấm điểm ngay và trả kết quả. Sơ đồ: [cv-processing](../sequences/cv-processing.md#đường-1-cv-trực-tuyến-đồng-bộ).

## Luồng chính B: tải file CV

Ứng viên gửi `POST /resumes/upload-cv` (file `pdf`, `doc`, `docx` hoặc `txt`, tối đa 5 MB, và `jobId`). Hệ thống lưu hồ sơ, đưa việc đọc và phân tích vào hàng đợi, trả `processing`. Kết quả xem qua `GET /resumes/:id/analysis`. Sơ đồ: [cv-processing](../sequences/cv-processing.md#đường-2-tải-file-cv-bất-đồng-bộ).

## Xử lý bởi nhà tuyển dụng

1. HR hoặc quản trị viên xem danh sách (`GET /resumes`, HR chỉ thấy công ty mình), lọc và sắp xếp theo điểm hoặc mức ưu tiên.
2. Đổi trạng thái qua `PATCH /resumes/:id` (`PENDING`, `REVIEWING`, `INTERVIEWING`, `APPROVED`, `REJECTED`), có thể ghi `hrNotes`.
3. Mỗi lần đổi ghi `histories` và gửi thông báo, email cho ứng viên ([resume-status](../state-machines/resume-status.md)).
4. Có thể gọi `reparse` hoặc `reanalyze` để xử lý lại.

## Luồng lỗi

| Tình huống | Kết quả |
|---|---|
| Nộp trùng cho cùng tin | Từ chối |
| CV trực tuyến bị tắt | Từ chối "Your CV profile is inactive" |
| File không hợp lệ hoặc quá lớn | `400` |
| Văn bản CV quá ngắn, quá dài, ít từ | Ghi `parseError`, retry theo hàng đợi |
| Hết quota Gemini | Hoãn việc đọc, không báo lỗi cho ứng viên |
| HR thao tác hồ sơ công ty khác | `403` |
| Vượt giới hạn nộp | `429` (10 lần mỗi 5 phút cho CV trực tuyến, 20 lần mỗi giờ cho file) |

## Quy tắc nghiệp vụ

Điểm 50% kỹ năng, 30% kinh nghiệm, 20% học vấn; ngưỡng ưu tiên 85, 70, 50. Chi tiết và giới hạn: [cv-parsing-and-matching](../../03-modules/cv-parsing-and-matching.md). Điểm chỉ ảnh hưởng `priority`, không tự đổi `status`.

## Edge case

- Điểm có thể bị thổi phồng bởi khớp kỹ năng bằng chuỗi con (`Java` và `JavaScript`): [known limitation](../../03-modules/cv-parsing-and-matching.md#known-limitation).
- Phân tích có thể chạy hai lần cho đường file.
- HR không xem được `GET /resumes/:id/analysis` (chỉ chủ hồ sơ hoặc quản trị viên).
- Bản sao CV tại thời điểm nộp không đổi khi ứng viên sửa CV sau đó.
