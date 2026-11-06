# Sequence: đồng bộ tin từ nguồn ngoài

Trình tự tương tác khi đồng bộ một nguồn. Giải thích thiết kế và quy tắc nằm ở [job-ingestion](../../03-modules/job-ingestion.md); tài liệu này chỉ vẽ thứ tự.

## Actor

| Actor | Vai trò |
|---|---|
| Cron | Kích hoạt mỗi 6 giờ cho nguồn đang bật |
| Quản trị viên | Kích hoạt tay một nguồn bằng `POST /job-sources/:key/sync` |
| Processor | Worker BullMQ chạy `syncSource` |
| Nguồn ngoài | ATS hoặc trang việc làm |

## Luồng chính

```mermaid
sequenceDiagram
    autonumber
    participant T as Cron hoặc Quản trị viên
    participant S as JobIngestionService
    participant Q as Hàng đợi job-ingestion
    participant P as Processor
    participant C as SourceSyncCoordinator
    participant A as Adapter
    participant X as Nguồn ngoài
    participant DB as MongoDB

    T->>S: enqueueEnabledSources hoặc requestSync(key)
    S->>Q: add sync, jobId = sync-key (bị bỏ qua nếu đã có)
    Q->>P: giao việc
    P->>C: syncSource(key)
    C->>DB: đọc job_sources, tạo crawl_runs RUNNING
    C->>DB: nạp trạng thái các tin đã biết
    C->>A: fetchJobs(boardToken, selectForFetch)
    A->>X: lấy danh sách (API hoặc sitemap)
    X-->>A: danh sách tin
    A->>C: selectForFetch(ids), lập kế hoạch tải
    loop mỗi tin cần tải, tối đa 150 với sitemap
        A->>X: tải chi tiết, chờ 1 giây giữa các lần
        X-->>A: chi tiết hoặc 403, 429, captcha
    end
    A-->>C: tin thô, listedIds, loại, stoppedEarly
    C->>C: lọc IT và VN, chuẩn hóa, so hash
    C->>DB: upsert external_jobs
    C->>C: computeTransitions
    C->>DB: đánh dấu seen, STALE, đóng tin, đóng tin hết hạn
    C->>DB: cập nhật crawl_runs và job_sources
    C-->>P: xong
```

## Nhánh thay thế và lỗi

| Tình huống | Điểm xảy ra | Kết quả |
|---|---|---|
| Nguồn bị tắt hoặc không tồn tại | Bước đầu của `run` | Ghi cảnh báo, bỏ qua, không tạo `crawl_runs` |
| Việc cùng `jobId` đã có | `add` ở bước 2 | BullMQ bỏ qua, không tạo việc thứ hai |
| Bị chặn 403, 429, captcha | Vòng tải chi tiết | Dừng vòng lặp, `stoppedEarly`, kết quả `PARTIAL`, vẫn áp dụng bước vòng đời với danh sách đầy đủ |
| Danh sách rỗng hoặc co dưới 50% mức nền | `isSuspectListing` | `SUSPECT`, `computeTransitions` không đóng tin vì vắng mặt |
| Lỗi không bắt được | Bất kỳ bước | `crawl_runs` thành `FAILED`, ném lại, BullMQ retry tối đa 3 lần với backoff mũ bắt đầu 5 giây |
| Không có adapter cho provider | Đầu `sync` | `UnrecoverableError`, không retry |

## Thành phần liên quan

- Hàng đợi và retry: `03-modules/queues.md` (sẽ có ở cùng Phase).
- Dữ liệu: [external-jobs](../../04-database/collections/external-jobs.md), [crawl-runs](../../04-database/collections/crawl-runs.md).
