import { Body, Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { Public, ResponseMessage, User } from 'src/decorator/customize';
import { LocalAuthGuard } from './local-auth.guard';
import { RegisterUserDto } from 'src/users/dto/create-user.dto';
import { Request, Response } from 'express';
import { IUser } from 'src/users/users.interface';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}
  @Public()
  @UseGuards(LocalAuthGuard)
  @Post('/login')
  @ResponseMessage('Login successfully')
  handleLogin(@Req() req, @Res({ passthrough: true }) response: Response) {
    return this.authService.login(req.user, response);
  }

  @Public()
  @Post('/register')
  @ResponseMessage('Register a new user successfully')
  handleRegister(@Body() RegisterUserDto: RegisterUserDto) {
    return this.authService.register(RegisterUserDto);
  }

  @Get('/account')
  @ResponseMessage('Get user information successfully')
  handleGetAccount(@User() user: IUser) {
    return { user };
  }

  @Public()
  @Get('/refresh')
  @ResponseMessage('Get new access token successfully')
  handleRefreshToken(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const refreshToken = request.cookies['refresh_token'];
    return this.authService.refreshAccessToken(refreshToken, response);
  }

  @Post('/logout')
  @ResponseMessage('Logout successfully')
  handleLogout(@Res({ passthrough: true }) response: Response, @User() user: IUser) {
    return this.authService.logout(response, user);
  }
}
