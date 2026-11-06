# Tích hợp nguồn tin tuyển dụng ngoài

Bốn nhà cung cấp, mỗi nhà một adapter. Cách đồng bộ, vòng đời, biện pháp lịch sự và an toàn: [job-ingestion](../03-modules/job-ingestion.md).

## Nhà cung cấp

| Provider | Hình thức | Điểm cuối trong code | Dữ liệu |
|---|---|---|---|
| `GREENHOUSE` | API JSON công khai theo bảng tuyển dụng | `boards-api.greenhouse.io/v1/boards/<token>/jobs?content=true` | Danh sách kèm nội dung trong một lần gọi |
| `LEVER` | API JSON công khai | `api.lever.co/v0/postings/<token>?mode=json` | Danh sách tin |
| `TOPDEV` | Sitemap rồi trang chi tiết (JSON-LD `JobPosting`) | `topdev.vn/sitemap-jobs.xml` | Từng trang tin |
| `ITVIEC` | Sitemap rồi trang chi tiết (JSON-LD `JobPosting`) | `itviec.com` (sitemap chỉ mục) | Từng trang tin |

## Nguồn được seed

[job-sources.data.ts](../../src/databases/seeds/data/job-sources.data.ts) khai báo sáu nguồn, tất cả `enabled`:

| `key` | Provider | `displayPolicy` |
|---|---|---|
| `greenhouse-axon` | `GREENHOUSE` | `FULL` |
| `greenhouse-thoughtworks` | `GREENHOUSE` | `FULL` |
| `greenhouse-agoda` | `GREENHOUSE` | `FULL` |
| `lever-ninjavan` | `LEVER` | `FULL` |
| `topdev` | `TOPDEV` | `LINK_ONLY` |
| `itviec` | `ITVIEC` | `LINK_ONLY` |

Chính sách mặc định phản ánh cách tiếp cận thận trọng với hai trang tổng hợp: chỉ giữ liên kết, không lưu và không trả mô tả. Lý do pháp lý hay thương mại của lựa chọn này không được ghi trong repository.

## Rủi ro và điều chưa xác minh

| Hạng mục | Trạng thái |
|---|---|
| Điều khoản sử dụng của TopDev, ITviec | `Chưa xác minh`; code không đọc `robots.txt` |
| Ổn định cấu trúc trang | Adapter phụ thuộc JSON-LD và sitemap của bên thứ ba; thay đổi bên đó làm đồng bộ lỗi hoặc `NO_STRUCTURED_DATA` |
| Bị chặn | Dừng sớm ở 403, 429, captcha, trạng thái `PARTIAL` |
| Lương ITviec | Nằm sau đăng nhập; chỉ có đoạn gợi ý |
| Cảnh báo lỗi | Chỉ là dòng log `[ingestion-alert]` |

## Thêm nguồn mới

Không có API tạo nguồn ([job-sources](../05-api/endpoints/job-sources.md)). Cách hiện có: thêm vào dữ liệu seed hoặc ghi trực tiếp vào collection `job_sources`, với `provider` thuộc bốn giá trị trên và `boardToken` chỉ gồm chữ thường, số và gạch ngang. Thêm provider mới cần viết adapter và đăng ký trong `SourceSyncCoordinator`.
