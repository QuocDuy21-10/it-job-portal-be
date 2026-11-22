import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Ip,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { Public } from 'src/utils/decorators/public.decorator';
import { ResponseMessage } from 'src/utils/decorators/response-message.decorator';
import { User } from 'src/utils/decorators/user.decorator';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { Request, Response } from 'express';
import { IUser } from 'src/users/user.interface';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { STRICT_THROTTLE } from 'src/config/throttle.constants';
import { AuthRegisterDto } from './dto/auth-register.dto';
import { AuthEmailLoginDto } from './dto/auth-email-login.dto';
import { AuthGoogleLoginDto } from './dto/auth-google-login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { SetPasswordDto } from './dto/set-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResendCodeDto } from './dto/resend-code.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyAuthDto } from './dto/verify-auth.dto';
import { AuthGuard } from '@nestjs/passport';
import { UsersService } from 'src/users/users.service';
import { RequestAccountDeletionDto } from './dto/request-account-deletion.dto';
import { CancelDeletionByTokenDto } from './dto/cancel-deletion-by-token.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private usersService: UsersService,
  ) {}

  @Public()
  @UseGuards(LocalAuthGuard)
  @Throttle({ default: { ttl: 300000, limit: 10 } })
  @ApiOperation({
    summary: 'Login',
    description:
      'Login with email and password to receive an access token and user information and permissions.',
  })
  @ApiBody({ type: AuthEmailLoginDto })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Login successful. Return access token and user information and permissions.',
    type: AuthEmailLoginDto,
  })
  @Post('/login')
  @ResponseMessage('Đăng nhập thành công')
  handleLogin(
    @Req() req: Request,
    @Res({ passthrough: true }) response: Response,
    @Ip() ip: string,
  ) {
    const userAgent = req.headers['user-agent'] || 'Unknown Device';
    const ipAddress = ip || req.ip || 'Unknown IP';
    return this.authService.login(req.user as any, response, ipAddress, userAgent);
  }

  @Public()
  @Throttle({ default: { ttl: 3600000, limit: 5 } })
  @ApiOperation({
    summary: 'Register a new user',
    description: 'Register a new user with email and password.',
  })
  @ResponseMessage('Đăng ký tài khoản thành công')
  @Post('/register')
  handleRegister(@Body() AuthRegisterDto: AuthRegisterDto) {
    return this.authService.register(AuthRegisterDto);
  }

  @Post('verify')
  @Public()
  @Throttle({ default: { ttl: 300000, limit: 10 } })
  @ApiOperation({
    summary: 'Verify account',
    description:
      'Verify user account using verification code sent to email. Typically used after registration or requesting a new code.',
  })
  @ApiBody({
    type: VerifyAuthDto,
    description: 'Verification payload containing user id and code.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Account verified successfully.',
    schema: {
      example: {
        statusCode: 200,
        message: 'Kích hoạt tài khoản thành công',
        data: {
          user: {
            _id: 'string',
            email: 'user@example.com',
            // ...other user fields
          },
        },
      },
    },
  })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Invalid or expired code.' })
  @ResponseMessage('Kích hoạt tài khoản thành công')
  handleVerify(@Body() verifyAuthDto: VerifyAuthDto) {
    return this.authService.verifyEmail(verifyAuthDto);
  }

  @Post('resend-code')
  @Public()
  @Throttle({ default: { ttl: 300000, limit: 5 } })
  @ApiOperation({
    summary: 'Resend verification code',
    description:
      "Resend a new verification code to the user's email. Used if the previous code expired or was not received.",
  })
  @ApiBody({ type: ResendCodeDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Verification code resent successfully.',
    schema: {
      example: {
        statusCode: 200,
        message: 'Gửi lại mã xác thực thành công',
        data: true,
      },
    },
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'User not found or already verified.',
  })
  @ResponseMessage('Gửi lại mã xác thực thành công')
  handleResendCode(@Body() dto: ResendCodeDto) {
    return this.authService.resendCode(dto.email);
  }

  @Public()
  @Throttle({ default: { ttl: 300000, limit: 10 } })
  @ApiOperation({
    summary: 'Login with Google',
    description:
      'Authenticate using Google ID token. Verifies token, creates or logs in user, and returns JWT access token.',
  })
  @ApiBody({ type: AuthGoogleLoginDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Google login successful. Returns access token and user information.',
  })
  @ResponseMessage('Đăng nhập bằng Google thành công')
  @Post('/google/login')
  handleGoogleLogin(
    @Body() authGoogleLoginDto: AuthGoogleLoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.authService.googleLogin(authGoogleLoginDto.idToken, response);
  }

  @Get('/me')
  @ApiOperation({
    summary: 'Get Current User Profile',
    description:
      'Get full user profile with fresh data from database (name, role, permissions, company, savedJobs, companyFollowed)',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'User profile retrieved successfully with latest data',
  })
  @ResponseMessage('Lấy thông tin người dùng thành công')
  async handleGetAccount(@User() user: { _id: string }) {
    const userProfile = await this.usersService.findUserProfile(user._id);
    return { user: userProfile };
  }

  @Public()
  @UseGuards(AuthGuard('jwt-refresh'))
  @ApiOperation({
    summary: 'Refresh access token (Public API)',
    description: 'API to refresh access token using refresh token (stored in httpOnly cookie).',
  })
  @Get('/refresh')
  @ResponseMessage('Cấp access token mới thành công')
  handleRefreshToken(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @User() user: IUser,
    @Ip() ip: string,
  ) {
    const refreshToken = request.cookies['refresh_token'];
    const userAgent = request.headers['user-agent'] || 'Unknown Device';
    const ipAddress = ip || request.ip || 'Unknown IP';
    return this.authService.refreshAccessToken(refreshToken, response, user, userAgent, ipAddress);
  }

  @Post('/logout')
  @ApiOperation({
    summary: 'Logout (Current Device)',
    description: 'Logout from current device. Deletes current session and clears cookie.',
  })
  @ResponseMessage('Đăng xuất thành công')
  handleLogout(
    @Req() req: Request,
    @Res({ passthrough: true }) response: Response,
    @User() user: IUser,
  ) {
    const refreshToken = req.cookies['refresh_token'];
    return this.authService.logout(response, refreshToken, user);
  }

  @Post('/logout-all')
  @ApiOperation({
    summary: 'Logout All Devices',
    description: 'Logout from all devices. Deletes all sessions of the user.',
  })
  @ResponseMessage('Đã đăng xuất khỏi tất cả thiết bị')
  handleLogoutAll(@User() user: IUser, @Res({ passthrough: true }) response: Response) {
    return this.authService.logoutAllDevices(response, user._id);
  }

  @Get('/sessions')
  @ApiOperation({
    summary: 'Get Active Sessions',
    description: 'Get all active sessions (devices) of the current user.',
  })
  @ResponseMessage('Lấy danh sách phiên đăng nhập thành công')
  async getActiveSessions(@User() user: IUser) {
    return this.authService.getActiveSessions(user._id);
  }

  @Post('change-password')
  @Throttle({ default: { ttl: 300000, limit: 5 } })
  @ApiOperation({ summary: 'Change Password' })
  @ResponseMessage('Đổi mật khẩu thành công')
  async changePassword(
    @User() user: IUser,
    @Body() changePasswordDto: ChangePasswordDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.changePassword(user, changePasswordDto);
    response.clearCookie('refresh_token');
    return result;
  }

  @Post('set-password')
  @Throttle({ default: { ttl: 300000, limit: 5 } })
  @ApiOperation({ summary: 'Set Password (for OAuth users without a password)' })
  @ResponseMessage('Tạo mật khẩu thành công')
  async setPassword(
    @User() user: IUser,
    @Body() setPasswordDto: SetPasswordDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.setPassword(user, setPasswordDto);
    response.clearCookie('refresh_token');
    return result;
  }

  @Public()
  @Throttle(STRICT_THROTTLE)
  @Post('forgot-password')
  @ApiOperation({ summary: 'Forgot Password (Request OTP/Link)' })
  @ResponseMessage('Đã tiếp nhận yêu cầu')
  async forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto) {
    return this.authService.forgotPassword(forgotPasswordDto);
  }

  @Public()
  @Throttle({ default: { ttl: 300000, limit: 5 } })
  @Post('reset-password')
  @ApiOperation({ summary: 'Reset Password (Confirm)' })
  @ResponseMessage('Đặt lại mật khẩu thành công')
  async resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    return this.authService.resetPassword(resetPasswordDto);
  }

  @Delete('account')
  @Throttle({ default: { ttl: 3600000, limit: 3 } })
  @ApiOperation({
    summary: 'Request Account Deletion',
    description:
      'Schedule permanent account deletion after a 30-day grace period. Revokes all sessions immediately. Local accounts must supply their current password for verification.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Deletion scheduled. Returns the scheduled deletion date.',
    schema: {
      example: {
        statusCode: 200,
        message: 'Đã lên lịch xoá tài khoản',
        data: {
          message: 'Tài khoản của bạn sẽ bị xoá vào ngày ...',
          scheduledDeletionAt: '2026-05-19T00:00:00.000Z',
        },
      },
    },
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'A deletion is already pending.',
  })
  @ResponseMessage('Đã lên lịch xoá tài khoản')
  async requestAccountDeletion(
    @User() user: IUser,
    @Body() dto: RequestAccountDeletionDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.authService.requestAccountDeletion(user, dto, response);
  }

  @Post('account/cancel-deletion')
  @Throttle({ default: { ttl: 300000, limit: 5 } })
  @ApiOperation({
    summary: 'Cancel Account Deletion',
    description: 'Cancel a pending account deletion request within the 30-day grace period.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Deletion cancelled. Account is fully active again.',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'No pending deletion found, or grace period has expired.',
  })
  @ResponseMessage('Huỷ yêu cầu xoá tài khoản thành công')
  async cancelAccountDeletion(@User() user: IUser) {
    return this.authService.cancelAccountDeletion(user._id);
  }

  @Public()
  @Post('account/cancel-deletion-by-token')
  @Throttle({ default: { ttl: 300000, limit: 5 } })
  @ApiOperation({
    summary: 'Cancel Account Deletion by Token',
    description:
      'Cancel a pending account deletion using the magic-link token from the confirmation email. No authentication required.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Deletion cancelled. The user can now log in again.',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid/expired token, no pending deletion, or grace period expired.',
  })
  @ResponseMessage('Huỷ yêu cầu xoá tài khoản thành công')
  async cancelAccountDeletionByToken(@Body() dto: CancelDeletionByTokenDto) {
    return this.authService.cancelAccountDeletionByToken(dto.token);
  }
}
