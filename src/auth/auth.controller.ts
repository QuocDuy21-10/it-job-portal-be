import { Body, Controller, Get, HttpStatus, Post, Req, Res, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { Public, ResponseMessage, User } from 'src/decorator/customize';
import { LocalAuthGuard } from './local-auth.guard';
import { Request, Response } from 'express';
import { IUser } from 'src/users/users.interface';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
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
  handleLogin(@Req() req, @Res({ passthrough: true }) response: Response) {
    return this.authService.login(req.user, response);
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

  @Get('/me')
  @ApiOperation({
    summary: 'Get information of the current user',
    description: 'Get information of the current user.',
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
    summary: 'Refresh access token (Public API)',
    description: 'API to refresh access token using refresh token (stored in httpOnly cookie).',
  })
  @Get('/refresh')
  @ResponseMessage('Get new access token successfully')
  handleRefreshToken(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const refreshToken = request.cookies['refresh_token'];
    return this.authService.refreshAccessToken(refreshToken, response);
  }

  @Post('/logout')
  @ApiOperation({
    summary: 'Logout',
    description: 'API to logout and clear cookies.',
  })
  @ResponseMessage('Logout successfully')
  handleLogout(@Res({ passthrough: true }) response: Response, @User() user: IUser) {
    return this.authService.logout(response, user);
  }
}
