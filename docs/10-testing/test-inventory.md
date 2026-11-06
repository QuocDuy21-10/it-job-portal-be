# Thống kê kiểm thử

Số liệu **đo thực tế** ngày 2026-11-06 bằng `npx jest` trên nhánh `docs/production-documentation`, Node v22.23.2 (dự án yêu cầu 24, CI dùng 24). Số có thể đổi khi code đổi; chạy lại bằng `npm test` và `npm run test:cov`.

## Kết quả tổng

| Chỉ số | Giá trị |
|---|---|
| Bộ test (suite) | 64 |
| Test case | 706 |
| Đạt | 706 |
| Lỗi | 0 |
| Bỏ qua | 0 |
| Thời gian | khoảng 18 giây |

E2E: 4 kịch bản trong `test/app.e2e-spec.ts`, **chưa chạy** (cần MongoDB và Redis).

## Theo module

| Module | File test | Test case |
|---|---|---|
| `job-ingestion` | 10 | 201 |
| `users` | 5 | 95 |
| `auth` | 9 | 90 |
| `chat` | 11 | 77 |
| `job-search` | 2 | 43 |
| `jobs` | 2 | 33 |
| `companies` | 2 | 32 |
| `subscribers` | 3 | 28 |
| `files` | 2 | 28 |
| `ai` | 1 | 11 |
| `cv-profiles` | 1 | 9 |
| `groq` | 1 | 9 |
| `resumes` | 2 | 7 |
| `gemini` | 1 | 6 |
| `utils` | 2 | 6 |
| `sessions` | 1 | 5 |
| `skills`, `statistics`, `queues`, `profile-identity`, `redis` | 1, 1, 3, 1, 1 | 4 mỗi nhóm |
| `databases`, `config` | 1, 1 | 3 mỗi nhóm |

Module **không có** file test: `matching`, `cv-parser`, `casl`, `mail`, `notifications`, `health`.

## Độ bao phủ

Đo bằng `jest --coverage` trên 300 file nguồn được tính:

| Chỉ số | Giá trị |
|---|---|
| Dòng (lines) | 59,1% |
| Câu lệnh (statements) | 59,1% |
| Hàm (functions) | 50,3% |
| Nhánh (branches) | 49,3% |

Bao phủ dòng theo module (từ thấp đến cao, gộp theo thư mục `src/`):

| Module | Dòng |
|---|---|
| `cv-parser`, `health` | 0% |
| `mail` | 6% |
| `matching`, `queues` | 22% |
| `notifications` | 29% |
| `cv-profiles` | 33% |
| `skills` | 40% |
| `databases` | 41% |
| `gemini` | 43% |
| `casl` | 45% |
| `resumes` | 46% |
| `jobs` | 51% |
| `companies`, `statistics` | 54% |
| `files` | 55% |
| `ai` | 57% |
| `utils` | 66% |
| `profile-identity` | 68% |
| `job-search` | 70% |
| `sessions` | 74% |
| `chat` | 77% |
| `redis`, `subscribers`, `groq` | 80% |
| `auth` | 81% |
| `users` | 85% |
| `job-ingestion` | 93% |
| `config` | 100% |

Các file khởi tạo (`main.ts`, `app.module.ts`, `app.setup.ts`, `instrument.ts`) 0%. `matching` ở 22% cho thấy chỉ một phần nhỏ được chạm gián tiếp qua test khác; công thức chấm điểm không có test riêng.

## Cách đo

```bash
npm test                     # 64 suite, 706 test
npm run test:cov             # tạo coverage/ (không commit)
```

Con số coverage trên lấy từ `coverage-summary.json` do Jest sinh, cộng lại theo thư mục gốc của từng file; tổng là số do Jest báo.

## Lưu ý khi đọc số liệu

- Số test case nhiều không đồng nghĩa với bao phủ nghiệp vụ tốt: `job-ingestion` có 201 test và 93% dòng, trong khi chấm điểm CV gần như không có test.
- Các test mock phụ thuộc nên không phát hiện lỗi truy vấn thật, index, hay hành vi Mongoose (ví dụ kiểu `Mixed` của `userId` hay index trùng).
- Test pass trên Node 22; CI dùng Node 24.
