# Sequence: tìm kiếm hợp nhất tin nội bộ và tin ngoài

Trình tự của `GET /api/v1/job-search`. Quy tắc lọc, sắp xếp và giới hạn: [job-search](../../03-modules/job-search.md).

## Actor

Khách hoặc người dùng đã đăng nhập (route công khai). Không yêu cầu token.

## Luồng chính (`source=all`, không có lọc loại trừ tin ngoài)

```mermaid
sequenceDiagram
    autonumber
    participant U as Người dùng
    participant G as ThrottlerGuard
    participant C as JobSearchController
    participant S as JobSearchService
    participant DB as MongoDB

    U->>G: GET /job-search?keyword=...&sort=newest
    G->>G: kiểm tra rate limit theo IP
    G->>C: cho qua, ValidationPipe kiểm tra DTO
    C->>S: search(query)
    S->>S: normalize, salaryMin lớn hơn salaryMax thì 400
    S->>DB: distinct(job_sources.key, displayPolicy = HIDDEN)
    DB-->>S: hiddenSourceKeys
    S->>S: buildJobSearchPlan
    S->>DB: jobs.aggregate: match, project, unionWith external_jobs, sort, facet
    DB-->>S: items và total
    S-->>C: result, meta.pagination
    C-->>U: 200, data bọc trong envelope
```

## Các nhánh

| Tình huống | Điểm rẽ | Kết quả |
|---|---|---|
| `source=internal` | `buildJobSearchPlan` | Pipeline chỉ chạy trên `jobs`, bỏ truy vấn `hiddenSourceKeys` |
| `source=external` | `buildJobSearchPlan` | Pipeline chạy trên `external_jobs` |
| Có `salaryMin` hoặc `salaryMax`, hoặc `formOfWork` khác `Remote` | Dựng stage ngoài trả `null` | Phía ngoài bị bỏ. Với `source=all` chỉ còn tin nội bộ. Với `source=external` trả danh sách rỗng mà không chạy aggregation (truy vấn `distinct` ẩn nguồn vẫn chạy trước đó) |
| Vượt rate limit | `ThrottlerGuard` | `429` |
| Tham số sai | `ValidationPipe` | `400` |
| `salaryMin` lớn hơn `salaryMax` | `normalize` | `400` |

## Chi tiết một tin ngoài

```mermaid
sequenceDiagram
    autonumber
    participant U as Người dùng
    participant S as JobSearchService
    participant DB as MongoDB

    U->>S: GET /job-search/external/:id
    S->>S: ObjectId hợp lệ? nếu không 400
    S->>DB: external_jobs.findById
    alt không có
        S-->>U: 404
    else có
        S->>DB: job_sources.findOne(key), lấy displayPolicy
        alt HIDDEN
            S-->>U: 404
        else LINK_ONLY hoặc FULL
            S-->>U: chi tiết, descriptionHtml rỗng nếu LINK_ONLY
        end
    end
```

## Ghi chú

- Mỗi request chạy một aggregation và một truy vấn `distinct`; không có cache ([job-search](../../03-modules/job-search.md#known-limitation)).
- Phản hồi dùng envelope chung `{ statusCode, message, data }` vì route không có `@SkipTransform`.
