# Module Statistics

## Overview

Tính số liệu tổng hợp cho hai dashboard: quản trị viên (toàn hệ thống) và nhà tuyển dụng (theo công ty), cùng số liệu công khai cho trang chủ. Kết quả được cache ngắn hạn.

## Responsibilities

- Dashboard quản trị: số tin 24 giờ qua, tin đã duyệt đang mở, tin chờ duyệt, số công ty, số công ty đang tuyển, số người dùng, xu hướng 7 ngày của tin và hồ sơ, kỹ năng được cần nhiều nhất, và tình trạng xử lý hồ sơ (tỉ lệ đã đọc, đã phân tích).
- Dashboard HR: tổng hồ sơ, hồ sơ 24 giờ qua, phân bố trạng thái hồ sơ, top tin theo số hồ sơ, tỉ lệ phản hồi, thời gian phản hồi đầu tiên trung bình, điểm phù hợp trung bình, tin hết hạn.
- Danh sách công ty tuyển nhiều nhất cho trang chủ (cache riêng).
- Số liệu công khai trang chủ: tin đang hiển thị (nội bộ + crawl), tin mới 7 ngày, công ty đang tuyển (chỉ tin nội bộ), số ứng viên chưa xóa.

Danh sách trên suy từ tên các hàm trong [statistics.service.ts](../../src/statistics/statistics.service.ts); định nghĩa chính xác từng chỉ số (ví dụ "tỉ lệ phản hồi") chưa được kiểm tra. Trạng thái: `Chưa xác minh`.

## Architecture

| Thành phần | File |
|---|---|
| Controller (3 route, `/api/v1/statistics`) | [statistics.controller.ts](../../src/statistics/statistics.controller.ts) |
| Service tính số liệu | [statistics.service.ts](../../src/statistics/statistics.service.ts) |
| Cache | [statistics-cache.service.ts](../../src/statistics/statistics-cache.service.ts) |
| Hằng số | [statistics.constants.ts](../../src/statistics/constants/statistics.constants.ts) |

## Dependencies

Không import module nghiệp vụ nào. Module tự đăng ký schema của các collection cần đọc (`MongooseModule.forFeature`) và truy vấn trực tiếp; số liệu công khai dùng lại bộ lọc của `job-search` (hàm thuần, không import module). Nhiều module khác import `statistics` để xóa cache khi dữ liệu đổi (`jobs`, `companies`, `resumes`, `queues`).

## Business Rules

| Dashboard | Route | Quyền | Cache (TTL) | Khóa |
|---|---|---|---|---|
| Công khai (trang chủ) | `GET /statistics/public` | công khai | 15 phút | `homepage:public-stats` |
| Quản trị | `GET /statistics/admin-dashboard` | `SUPER ADMIN` | 15 phút | `dashboard:admin` |
| HR | `GET /statistics/hr-dashboard` | `HR` (quản trị viên **không** gọi được) | 3 phút | `dashboard:hr:<companyId>` |
| Top công ty tuyển dụng | trong `GET /companies/top-hiring` | công khai | 5 phút | `homepage:top-hiring-companies:<limit>` |

Giới hạn: top kỹ năng 10, top tin 5, top công ty tuyển dụng 20 ([statistics.constants.ts](../../src/statistics/constants/statistics.constants.ts)).

Khi dữ liệu liên quan đổi, các service khác gọi `clearScopedDashboardCaches(companyId)` để xóa cache của công ty tương ứng và cache quản trị.

## Data Model

Chỉ đọc từ `users`, `companies`, `jobs`, `resumes`, `externaljobs`, `jobsources`. Không có collection riêng.

## API

`GET /statistics/public`, `GET /statistics/admin-dashboard`, `GET /statistics/hr-dashboard`. Chi tiết ở `05-api/endpoints/statistics.md` (Phase 3).

## Known Limitation

- `GET /statistics/hr-dashboard` chỉ cho vai trò `HR`, nên quản trị viên không xem được dashboard của một công ty cụ thể qua route này.
- Số liệu "chat AI" của quản trị viên nằm ở `GET /chat/admin/usage/*`, không thuộc module này.

## Testing

1 file test (`statistics.service.spec.ts`).

## Source References

[src/statistics/](../../src/statistics/).
