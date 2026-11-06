# Mục lục

[Trang chủ tài liệu](README.md)

## 00 · Getting Started

- [Tổng quan dự án](00-getting-started/project-overview.md)
- [Chạy thử trong 5 phút](00-getting-started/quick-start.md)
- [Môi trường phát triển local](00-getting-started/local-development.md)
- [Cấu trúc dự án](00-getting-started/project-structure.md)

## 01 · Product

- [Tính năng](01-product/feature-overview.md)
- [Vai trò và quyền truy cập](01-product/user-roles.md)
- [Quy tắc nghiệp vụ](01-product/business-rules.md)

## 02 · Architecture

- [Tổng quan kiến trúc](02-architecture/architecture-overview.md)
- [System Context](02-architecture/system-context.md)
- [Container Diagram](02-architecture/container-diagram.md)
- [Component Diagram](02-architecture/component-diagram.md)
- [Phụ thuộc giữa các module](02-architecture/module-dependencies.md)
- [Luồng dữ liệu: đồng bộ và bất đồng bộ](02-architecture/data-flow.md)
- [Công nghệ và lý do lựa chọn](02-architecture/technology-decisions.md)
- [Quan sát hệ thống](02-architecture/observability.md)
- [Khả năng mở rộng](02-architecture/scalability.md)
- [Chiến lược cache](02-architecture/caching-strategy.md)
- [Xử lý bất đồng bộ](02-architecture/asynchronous-processing.md)
- [Những bài toán kỹ thuật chính](02-architecture/technical-challenges.md)

## 03 · Modules

- [Auth và Sessions](03-modules/auth-and-sessions.md)
- [Authorization (CASL)](03-modules/authorization.md)
- [Users](03-modules/users.md)
- [Companies](03-modules/companies.md)
- [Jobs](03-modules/jobs.md)
- [Resumes](03-modules/resumes.md)
- [CV Profiles](03-modules/cv-profiles.md)
- [Skills](03-modules/skills.md)
- [Files](03-modules/files.md)
- [Notifications, Mail và Subscribers](03-modules/notifications-and-mail.md)
- [Statistics](03-modules/statistics.md)
- [Hạ tầng dùng chung](03-modules/platform-infrastructure.md)
- [Job Ingestion và vòng đời tin ngoài](03-modules/job-ingestion.md)
- [Job Search (tìm kiếm hợp nhất)](03-modules/job-search.md)
- [CV Parsing và Hybrid Matching](03-modules/cv-parsing-and-matching.md)
- [AI Chat](03-modules/ai-chat.md)
- [Queues (BullMQ)](03-modules/queues.md)

## 04 · Database

- [Tổng quan cơ sở dữ liệu](04-database/database-overview.md)
- [Quan hệ giữa các collection](04-database/collection-relationships.md)
- Collection: [users](04-database/collections/users.md), [sessions](04-database/collections/sessions.md), [notifications](04-database/collections/notifications.md), [subscribers](04-database/collections/subscribers.md), [companies](04-database/collections/companies.md), [jobs](04-database/collections/jobs.md), [resumes](04-database/collections/resumes.md), [cv-profiles](04-database/collections/cv-profiles.md), [skills](04-database/collections/skills.md), [job-sources](04-database/collections/job-sources.md), [external-jobs](04-database/collections/external-jobs.md), [crawl-runs](04-database/collections/crawl-runs.md), [chat-sessions](04-database/collections/chat-sessions.md), [chat-messages](04-database/collections/chat-messages.md), [chat-tool-actions](04-database/collections/chat-tool-actions.md), [chat-quota-policies](04-database/collections/chat-quota-policies.md), [ai-usage-logs](04-database/collections/ai-usage-logs.md)

## 05 · API

- [Tổng quan API](05-api/api-overview.md)
- [Thời gian thực: Socket.IO và stream chat](05-api/realtime.md)
- Endpoint: [auth](05-api/endpoints/auth.md), [users](05-api/endpoints/users.md), [companies](05-api/endpoints/companies.md), [jobs](05-api/endpoints/jobs.md), [resumes](05-api/endpoints/resumes.md), [cv-profiles](05-api/endpoints/cv-profiles.md), [skills](05-api/endpoints/skills.md), [subscribers](05-api/endpoints/subscribers.md), [notifications](05-api/endpoints/notifications.md), [chat](05-api/endpoints/chat.md), [job-search](05-api/endpoints/job-search.md), [job-sources](05-api/endpoints/job-sources.md), [files](05-api/endpoints/files.md), [statistics](05-api/endpoints/statistics.md), [mail](05-api/endpoints/mail.md), [health](05-api/endpoints/health.md)

## 06 · Workflows

- Use case: [tổng quan](06-workflows/use-cases/use-case-overview.md), [xác thực](06-workflows/use-cases/authentication.md), [đăng tin và duyệt](06-workflows/use-cases/job-posting-and-approval.md), [nộp hồ sơ](06-workflows/use-cases/job-application.md), [quản lý CV](06-workflows/use-cases/cv-management.md), [xóa tài khoản](06-workflows/use-cases/account-deletion.md)
- Sequence: [xử lý CV](06-workflows/sequences/cv-processing.md), [đồng bộ tin ngoài](06-workflows/sequences/job-ingestion.md), [tìm kiếm hợp nhất](06-workflows/sequences/unified-job-search.md), [làm mới token](06-workflows/sequences/refresh-token.md), [chat AI stream](06-workflows/sequences/ai-chat-streaming.md)
- State machine: [vòng đời tin ngoài](06-workflows/state-machines/external-job-lifecycle.md), [duyệt tin](06-workflows/state-machines/job-approval.md), [trạng thái hồ sơ](06-workflows/state-machines/resume-status.md)

## 07 · Integrations

- [Nhà cung cấp AI](07-integrations/ai-providers.md)
- [Email (SMTP)](07-integrations/email-delivery.md)
- [Google đăng nhập](07-integrations/google-oauth.md)
- [Nguồn tin tuyển dụng ngoài](07-integrations/job-source-providers.md)
- [Sentry](07-integrations/sentry.md)

## 08 · Security

- [Xác thực](08-security/authentication.md)
- [Phân quyền](08-security/authorization.md)
- [Bảo vệ dữ liệu cá nhân](08-security/data-protection.md)
- [Checklist bảo mật production](08-security/production-security-checklist.md)

## 09 · Infrastructure

- [Docker và Compose](09-infrastructure/docker.md)
- [CI/CD](09-infrastructure/ci-cd.md)
- [Triển khai](09-infrastructure/deployment.md)

## 10 · Testing

- [Chiến lược kiểm thử](10-testing/testing-strategy.md)
- [Thống kê kiểm thử](10-testing/test-inventory.md)

## 11 · Operations

- [Health check, log và giám sát](11-operations/health-and-logging.md)
- [Xử lý sự cố](11-operations/troubleshooting.md)
- [Sao lưu, khôi phục và rollback](11-operations/backup-and-recovery.md)

## 12 · Decisions

- [Mục lục ADR](12-decisions/README.md)
- [0001 Modular monolith](12-decisions/0001-modular-monolith.md)
- [0002 Vai trò là enum](12-decisions/0002-roles-as-enum.md)
- [0003 BullMQ cho xử lý nền](12-decisions/0003-bullmq-background-processing.md)
- [0004 Hybrid matching](12-decisions/0004-hybrid-matching.md)
- [0005 Vòng đời tin ngoài](12-decisions/0005-external-job-lifecycle.md)
- [0006 Chính sách hiển thị theo nguồn](12-decisions/0006-source-display-policy.md)
- [0007 Quota chat đặt chỗ](12-decisions/0007-reservation-based-chat-quota.md)
- [0008 Cache danh sách có thẻ](12-decisions/0008-redis-tagged-list-cache.md)
- [0009 Hành động AI cần xác nhận](12-decisions/0009-confirmed-tool-actions.md)

## 13 · Contributing

- [Hướng dẫn viết và bảo trì tài liệu](13-contributing/documentation-guide.md)
- [Quy trình phát triển](13-contributing/development-workflow.md)

## 14 · Reference

- [Biến môi trường](14-reference/environment-variables.md)
- [Thuật ngữ](14-reference/glossary.md)
- [Đối chiếu và migration tài liệu cũ](14-reference/legacy-docs-migration.md)
- [Báo cáo bao phủ tài liệu](14-reference/documentation-coverage.md)
