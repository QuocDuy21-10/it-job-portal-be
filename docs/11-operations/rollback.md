# Deploy và rollback

Quy trình cho một VPS chạy `docker-compose.prod.yml`. Mỗi bản build được gắn tag theo commit (`IMAGE_TAG`), nên rollback chỉ là chạy lại image cũ, không cần build lại.

## Chuẩn bị (một lần)

Thêm dòng `IMAGE_TAG=` vào `.env.production`. Compose đọc biến này cho `image: job-portal-be:${IMAGE_TAG:-latest}`; để trong file (thay vì export trong shell) thì mọi lần `up` hay restart sau đều dùng đúng tag.

## Deploy

1. Ghi lại tag đang chạy:

   ```bash
   grep '^IMAGE_TAG=' .env.production
   docker image ls job-portal-be
   ```

2. Sao lưu MongoDB theo [backup-and-recovery](backup-and-recovery.md).
3. Lấy mã mới và đặt tag:

   ```bash
   git pull
   NEW_TAG=$(git rev-parse --short HEAD)
   sed -i "s/^IMAGE_TAG=.*/IMAGE_TAG=${NEW_TAG}/" .env.production
   docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build backend
   ```

4. Chờ readiness:

   ```bash
   until curl -fs http://127.0.0.1:8081/api/v1/health/ready > /dev/null; do sleep 5; done; echo ready
   ```

5. Theo dõi 30 phút: không có alert `critical` ([alerts](alerts.md)), log backend không có lỗi mới.

## Khi nào rollback

- Có alert `critical` (`BackendDown`, `DependencyDown` do bản mới, `HighErrorRate`) trong 30 phút sau deploy.
- Lỗi nghiệp vụ đã xác nhận do bản mới, chưa sửa nhanh được.

## Rollback

```bash
sed -i "s/^IMAGE_TAG=.*/IMAGE_TAG=<tag-cũ>/" .env.production
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --no-build backend
until curl -fs http://127.0.0.1:8081/api/v1/health/ready > /dev/null; do sleep 5; done; echo ready
```

Không cần `git checkout`: image cũ vẫn còn trên máy. Sau khi ổn định, `git checkout <commit-cũ>` nếu muốn mã nguồn trên VPS khớp với image đang chạy.

## Dọn image

`docker image prune -f` chỉ xoá image không có tag, nên các bản đã gắn tag vẫn còn. Giữ 3 tag gần nhất, xoá tay tag cũ hơn:

```bash
docker image ls job-portal-be
docker image rm job-portal-be:<tag-cũ-hơn>
```

## Giới hạn

- Repository không có migration. Field và index do bản mới tạo không tự mất khi quay về; mã cũ thường chịu được field thừa, nhưng index mới vẫn còn.
- Khôi phục từ bản sao lưu là biện pháp cuối và mất mọi dữ liệu ghi sau thời điểm sao lưu.
- Image build trên chính VPS; nếu bản cũ đã bị xoá, phải `git checkout` rồi build lại.
