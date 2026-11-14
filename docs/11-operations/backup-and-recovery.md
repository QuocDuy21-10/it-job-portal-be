# Sao lưu, khôi phục và rollback

Tình trạng hiện có: [`scripts/backup-mongo.sh`](../../scripts/backup-mongo.sh) sao lưu MongoDB + `uploads` + `cv_storage` hằng đêm (cron 03:00 trên VPS), giữ 7 ngày trên VPS và đẩy bản **mã hóa** lên Google Drive (rclone `crypt`, giữ 30 ngày). [`scripts/restore-mongo.sh`](../../scripts/restore-mongo.sh) khôi phục một lần chạy theo mốc thời gian. Cả hai đã chạy thử trên một compose kiểm tra cục bộ (sao lưu, xóa dữ liệu, tải từ remote mã hóa và khôi phục); trên VPS thật `Chưa xác minh` cho tới khi làm xong phần [Thiết lập một lần](#thiết-lập-một-lần-trên-vps).

## Cần sao lưu gì

| Dữ liệu | Nơi | Tầm quan trọng |
|---|---|---|
| MongoDB | volume `mongodb_data` | Toàn bộ dữ liệu nghiệp vụ, **bắt buộc** |
| File tải lên (ảnh, logo) | volume `uploads` tại `/app/public/images` | Đường dẫn lưu trong MongoDB, nhưng file nằm riêng; thiếu file thì bản ghi trỏ vào chỗ trống |
| File CV | volume `cv_storage` tại `/app/storage` | CV ứng viên (dữ liệu cá nhân). Chỉ đọc qua `GET /resumes/:id/file`; **bắt buộc** sao lưu và giới hạn quyền đọc bản sao lưu |
| Redis | volume `redis_data` (AOF) | Hàng đợi chờ xử lý (kể cả lịch xóa tài khoản), quota, cache danh sách. Có thể tái tạo phần lớn, nhưng việc đang chờ sẽ mất |
| `.env.production` | VPS | Bí mật; lưu riêng và an toàn, **không** để chung với sao lưu dữ liệu |
| `Caddyfile`, chứng chỉ TLS | Repository và volume `caddy_data` | `Caddyfile` có trong git; chứng chỉ tự cấp lại được nên không cần sao lưu |

Dữ liệu trong `CACHE_MANAGER` (token đặt lại mật khẩu, hủy xóa) nằm trong bộ nhớ nên **không thể sao lưu**.

## Sao lưu: `scripts/backup-mongo.sh`

Mỗi lần chạy dùng một mốc thời gian `TS` (`YYYY-MM-DD-HHMM`) và tạo trong `backups/`:

| File | Nội dung | Cách tạo |
|---|---|---|
| `mongo-$TS.archive.gz` | Toàn bộ MongoDB | `mongodump --archive --gzip` trong container `mongodb` |
| `uploads-$TS.tgz` | `/app/public/images` | `tar czf -` trong container `backend` |
| `cv-$TS.tgz` | `/app/storage` | `tar czf -` trong container `backend` |

- Dump là cách xuất dữ liệu nhất quán khi DB đang chạy; không chép thẳng thư mục `/data/db`.
- Mỗi lần chạy ghi **một dòng có thời gian** vào `backups/backup.log`, ví dụ `2026-11-15 03:00:12 +0700 OK 2026-11-15-0300 mongo=12M uploads=40M cv=8M`, sau đó `... OK ... offsite gdrive-crypt:job-portal-be`. Lỗi ghi `FAIL <TS> dump` hoặc `FAIL <TS> offsite`.
- Dump lỗi giữa chừng thì file dở dang bị xóa. Đẩy offsite lỗi thì bản trên VPS vẫn giữ và script thoát mã 1.
- Có `BACKUP_REMOTE` thì `rclone copy backups/ "$BACKUP_REMOTE"` (bỏ qua `backup.log`) rồi xóa trên remote các bản cũ hơn 30 ngày. Trên VPS giữ 7 ngày.

Kiểm tra nhanh: `tail backups/backup.log` và `rclone ls gdrive-crypt:job-portal-be`.

## Thiết lập một lần trên VPS

1. Cài rclone: `curl https://rclone.org/install.sh | sudo bash`.
2. VPS không có trình duyệt, nên trên **Mac** chạy `rclone authorize "drive"`, đăng nhập Google rồi chép đoạn token JSON in ra.
3. Trên VPS chạy `rclone config`:
   - `n` → tên `gdrive`, loại `drive`, scope `drive.file`, khi hỏi auto config trả lời `n` và dán token ở bước 2.
   - `n` → tên `gdrive-crypt`, loại `crypt`, remote `gdrive:job-portal-backups`, mã hóa tên file `standard`, đặt mật khẩu (và salt) mạnh.
4. **Lưu mật khẩu crypt (và salt) vào password manager.** Chúng chỉ nằm trong `~/.config/rclone/rclone.conf` trên VPS; mất VPS mà không có mật khẩu thì bản trên Drive không giải mã được. Nên lưu luôn một bản `rclone.conf`.
5. Chạy thử: `BACKUP_REMOTE=gdrive-crypt:job-portal-be ./scripts/backup-mongo.sh` rồi `rclone ls gdrive-crypt:job-portal-be`. Trên giao diện Google Drive chỉ thấy tên file đã mã hóa.
6. Sửa cron (`crontab -e`):

```cron
0 3 * * * BACKUP_REMOTE=gdrive-crypt:job-portal-be /opt/job-portal-be/scripts/backup-mongo.sh >/dev/null 2>>/opt/job-portal-be/backups/backup.log
```

## Khôi phục: `scripts/restore-mongo.sh <TS>`

```bash
ls backups/                                   # hoặc: rclone ls gdrive-crypt:job-portal-be
./scripts/restore-mongo.sh 2026-11-15-0300    # bản có trên VPS
BACKUP_REMOTE=gdrive-crypt:job-portal-be ./scripts/restore-mongo.sh 2026-11-15-0300   # VPS mới: tải về trước
```

- Script hỏi và chỉ chạy khi gõ `yes`, vì `mongorestore --drop` xóa từng collection trước khi nạp lại.
- Chỉ khôi phục database ứng dụng (`--nsInclude="$MONGO_INITDB_DATABASE.*"`), không ghi đè `admin`, nên VPS mới giữ mật khẩu root của chính nó.
- Sau đó giải nén `uploads` và `cv` vào container `backend`. Bản sao lưu cũ chỉ có Mongo thì bỏ qua phần file.
- Dựng lại trên VPS mới: clone repo, tạo `.env.production`, `./scripts/deploy.sh`, làm bước 1–3 của phần thiết lập (dùng lại mật khẩu crypt đã lưu), rồi chạy lệnh khôi phục ở trên.

Lưu ý sau khi khôi phục:

- Mongoose tạo lại index khi khởi động; kiểm tra TTL và unique ([database-overview](../04-database/database-overview.md#known-limitation-khai-báo-index-trùng-key-pattern)).
- Phiên (`sessions`) trong bản sao lưu có thể đã hết hạn.
- Dữ liệu của tài khoản đã xóa sau thời điểm sao lưu sẽ xuất hiện lại trong bản khôi phục; cần xử lý theo chính sách bảo vệ dữ liệu ([data-protection](../08-security/data-protection.md#sao-lưu)).

## Mục tiêu khôi phục

Repository **không định nghĩa** RPO (lượng dữ liệu chấp nhận mất) hay RTO (thời gian khôi phục). Với cron hằng đêm, dữ liệu tối đa một ngày có thể mất; đây là hệ quả của lịch, không phải cam kết.

## Sự cố thường gặp

| Sự cố | Hậu quả | Cách giảm thiểu |
|---|---|---|
| Mất Redis | Mất hàng đợi chờ, quota, cache; lịch xóa tài khoản mất nên người đã yêu cầu xóa không bị xóa | AOF đã bật; sao lưu volume `redis_data`; yêu cầu người dùng gửi lại |
| Mất volume `uploads` | Bản ghi trỏ tới file không còn | Sao lưu volume định kỳ |
| Mất volume `cv_storage` | Hồ sơ không mở được file CV | Sao lưu volume định kỳ |
| Backend khởi động lại | Mất token trong bộ nhớ; việc đang chạy được BullMQ xử lý theo cơ chế của thư viện | Cho người dùng yêu cầu lại link |
| Lỗi khi đồng bộ nguồn | Dữ liệu tin ngoài không đổi; không mất | Kiểm tra `crawl_runs` |

## Rollback

Xem [Deploy và rollback](rollback.md). Luôn sao lưu MongoDB và `uploads` trước khi deploy; khôi phục bản sao lưu là biện pháp cuối vì mất dữ liệu ghi sau thời điểm đó.

## Future Improvement

Đề xuất, chưa có: cảnh báo khi `backup.log` có `FAIL` hoặc không có dòng mới quá 1 ngày, kiểm tra khôi phục định kỳ, sao lưu `redis_data`, và ghi RPO/RTO.
