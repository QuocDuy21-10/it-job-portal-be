import { BadRequestException, ForbiddenException, UnauthorizedException } from '@nestjs/common';

interface AuthenticatedAccountState {
  isActive?: boolean;
  isLocked?: boolean;
  isDeleted?: boolean;
  scheduledDeletionAt?: Date | null;
}

type AuthStateContext = 'login' | 'access' | 'refresh';

export function assertAuthenticatedAccountState(
  user: AuthenticatedAccountState,
  context: AuthStateContext = 'login',
): void {
  if (!user.isActive) {
    if (context === 'login') {
      throw new BadRequestException('Tài khoản chưa được kích hoạt. Vui lòng kiểm tra email.');
    }

    if (context === 'refresh') {
      throw new UnauthorizedException('Tài khoản đã bị vô hiệu hóa. Không thể refresh token.');
    }

    throw new UnauthorizedException('Tài khoản đã bị vô hiệu hóa. Vui lòng liên hệ admin.');
  }

  if (user.isLocked) {
    throw new UnauthorizedException('Tài khoản đã bị khóa. Vui lòng liên hệ admin.');
  }

  if (user.isDeleted) {
    throw new UnauthorizedException('Tài khoản đã bị xóa. Token không hợp lệ.');
  }

  if (user.scheduledDeletionAt && new Date(user.scheduledDeletionAt) > new Date()) {
    throw new ForbiddenException(
      'Tài khoản đang chờ bị xóa. Vui lòng hủy yêu cầu xóa tài khoản để đăng nhập lại.',
    );
  }
}
