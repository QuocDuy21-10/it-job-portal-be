# Module Authorization (CASL)

## Overview

`src/casl/` chứa enum vai trò, `RolesGuard`, decorator `@Roles`, và phần CASL (ma trận quyền, `PoliciesGuard`, `@CheckPolicies`). Vai trò và kết luận về quyền thực tế nằm ở [user-roles](../01-product/user-roles.md); tài liệu này mô tả phần cài đặt.

## Responsibilities

| Thành phần | File | Có hiệu lực trên route? |
|---|---|---|
| `ERole`, `EAction` | [enums/](../../src/casl/enums/) | Có (kiểu dữ liệu) |
| `RolesGuard` | [roles.guard.ts](../../src/casl/guards/roles.guard.ts) | **Có**, đăng ký toàn cục |
| `@Roles(...)` | [roles.decorator.ts](../../src/casl/decorators/roles.decorator.ts) | **Có**, 41 route dùng |
| `CaslAbilityFactory` | [casl-ability.factory.ts](../../src/casl/casl-ability.factory.ts) | **Không**, không nơi nào gọi `createForUser` ngoài module |
| `PoliciesGuard`, `@CheckPolicies` | [policies.guard.ts](../../src/casl/guards/policies.guard.ts) | **Không**, không controller nào dùng, không đăng ký toàn cục |

## Architecture

`RolesGuard` đọc metadata `ROLES_KEY` từ handler và class bằng `getAllAndOverride`. Không có `@Roles` thì cho qua. Có thì so `user.role` với danh sách. Nó chạy sau `JwtAuthGuard` nên `request.user` đã có ([app.setup.ts](../../src/app.setup.ts)).

`PoliciesGuard` đọc `CHECK_POLICIES_KEY`, tạo `Ability` cho người dùng bằng `CaslAbilityFactory` rồi chạy từng handler. Cơ chế hoàn chỉnh, nhưng chưa được nối vào route nào.

## Business Rules (ma trận CASL đã khai báo)

Ma trận này **không được thực thi**, ghi lại để biết ý định thiết kế:

| Chủ thể (`ESubject`) | `SUPER ADMIN` | `HR` | `NORMAL USER` |
|---|---|---|---|
| tất cả | `manage` | — | — |
| `Job` | `manage` | create, read, update, delete | read |
| `Company` | `manage` | read, update | read |
| `Resume` | `manage` | read, update, delete | create, read |
| `CvProfile`, `Chat`, `Subscriber`, `Notification`, `File` | `manage` | `manage` | `manage` (`CvProfile`, `Chat`, `Subscriber`, `Notification`, `File`) |
| `Statistic` | `manage` | read | — |

`ESubject` còn khai báo `'Role'` và `'Permission'` nhưng không có collection hay module tương ứng.

## Known Limitation

- **CASL không có tác dụng thực tế.** Thêm hoặc sửa quy tắc trong `CaslAbilityFactory` không đổi quyền của bất kỳ route nào. Muốn dùng, phải gắn `@UseGuards(PoliciesGuard)` cùng `@CheckPolicies(...)` hoặc đăng ký guard toàn cục. Trạng thái: đã `grep`, xem [user-roles](../01-product/user-roles.md#known-limitation-casl-được-định-nghĩa-nhưng-không-thực-thi).
- Quy tắc sở hữu (HR chỉ sửa công ty mình) nằm rải rác trong service, không tập trung ở CASL.
- `src/roles/` chỉ còn thư mục rỗng sau khi entity `Role` bị bỏ, xem [ADR-0002](../12-decisions/0002-roles-as-enum.md) và [project-structure](../00-getting-started/project-structure.md#known-limitation-thư-mục-còn-sót). `ESubject` còn giữ `'Role'` và `'Permission'` là dấu vết của cấu trúc đó.

## Testing

`src/casl/` không có file test. `RolesGuard` không có test riêng và 4 kịch bản e2e hiện chưa kiểm tra `@Roles` ([testing-strategy](../10-testing/testing-strategy.md)).

## Source References

[src/casl/](../../src/casl/), [app.setup.ts](../../src/app.setup.ts).
