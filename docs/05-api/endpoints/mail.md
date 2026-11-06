# API Mail

Tiền tố `/api/v1/mail`. Controller: [mail.controller.ts](../../../src/mail/mail.controller.ts). Module: [notifications-and-mail](../../03-modules/notifications-and-mail.md#gợi-ý-việc-làm-hằng-tuần).

Controller này cũng chứa cron `weekly-job-recommendations` (9 giờ sáng thứ Hai, `Asia/Ho_Chi_Minh`), nhưng cron **không** phải route HTTP.

## Danh sách route

| Route | Auth | Mô tả |
|---|---|---|
| `POST /api/v1/mail/send-job-recommendations` | Đăng nhập, vai trò: SUPER ADMIN | Kích hoạt tay việc gửi gợi ý việc làm cho mọi người đăng ký (quản trị viên) |

## Ghi chú

Route chạy cùng logic với cron: duyệt `subscribers` chưa xóa mềm và có email, gom ID theo lô 100 và đưa vào hàng đợi `job-recommendation`. Phản hồi gồm `message` và `metrics` (chỉ số hàng đợi). Gọi nhiều lần sẽ đưa nhiều lượt gợi ý vào hàng đợi; chưa xác minh có chống gửi trùng không.

## Chi tiết từng route

### `POST /api/v1/mail/send-job-recommendations`

Kích hoạt tay việc gửi gợi ý việc làm cho mọi người đăng ký (quản trị viên)

- **Auth:** Đăng nhập, vai trò: SUPER ADMIN
- **Handler:** `triggerJobRecommendations` trong [mail.controller.ts](../../../src/mail/mail.controller.ts)
- **Mã thành công:** 201, `message` = "Job recommendation task queued successfully"
