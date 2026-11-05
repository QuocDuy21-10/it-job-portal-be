# DevLink Backend Documentation

Tài liệu kỹ thuật và nghiệp vụ của DevLink, nền tảng tuyển dụng IT tại Việt Nam. Repository này là backend NestJS; tài liệu giúp bạn hiểu hệ thống vận hành thế nào, từ nghiệp vụ tuyển dụng đến kiến trúc, dữ liệu, AI và xử lý bất đồng bộ.

> Tài liệu đang được xây dựng theo từng phase. Mục lục đầy đủ ở [SUMMARY.md](SUMMARY.md) chỉ liệt kê các file đã có. Các khu vực chưa có file được ghi rõ trong bảng bên dưới.

## Bắt đầu theo vai trò

| Bạn là | Đọc theo thứ tự |
|---|---|
| Người chưa biết dự án | [Tổng quan dự án](00-getting-started/project-overview.md), rồi [Bối cảnh hệ thống](02-architecture/system-context.md) |
| Developer mới | [Chạy thử](00-getting-started/quick-start.md), [Môi trường local](00-getting-started/local-development.md), [Cấu trúc dự án](00-getting-started/project-structure.md), [Tổng quan kiến trúc](02-architecture/architecture-overview.md) |
| Tech Lead hoặc reviewer | [Tổng quan kiến trúc](02-architecture/architecture-overview.md), [Công nghệ và lý do](02-architecture/technology-decisions.md), [Khả năng mở rộng](02-architecture/scalability.md) |
| Người đóng góp tài liệu | [Hướng dẫn viết tài liệu](13-contributing/documentation-guide.md) |

## Các khu vực tài liệu

| Khu vực | Nội dung | Trạng thái |
|---|---|---|
| `00-getting-started` | Giới thiệu, chạy thử, môi trường local, cấu trúc dự án | Có |
| `01-product` | Vai trò người dùng, tính năng, quy tắc nghiệp vụ | Phase 2 |
| `02-architecture` | Sơ đồ C4, phụ thuộc module, luồng dữ liệu, công nghệ, quan sát, mở rộng | Có (một phần, thêm cache và hàng đợi ở Phase 3) |
| `03-modules` | Giải thích từng module | Phase 2 và 3 |
| `04-database` | Data dictionary 17 collection, quan hệ, index | Phase 2 |
| `05-api` | 116 route theo từng controller | Phase 3 |
| `06-workflows` | Use case, sequence, state diagram | Phase 3 |
| `07-integrations` | AI, email, Google, nguồn tin, Sentry | Phase 3 |
| `08-security` | Xác thực, phân quyền, bảo vệ dữ liệu, checklist | Phase 4 |
| `09-infrastructure` | Docker, CI/CD, triển khai | Phase 4 |
| `10-testing` | Chiến lược và thống kê test | Phase 4 |
| `11-operations` | Health check, xử lý sự cố, sao lưu | Phase 4 |
| `12-decisions` | Quyết định kiến trúc (ADR) | Phase 4 |
| `13-contributing` | Quy chuẩn viết tài liệu và phát triển | Có (hướng dẫn viết tài liệu) |
| `14-reference` | Thuật ngữ, biến môi trường, đối chiếu tài liệu cũ | Phase 4 |

## Quy ước độ tin cậy

Mỗi tài liệu dùng năm nhãn để phân biệt hiện trạng với kế hoạch: `Current Implementation`, `Design Decision`, `Known Limitation`, `Future Improvement`, `Chưa xác minh`. Xem định nghĩa trong [documentation-guide.md](13-contributing/documentation-guide.md#nhãn-trạng-thái).

Khi tài liệu và code khác nhau, code đúng. Hãy sửa tài liệu trong cùng Pull Request.

## Tài liệu cũ

Thư mục `docs/` từng chứa nhiều ghi chú theo giai đoạn phát triển (sửa lỗi, kế hoạch, hướng dẫn nhanh). Những ghi chú này chưa được đối chiếu hết với code hiện tại, vẫn nằm local và sẽ được xử lý ở Phase 4. Đừng xem chúng là nguồn chính thức.
