import { Injectable, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Observable } from 'rxjs';

/**
 * JWT Refresh Token Guard
 * 
 * Sử dụng JwtRefreshStrategy để xác thực refresh token từ cookie
 * 
 * Usage:
 * @UseGuards(JwtRefreshGuard)
 * @Post('refresh')
 * async refresh(@Req() req, @Res() res) {
 *   // req.user đã được populate bởi JwtRefreshStrategy
 *   return this.authService.refreshAccessToken(...);
 * }
 */
@Injectable()
export class JwtRefreshGuard extends AuthGuard('jwt-refresh') {
  /**
   * Override canActivate để thêm custom error handling
   */
  canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
    return super.canActivate(context);
  }

  /**
   * Override handleRequest để customize error messages
   */
  handleRequest(err: any, user: any, info: any) {
    // Nếu có lỗi hoặc không có user → throw UnauthorizedException
    if (err || !user) {
      throw err || new UnauthorizedException('Refresh token không hợp lệ hoặc đã hết hạn');
    }
    return user;
  }
}
