import { Body, Controller, Get, HttpStatus, Ip, Post, Req, Res, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { Public, ResponseMessage, User } from 'src/decorator/customize';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { Request, Response } from 'express';
import { IUser } from 'src/users/users.interface';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { AuthRegisterDto } from './dto/auth-register.dto';
import { AuthEmailLoginDto } from './dto/auth-email-login.dto';
import { AuthGoogleLoginDto } from './dto/auth-google-login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyAuthDto } from './dto/verify-auth.dto';
import { AuthGuard } from '@nestjs/passport';
import { UsersService } from 'src/users/users.service';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private usersService: UsersService,
  ) {}

  @Public()
  @UseGuards(LocalAuthGuard)
  @UseGuards(ThrottlerGuard)
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
  @ResponseMessage('Login successfully')
  handleLogin(@Req() req: Request, @Res({ passthrough: true }) response: Response, @Ip() ip: string) {
    const userAgent = req.headers['user-agent'] || 'Unknown Device';
    const ipAddress = ip || req.ip || 'Unknown IP';
    return this.authService.login(req.user as any, response, ipAddress, userAgent);
  }

  @Public()
  @ApiOperation({
    summary: 'Register a new user',
    description: 'Register a new user with email and password.',
  })
  @ResponseMessage('Register a new user successfully')
  @Post('/register')
  handleRegister(@Body() AuthRegisterDto: AuthRegisterDto) {
    return this.authService.register(AuthRegisterDto);
  }


  @Post('verify')
  @Public()
  @ApiOperation({
    summary: 'Verify account',
    description: 'Verify user account using verification code sent to email. Typically used after registration or requesting a new code.'
  })
  @ApiBody({ type: VerifyAuthDto, description: 'Verification payload containing user id and code.' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Account verified successfully.',
    schema: {
      example: {
        statusCode: 200,
        message: 'Verify account successfully',
        data: {
          user: {
            _id: 'string',
            email: 'user@example.com',
            // ...other user fields
          }
        }
      }
    }
  })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Invalid or expired code.' })
  @ResponseMessage('Verify account successfully')
  handleVerify(@Body() verifyAuthDto: VerifyAuthDto) {
    return this.authService.verifyEmail(verifyAuthDto);
  }


  @Post('resend-code')
  @Public()
  @ApiOperation({
    summary: 'Resend verification code',
    description: 'Resend a new verification code to the user\'s email. Used if the previous code expired or was not received.'
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'User ID to resend code for.' }
      },
      required: ['id'],
      example: { id: 'userId123' }
    }
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Verification code resent successfully.',
    schema: {
      example: {
        statusCode: 200,
        message: 'Resend code successfully',
        data: true
      }
    }
  })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'User not found or already verified.' })
  @ResponseMessage('Resend code successfully')
  handleResendCode(@Body('id') id: string) {
    return this.authService.resendCode(id);
  }

  @Public()
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
  @ResponseMessage('Google login successfully')
  @Post('/google/login')
  handleGoogleLogin(
    @Body() authGoogleLoginDto: AuthGoogleLoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) response: Response,
    @Ip() ip: string,
  ) {
    const userAgent = req.headers['user-agent'] || 'Google Login';
    const ipAddress = ip || req.ip || 'Unknown IP';
    // Tạm thời chưa truyền userAgent và ip vào googleLogin, sẽ cần refactor tiếp
    return this.authService.googleLogin(authGoogleLoginDto.idToken, response);
  }

  /**
   * PRODUCTION PATTERN:
   * - LUÔN query DB để lấy Fresh Data (name, role, permissions có thể thay đổi)
   * - Validate user isActive, isDeleted
   * - 1 query duy nhất với populate tối ưu
   * - Loại bỏ query thừa (không gọi rolesService.findOne nữa)
   * 
   * LUỒNG HOẠT ĐỘNG:
   * 1. JwtStrategy validate token → req.user = {_id: userId}
   * 2. Controller nhận userId từ @User() decorator
   * 3. Gọi usersService.findUserProfile(userId)
   * 4. Return complete IUser object với permissions mới nhất
   */
  @Get('/me')
  @ApiOperation({
    summary: 'Get Current User Profile',
    description: 'Get full user profile with fresh data from database (name, role, permissions, company, savedJobs, companyFollowed)',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'User profile retrieved successfully with latest data',
  })
  @ResponseMessage('Get user information successfully')
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
  @ResponseMessage('Get new access token successfully')
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
  @ResponseMessage('Logout successfully')
  handleLogout(@Req() req: Request, @Res({ passthrough: true }) response: Response) {
    const refreshToken = req.cookies['refresh_token'];
    return this.authService.logout(response, refreshToken);
  }

  @Post('/logout-all')
  @ApiOperation({
    summary: 'Logout All Devices',
    description: 'Logout from all devices. Deletes all sessions of the user.',
  })
  @ResponseMessage('Logged out from all devices successfully')
  handleLogoutAll(@User() user: IUser, @Res({ passthrough: true }) response: Response) {
    return this.authService.logoutAllDevices(response, user._id);
  }

  @Get('/sessions')
  @ApiOperation({
    summary: 'Get Active Sessions',
    description: 'Get all active sessions (devices) of the current user.',
  })
  @ResponseMessage('Get active sessions successfully')
  async getActiveSessions(@User() user: IUser) {
    return this.authService.getActiveSessions(user._id);
  }

  @Post('change-password')
  @ApiOperation({ summary: 'Change Password' })
  @ResponseMessage('Change password successfully')
  async changePassword(@User() user: IUser, @Body() changePasswordDto: ChangePasswordDto) {
    return this.authService.changePassword(user, changePasswordDto);
  }

  @Public()
  @UseGuards(ThrottlerGuard)
  @Post('forgot-password')
  @ApiOperation({ summary: 'Forgot Password (Request OTP/Link)' })
  @ResponseMessage('Request process successfully')
  async forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto) {
    return this.authService.forgotPassword(forgotPasswordDto);
  }

  @Public()
  @Post('reset-password')
  @ApiOperation({ summary: 'Reset Password (Confirm)' })
  @ResponseMessage('Reset password successfully')
  async resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    return this.authService.resetPassword(resetPasswordDto);
  }
}
