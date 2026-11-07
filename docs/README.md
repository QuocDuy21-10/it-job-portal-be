# DevLink Backend Documentation

Tài liệu kỹ thuật và nghiệp vụ của DevLink, nền tảng tuyển dụng IT tại Việt Nam. Repository này là backend NestJS; tài liệu giúp bạn hiểu hệ thống vận hành thế nào, từ nghiệp vụ tuyển dụng đến kiến trúc, dữ liệu, AI và xử lý bất đồng bộ.

> Mục lục đầy đủ ở [SUMMARY.md](SUMMARY.md). Đọc [báo cáo bao phủ](14-reference/documentation-coverage.md) để biết phần nào đã xác minh, phần nào chưa, và các phát hiện quan trọng từ việc đối chiếu code.

## Bắt đầu theo vai trò

| Bạn là | Đọc theo thứ tự |
|---|---|
| Người chưa biết dự án | [Tổng quan dự án](00-getting-started/project-overview.md), rồi [Bối cảnh hệ thống](02-architecture/system-context.md) |
| Developer mới | [Chạy thử](00-getting-started/quick-start.md), [Môi trường local](00-getting-started/local-development.md), [Cấu trúc dự án](00-getting-started/project-structure.md), [Tổng quan kiến trúc](02-architecture/architecture-overview.md) |
| Tech Lead hoặc reviewer | [Tổng quan kiến trúc](02-architecture/architecture-overview.md), [Công nghệ và lý do](02-architecture/technology-decisions.md), [Khả năng mở rộng](02-architecture/scalability.md) |
| Người đóng góp | [Hướng dẫn viết tài liệu](13-contributing/documentation-guide.md), [Quy trình phát triển](13-contributing/development-workflow.md) |
| Người vận hành | [Triển khai](09-infrastructure/deployment.md), [Checklist bảo mật](08-security/production-security-checklist.md), [Xử lý sự cố](11-operations/troubleshooting.md) |

## Các khu vực tài liệu

| Khu vực | Nội dung | Trạng thái |
|---|---|---|
| `00-getting-started` | Giới thiệu, chạy thử, môi trường local, cấu trúc dự án | Có |
| `01-product` | Vai trò người dùng, tính năng, quy tắc nghiệp vụ | Có |
| `02-architecture` | Sơ đồ C4, phụ thuộc module, luồng dữ liệu, cache, bất đồng bộ, công nghệ, quan sát, mở rộng | Có |
| `03-modules` | Giải thích từng module | Có (17 tài liệu) |
| `04-database` | Data dictionary 17 collection, quan hệ, index | Có |
| `05-api` | 116 route theo từng controller, thời gian thực | Có |
| `06-workflows` | Use case, sequence, state diagram | Có |
| `07-integrations` | AI, email, Google, nguồn tin, Sentry | Có |
| `08-security` | Xác thực, phân quyền, bảo vệ dữ liệu, checklist | Có |
| `09-infrastructure` | Docker, CI/CD, triển khai | Có |
| `10-testing` | Chiến lược và thống kê test | Có |
| `11-operations` | Health check, xử lý sự cố, sao lưu | Có |
| `12-decisions` | Quyết định kiến trúc (ADR) | Có |
| `13-contributing` | Quy chuẩn viết tài liệu và quy trình phát triển | Có |
| `14-reference` | Thuật ngữ, biến môi trường, đối chiếu tài liệu cũ | Có |

## Quy ước độ tin cậy

Mỗi tài liệu dùng năm nhãn để phân biệt hiện trạng với kế hoạch: `Current Implementation`, `Design Decision`, `Known Limitation`, `Future Improvement`, `Chưa xác minh`. Xem định nghĩa trong [documentation-guide.md](13-contributing/documentation-guide.md#nhãn-trạng-thái).

Khi tài liệu và code khác nhau, code đúng. Hãy sửa tài liệu trong cùng Pull Request.

## Tài liệu cũ

Thư mục `docs/` từng chứa 171 ghi chú theo giai đoạn phát triển. Chúng đã được phân loại và chuyển vào `docs/archive/` (chỉ có ở local), xem [legacy-docs-migration](14-reference/legacy-docs-migration.md). Đừng xem chúng là nguồn chính thức.
