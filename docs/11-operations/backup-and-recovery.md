# Sao lưu, khôi phục và rollback

Tình trạng hiện có: repository chỉ chứa **lệnh sao lưu mẫu** trong `DEPLOYMENT.md`. Không có kịch bản tự động, lịch sao lưu, quy trình khôi phục đã kiểm chứng hay kiểm tra sao lưu. Mọi lệnh dưới đây `Chưa xác minh` trên hệ thống thật.

## Cần sao lưu gì

| Dữ liệu | Nơi | Tầm quan trọng |
|---|---|---|
| MongoDB | volume `mongodb_data` | Toàn bộ dữ liệu nghiệp vụ, **bắt buộc** |
| File tải lên (ảnh, logo) | volume `uploads` tại `/app/public/images` | Đường dẫn lưu trong MongoDB, nhưng file nằm riêng; thiếu file thì bản ghi trỏ vào chỗ trống |
| File CV | volume `cv_storage` tại `/app/storage` | CV ứng viên (dữ liệu cá nhân). Chỉ đọc qua `GET /resumes/:id/file`; **bắt buộc** sao lưu và giới hạn quyền đọc bản sao lưu |
| Redis | volume `redis_data` (AOF) | Hàng đợi chờ xử lý (kể cả lịch xóa tài khoản), quota, cache danh sách. Có thể tái tạo phần lớn, nhưng việc đang chờ sẽ mất |
| `.env.production` | VPS | Bí mật; lưu riêng và an toàn, **không** để chung với sao lưu dữ liệu |
| Cấu hình nginx, chứng chỉ | VPS | Ngoài repository |

Dữ liệu trong `CACHE_MANAGER` (token đặt lại mật khẩu, hủy xóa) nằm trong bộ nhớ nên **không thể sao lưu**.

## Lệnh sao lưu mẫu (từ `DEPLOYMENT.md`)

```bash
# MongoDB
docker compose -f docker-compose.prod.yml --env-file .env.production exec -T mongodb sh -c \
  'mongodump -u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin --archive --gzip' \
  > /var/backups/mongo-$(date +%F).archive.gz

# File tải lên
docker run --rm -v my-job-portal-be_uploads:/data -v /var/backups:/backup alpine \
  tar czf /backup/uploads-$(date +%F).tgz -C /data .

# File CV (private)
docker run --rm -v my-job-portal-be_cv_storage:/data -v /var/backups:/backup alpine \
  tar czf /backup/cv-storage-$(date +%F).tgz -C /data .
```

Tên volume phụ thuộc tên thư mục dự án (`<thư-mục>_uploads`); kiểm tra bằng `docker volume ls`. Hướng dẫn gốc nhắc chép bản sao lưu ra khỏi máy chủ; repository không có lịch chạy (cron) cho các lệnh này.

## Khôi phục (suy ra từ công cụ, chưa thử)

`mongodump --archive --gzip` ghép với `mongorestore` cùng tham số `--archive --gzip`:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production exec -T mongodb sh -c \
  'mongorestore -u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin --archive --gzip' \
  < /var/backups/mongo-YYYY-MM-DD.archive.gz
```

Lệnh này không có trong repository; nó là cách dùng chuẩn của công cụ và **cần thử trên môi trường kiểm tra** trước khi tin cậy. Cân nhắc cờ `--drop` tùy mục đích. Sau khi khôi phục file tải lên bằng cách giải nén tarball vào volume `uploads`.

Lưu ý sau khi khôi phục:

- Mongoose tạo lại index khi khởi động; kiểm tra TTL và unique ([database-overview](../04-database/database-overview.md#known-limitation-khai-báo-index-trùng-key-pattern)).
- Phiên (`sessions`) trong bản sao lưu có thể đã hết hạn.
- Dữ liệu của tài khoản đã xóa sau thời điểm sao lưu sẽ xuất hiện lại trong bản khôi phục; cần xử lý theo chính sách bảo vệ dữ liệu ([data-protection](../08-security/data-protection.md#sao-lưu)).

## Mục tiêu khôi phục

Repository **không định nghĩa** RPO (lượng dữ liệu chấp nhận mất) hay RTO (thời gian khôi phục). Với lịch sao lưu hằng ngày được gợi ý trong `DEPLOYMENT.md`, dữ liệu tối đa một ngày có thể mất; đây là hệ quả của lịch mẫu, không phải cam kết.

## Sự cố thường gặp

| Sự cố | Hậu quả | Cách giảm thiểu |
|---|---|---|
| Mất Redis | Mất hàng đợi chờ, quota, cache; lịch xóa tài khoản mất nên người đã yêu cầu xóa không bị xóa | AOF đã bật; sao lưu volume `redis_data`; yêu cầu người dùng gửi lại |
| Mất volume `uploads` | Bản ghi trỏ tới file không còn | Sao lưu volume định kỳ |
| Mất volume `cv_storage` | Hồ sơ không mở được file CV | Sao lưu volume định kỳ |
| Backend khởi động lại | Mất token trong bộ nhớ; việc đang chạy được BullMQ xử lý theo cơ chế của thư viện | Cho người dùng yêu cầu lại link |
| Lỗi khi đồng bộ nguồn | Dữ liệu tin ngoài không đổi; không mất | Kiểm tra `crawl_runs` |

## Rollback

Không có quy trình được ghi lại. Cách khả thi theo cấu trúc hiện tại (suy ra, chưa thử):

1. Ghi lại commit hiện tại, sao lưu MongoDB và `uploads` **trước** khi cập nhật.
2. Cập nhật bằng `git pull` và `up -d --build backend`.
3. Nếu lỗi: `git checkout <commit-trước>` và chạy lại `up -d --build backend`.

Giới hạn:

- Image luôn gắn tag `job-portal-be:latest`, bản cũ bị ghi đè; muốn quay lại nhanh cần tự gắn tag phiên bản trước khi cập nhật.
- Repository không có migration; thay đổi dữ liệu do phiên bản mới (ghi field mới, tạo index) không tự hoàn tác. Quay lại mã cũ thường chịu được field thừa, nhưng index mới vẫn còn.
- Khôi phục dữ liệu bằng bản sao lưu làm mất mọi thay đổi sau thời điểm đó.

## Future Improvement

Đề xuất, chưa có: kịch bản sao lưu có lịch và mã hóa, kiểm tra khôi phục định kỳ, tag image theo phiên bản, quy trình rollback có kiểm thử, và ghi RPO/RTO.
