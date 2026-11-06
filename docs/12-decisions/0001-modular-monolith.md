# ADR-0001: Một ứng dụng NestJS module hóa, worker chạy cùng tiến trình

- **Trạng thái:** Accepted
- **Bằng chứng:** Ghi trong [AGENTS.md](../../AGENTS.md) ("Single NestJS backend ... not a monorepo"); `AppModule` import mọi module và `QueuesModule` đăng ký cả producer lẫn processor ([queues.module.ts](../../src/queues/queues.module.ts)).

## Bối cảnh

Hệ thống gồm xác thực, tuyển dụng, AI, đồng bộ tin ngoài và xử lý nền, cần một đơn vị triển khai và vận hành.

## Quyết định

Giữ **một** ứng dụng NestJS chia module theo nghiệp vụ. API, WebSocket, worker BullMQ và cron chạy trong cùng tiến trình. Không tách microservice hay monorepo nhiều ứng dụng.

## Hệ quả

Một đơn vị triển khai và một image; processor gọi lại service nghiệp vụ trực tiếp. Đánh đổi: tải nền cạnh tranh với API, không scale riêng worker, cron và Socket.IO chưa sẵn sàng cho nhiều instance ([scalability](../02-architecture/scalability.md)).

## Mức tin cậy của lý do

Quyết định được ghi tường minh ở `AGENTS.md`. Lý do (quy mô nhóm, chi phí vận hành) **không** được ghi trong repository; đây là suy luận (`Proposed`).
