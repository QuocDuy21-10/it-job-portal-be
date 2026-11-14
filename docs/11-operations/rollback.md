# Deploy và rollback

Quy trình cho một VPS chạy `docker-compose.prod.yml`. Mỗi bản build do CI gắn tag (`X.Y.Z` và `sha-<short>`) trên Docker Hub ([ci-cd](../09-infrastructure/ci-cd.md)), nên rollback chỉ là kéo và chạy lại image cũ, không cần build lại.

## Chuẩn bị (một lần)

Đặt `DOCKERHUB_USER`, `IMAGE_NAME`, `IMAGE_TAG` trong `.env.production`. Compose đọc chúng cho `image: ${DOCKERHUB_USER}/${IMAGE_NAME}:${IMAGE_TAG}`; để trong file (thay vì export trong shell) thì mọi lần `up` hay restart sau đều dùng đúng tag. Backend không publish cổng ra host, nên kiểm tra readiness qua domain: `https://<API_DOMAIN>/api/v1/health/ready`.

## Deploy

1. Ghi lại tag đang chạy:

   ```bash
   grep '^IMAGE_TAG=' .env.production
   docker image ls
   ```

2. Sao lưu MongoDB: `./scripts/backup-mongo.sh` (chi tiết ở [backup-and-recovery](backup-and-recovery.md)).
3. Đặt tag mới (tag đã được CI đẩy lên Docker Hub) và triển khai:

   ```bash
   sed -i "s/^IMAGE_TAG=.*/IMAGE_TAG=<tag-mới>/" .env.production
   ./scripts/deploy.sh
   ```

   `deploy.sh` kéo image, khởi động lại dịch vụ đổi và chờ healthcheck (tối đa 180 giây).

4. Kiểm tra readiness:

   ```bash
   until curl -fs https://<API_DOMAIN>/api/v1/health/ready > /dev/null; do sleep 5; done; echo ready
   ```

5. Theo dõi 30 phút: không có alert `critical` ([alerts](alerts.md)), log backend không có lỗi mới.

## Khi nào rollback

- Có alert `critical` (`BackendDown`, `DependencyDown` do bản mới, `HighErrorRate`) trong 30 phút sau deploy.
- Lỗi nghiệp vụ đã xác nhận do bản mới, chưa sửa nhanh được.

## Rollback

```bash
sed -i "s/^IMAGE_TAG=.*/IMAGE_TAG=<tag-cũ>/" .env.production
./scripts/deploy.sh
until curl -fs https://<API_DOMAIN>/api/v1/health/ready > /dev/null; do sleep 5; done; echo ready
```

Không cần `git checkout`: tag cũ vẫn còn trên Docker Hub (và thường còn trên máy). Sau khi ổn định, `git checkout <commit-cũ>` nếu muốn mã nguồn trên VPS khớp với image đang chạy.

## Dọn image

`deploy.sh` đã chạy `docker image prune -f`, chỉ xoá image không có tag nên các bản đã gắn tag vẫn còn. Giữ 3 tag gần nhất (ổ SSD VPS chỉ 25GB, mỗi image nặng khoảng 900MB), xoá tay tag cũ hơn:

```bash
docker image ls
docker image rm <DOCKERHUB_USER>/<IMAGE_NAME>:<tag-cũ-hơn>
```

## Giới hạn

- Repository không có migration. Field và index do bản mới tạo không tự mất khi quay về; mã cũ thường chịu được field thừa, nhưng index mới vẫn còn.
- Khôi phục từ bản sao lưu là biện pháp cuối và mất mọi dữ liệu ghi sau thời điểm sao lưu.
- Rollback cần tag cũ còn trên Docker Hub; đừng xoá tag đang là bản ổn định gần nhất.
- Mỗi lần deploy có thời gian ngừng ngắn vì chỉ có một container backend.
