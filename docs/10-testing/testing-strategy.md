# Chiến lược kiểm thử

Mô tả cách kiểm thử hiện có trong repository, cách chạy, và những gì chưa được bao phủ. Số liệu cụ thể ở [test-inventory](test-inventory.md).

## Các tầng kiểm thử

| Tầng | Công cụ | Vị trí | Chạy bằng | Cần dịch vụ ngoài |
|---|---|---|---|---|
| Unit | Jest 29, `ts-jest`, mock | `src/**/*.spec.ts` (đặt cạnh file nguồn) | `npm test` | Không |
| E2E smoke | Jest, Supertest | `test/app.e2e-spec.ts` | `npm run test:e2e` | **MongoDB và Redis thật** |
| Coverage | Jest `--coverage` | thư mục `coverage/` (ngoài `src/`) | `npm run test:cov` | Không |

Cấu hình Jest unit nằm trong [package.json](../../package.json) (`rootDir: src`, `testRegex: .*\.spec\.ts$`, ánh xạ `^src/(.*)$`). Cấu hình e2e ở [test/jest-e2e.json](../../test/jest-e2e.json).

## Unit test

- Mỗi service quan trọng có file `*.spec.ts`; phụ thuộc được mock, không dùng database thật.
- Không có test tích hợp với MongoDB trong bộ unit: các truy vấn, pipeline aggregation và index chỉ được kiểm tra ở mức dựng đối tượng (ví dụ `buildJobSearchPlan` trong [job-search-pipeline.spec.ts](../../src/job-search/job-search-pipeline.spec.ts)), không chạy trên database.
- Có test cho các hàm thuần quan trọng: vòng đời tin ngoài (`JobLifecycleService`), bộ lọc nạp tin, hiển thị tin, request id, danh mục địa điểm, kiểm tra biến môi trường.
- Bộ dữ liệu test dùng chung của `auth` ở [src/auth/testing/](../../src/auth/testing/).

## E2E smoke

[test/app.e2e-spec.ts](../../test/app.e2e-spec.ts) dựng ứng dụng thật bằng cùng `configureApp` với production ([app.setup.ts](../../src/app.setup.ts)) để test chạy đúng pipeline guard, interceptor, pipe. Bốn kịch bản:

1. `GET /api/v1/health` trả `200` với database và Redis hoạt động.
2. `POST /api/v1/auth/login` trả access token và cookie refresh `httpOnly`.
3. `GET /api/v1/auth/me` trả `401` khi không có token và `200` khi có.
4. `GET /api/v1/jobs` áp dụng bộ lọc `aqp`, sắp xếp và phân trang (công khai).

Môi trường e2e ([test/setup-e2e-env.ts](../../test/setup-e2e-env.ts)) dùng database Mongo riêng `devlink-e2e` và Redis DB 14 (hàng đợi) và 15 (cache) để không đụng dữ liệu phát triển; có thể ghi đè bằng `E2E_MONGO_URL`, `E2E_REDIS_*`. Test tạo và dọn dữ liệu của chính nó (người dùng `e2e-user@devlink.test`, tin có tiền tố `E2E-`).

**Trạng thái:** thư mục `test/` chưa được commit trong nhánh hiện tại (thuộc nhánh `chore/toolchain-and-safety-net`). Bộ e2e **chưa được chạy** khi tạo tài liệu vì thiếu MongoDB và Redis: `Chưa xác minh` kết quả.

## Cách chạy

```bash
npm test                    # toàn bộ unit
npx jest <đường dẫn>        # một file
npm run test:cov            # kèm coverage
npm run docker:dev && npm run test:e2e
```

## Khoảng trống bao phủ

Dựa trên đo coverage (xem [test-inventory](test-inventory.md#độ-bao-phủ)) và danh sách file test:

| Khu vực | Hiện trạng |
|---|---|
| Chấm điểm CV (`matching/`) | Không có file test riêng; bao phủ gián tiếp thấp |
| Đọc CV (`cv-parser/`) | Không test, bao phủ 0% |
| Phân quyền theo route (`@Roles`, sở hữu, lỗ hổng `cv-profiles`) | Không có test tự động cho từng route |
| Processor hàng đợi | Chỉ `account-deletion` có test; `resume`, `job-ingestion`, `job-recommendation`, email không có |
| `mail`, `notifications`, `health`, `casl` | Không có file test |
| Truy vấn MongoDB, index, TTL | Không kiểm tra với database thật trong bộ unit |
| Tích hợp nhà cung cấp AI, SMTP, Google | Chỉ mock |
| `main.ts`, `app.setup.ts`, `app.module.ts` | Không bao phủ trong unit (e2e dùng `configureApp`) |

## Quy ước viết test

- Đặt `*.spec.ts` cạnh file nguồn, tên khớp file.
- Mock phụ thuộc, không gọi mạng hay database thật trong unit.
- Hàm thuần (quy tắc nghiệp vụ) nên được tách để test trực tiếp, như `JobLifecycleService`.
- Không đưa dữ liệu cá nhân thật vào fixture; dùng `@example.com` hay `@devlink.test`.

## Future Improvement

Đề xuất, chưa có: test cho `matching` (đặc biệt khớp kỹ năng, xem [known limitation](../03-modules/cv-parsing-and-matching.md#known-limitation)); test phân quyền cho các route nhạy cảm; chạy e2e trong CI với dịch vụ MongoDB và Redis; test tích hợp pipeline `$unionWith` với MongoDB thật.
