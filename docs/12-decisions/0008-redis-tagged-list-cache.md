# ADR-0008: Cache danh sách trong Redis có thẻ và vô hiệu hóa theo thẻ

- **Trạng thái:** Accepted
- **Bằng chứng:** Commit `a180c00` (2026-06-14) "add Redis-backed list cache for paginated endpoints" kèm script đo hiệu năng [performance-benchmark.ts](../../src/scripts/performance-benchmark.ts); [list-cache.service.ts](../../src/redis/list-cache.service.ts).

## Bối cảnh

Danh sách tin và công ty được gọi nhiều và có bộ lọc đa dạng.

## Quyết định

`ListCacheService` lưu kết quả trong Redis với khóa băm ổn định, gắn thẻ và xóa theo thẻ khi dữ liệu đổi; TTL 60 giây (tin) và 3 phút (công ty); lỗi Redis thì gọi thẳng nguồn dữ liệu.

## Hệ quả

Giảm tải database, độ lệch tối đa bị chặn bởi TTL. Đánh đổi: thêm trạng thái cần giữ nhất quán. Lưu ý lớp cache còn lại `CACHE_MANAGER` thực tế chạy trong bộ nhớ ([caching-strategy](../02-architecture/caching-strategy.md)); quyết định này chỉ nói về lớp Redis có thẻ.

## Mức tin cậy của lý do

Có bằng chứng qua commit, kèm benchmark.
