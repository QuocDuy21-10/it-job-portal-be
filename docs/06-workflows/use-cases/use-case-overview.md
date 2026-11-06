# Tổng quan use case

Các tác nhân (actor) và chức năng chính của DevLink. Mỗi nghiệp vụ phức tạp có tài liệu riêng bên dưới. Danh sách quyền theo vai trò: [user-roles](../../01-product/user-roles.md).

## Sơ đồ use case

```mermaid
flowchart LR
    G(["Khách"])
    C(["Ứng viên"])
    H(["HR"])
    A(["Quản trị viên"])
    S(["Hệ thống (cron, worker)"])

    subgraph DevLink
        UC1["Đăng ký, xác thực, đăng nhập"]
        UC2["Tìm việc và tìm kiếm hợp nhất"]
        UC3["Quản lý CV trực tuyến"]
        UC4["Nộp hồ sơ ứng tuyển"]
        UC5["Lưu tin, theo dõi công ty, đăng ký gợi ý"]
        UC6["Chat với trợ lý AI"]
        UC7["Xóa tài khoản"]
        UC8["Đăng tin tuyển dụng"]
        UC9["Xử lý hồ sơ ứng tuyển"]
        UC10["Duyệt tin"]
        UC11["Quản lý người dùng, công ty, kỹ năng"]
        UC12["Quản lý nguồn tin ngoài"]
        UC13["Đồng bộ tin ngoài"]
        UC14["Phân tích CV"]
        UC15["Gửi email và thông báo"]
    end

    G --> UC1
    G --> UC2
    C --> UC1
    C --> UC2
    C --> UC3
    C --> UC4
    C --> UC5
    C --> UC6
    C --> UC7
    H --> UC8
    H --> UC9
    H --> UC6
    A --> UC10
    A --> UC11
    A --> UC12
    S --> UC13
    S --> UC14
    S --> UC15
```

HR cũng dùng được các chức năng của ứng viên (nộp hồ sơ, CV trực tuyến, đăng nhập) vì các route đó không giới hạn vai trò. Quản trị viên mở rộng được mọi chức năng của HR.

## Tài liệu từng nghiệp vụ

| Nghiệp vụ | Tài liệu |
|---|---|
| Đăng ký, xác thực, đăng nhập, quên mật khẩu | [authentication](authentication.md) |
| Đăng tin và duyệt tin | [job-posting-and-approval](job-posting-and-approval.md) |
| Nộp hồ sơ ứng tuyển | [job-application](job-application.md) |
| Quản lý CV trực tuyến | [cv-management](cv-management.md) |
| Xóa tài khoản | [account-deletion](account-deletion.md) |
| Đồng bộ tin ngoài | [sequence](../sequences/job-ingestion.md) |
| Chat AI | [sequence](../sequences/ai-chat-streaming.md) |
| Tìm kiếm hợp nhất | [sequence](../sequences/unified-job-search.md) |

Các sơ đồ trạng thái: [job-approval](../state-machines/job-approval.md), [resume-status](../state-machines/resume-status.md), [external-job-lifecycle](../state-machines/external-job-lifecycle.md).
