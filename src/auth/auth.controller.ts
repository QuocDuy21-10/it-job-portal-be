import { Body, Controller, Get, HttpStatus, Post, Req, Res, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { Public, ResponseMessage, User } from 'src/decorator/customize';
import { LocalAuthGuard } from './local-auth.guard';
import { Request, Response } from 'express';
import { IUser } from 'src/users/users.interface';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { RolesService } from 'src/roles/roles.service';
import { ThrottlerGuard } from '@nestjs/throttler';
import { AuthRegisterDto } from './dto/auth-register.dto';
import { AuthEmailLoginDto } from './dto/auth-email-login.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private rolesService: RolesService,
  ) {}

  @Public()
  @UseGuards(LocalAuthGuard)
  @UseGuards(ThrottlerGuard)
  @ApiOperation({
    summary: 'Đăng nhập',
    description:
      'Đăng nhập với email và mật khẩu để nhận access_token và thông tin user và permission.',
  })
  @ApiBody({ type: AuthEmailLoginDto })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Đăng nhập thành công. Trả về access_token và thông tin user và permission.',
    type: AuthEmailLoginDto,
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Sai email hoặc mật khẩu.',
  })
  @ApiResponse({
    status: HttpStatus.TOO_MANY_REQUESTS,
    description: 'Bạn đã request quá nhanh, vui lòng thử lại sau.',
  })
  @Post('/login')
  @ResponseMessage('Login successfully')
  handleLogin(@Req() req, @Res({ passthrough: true }) response: Response) {
    return this.authService.login(req.user, response);
  }

  @Public()
  @ApiOperation({
    summary: 'Đăng ký người dùng mới',
    description: 'Đăng ký người dùng mới với email và mật khẩu.',
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Register a new user successfully. Trả về thông tin user: id va thời gian tạo.',
  })
  @ResponseMessage('Register a new user successfully')
  @Post('/register')
  handleRegister(@Body() AuthRegisterDto: AuthRegisterDto) {
    return this.authService.register(AuthRegisterDto);
  }

  @Get('/me')
  @ApiOperation({
    summary: 'Lấy thông tin tài khoản đang đăng nhập',
    description: 'Lấy thông tin tài khoản đang đăng nhập.',
  })
  @ApiBearerAuth()
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Get user information successfully',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Chưa đăng nhập hoặc token không hợp lệ.',
  })
  @ResponseMessage('Get user information successfully')
  async handleGetAccount(@User() user: IUser) {
    // query database to get permissions
    const tempRole = (await this.rolesService.findOne(user.role._id)) as any;
    user.permissions = tempRole.permissions;
    return { user };
  }

  @Public()
  @ApiOperation({
    summary: 'Làm mới access token',
    description:
      'API này sử dụng refresh_token (lưu trong httpOnly cookie) để cấp access_token mới.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Get new access token successfully',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Refresh token không hợp lệ hoặc đã hết hạn.',
  })
  @Get('/refresh')
  @ResponseMessage('Get new access token successfully')
  handleRefreshToken(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const refreshToken = request.cookies['refresh_token'];
    return this.authService.refreshAccessToken(refreshToken, response);
  }

  @Post('/logout')
  @ApiOperation({
    summary: 'Đăng xuất',
    description: 'Đăng xuất và xóa refresh token khỏi cookie.',
  })
  @ApiBearerAuth()
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Logout successfully',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Chưa đăng nhập hoặc token không hợp lệ.',
  })
  @ResponseMessage('Logout successfully')
  handleLogout(@Res({ passthrough: true }) response: Response, @User() user: IUser) {
    return this.authService.logout(response, user);
  }
}
