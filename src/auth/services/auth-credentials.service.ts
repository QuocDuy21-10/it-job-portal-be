import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject } from '@nestjs/common';
import { Cache } from 'cache-manager';
import { MailerService } from '@nestjs-modules/mailer';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { AuthRegisterDto } from '../dto/auth-register.dto';
import { ChangePasswordDto } from '../dto/change-password.dto';
import { ForgotPasswordDto } from '../dto/forgot-password.dto';
import { ResetPasswordDto } from '../dto/reset-password.dto';
import { SetPasswordDto } from '../dto/set-password.dto';
import { IUser } from 'src/users/user.interface';
import { UsersService } from 'src/users/users.service';
import { SessionsService } from 'src/sessions/sessions.service';
import { AuthVerificationService } from './auth-verification.service';

@Injectable()
export class AuthCredentialsService {
  constructor(
    private readonly usersService: UsersService,
    private readonly sessionsService: SessionsService,
    private readonly configService: ConfigService,
    private readonly mailerService: MailerService,
    private readonly authVerificationService: AuthVerificationService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  hashPassword(password: string): string {
    const salt = bcrypt.genSaltSync(10);
    return bcrypt.hashSync(password, salt);
  }

  async validateUser(email: string, password: string): Promise<any> {
    const user = await this.usersService.findOneByUserEmail(email);
    if (user) {
      if (!user.password) {
        throw new BadRequestException(
          'Tài khoản này đăng ký qua Google. Vui lòng đăng nhập bằng Google hoặc thiết lập mật khẩu.',
        );
      }

      const isValid = this.usersService.isValidPassword(password, user.password);
      if (isValid) {
        if (!user.isActive) {
          throw new BadRequestException('Tài khoản chưa được kích hoạt. Vui lòng kiểm tra email.');
        }
        if (user.isLocked) {
          throw new UnauthorizedException('Tài khoản đã bị khóa. Vui lòng liên hệ admin.');
        }

        return {
          ...user.toObject(),
        };
      }
    }

    return null;
  }

  async register(registerUserDto: AuthRegisterDto) {
    const { email } = registerUserDto;

    const existingUser = await this.usersService.findUserByEmail(email);
    if (existingUser && existingUser.isActive) {
      throw new BadRequestException('Email đã tồn tại');
    }

    let newUser: any;
    if (existingUser && !existingUser.isActive) {
      newUser = await this.usersService.updateUnverifiedUser(
        existingUser._id.toString(),
        registerUserDto,
      );
    } else {
      newUser = await this.usersService.register(registerUserDto);
    }

    await this.authVerificationService.sendVerificationCode(newUser);

    return {
      _id: newUser?._id,
      createdAt: newUser?.createdAt,
      message: 'Vui lòng kiểm tra email để kích hoạt tài khoản',
    };
  }

  async changePassword(user: IUser, changePasswordDto: ChangePasswordDto) {
    const { currentPassword, newPassword } = changePasswordDto;

    const userInDb = await this.usersService.findOneByUserEmail(user.email);
    if (!userInDb) throw new BadRequestException('User not found');

    if (!userInDb.password) {
      throw new BadRequestException(
        'Tài khoản này chưa có mật khẩu. Vui lòng sử dụng chức năng tạo mật khẩu.',
      );
    }

    const isValid = this.usersService.isValidPassword(currentPassword, userInDb.password);
    if (!isValid) {
      throw new BadRequestException('Mật khẩu hiện tại không chính xác');
    }

    const newPasswordHash = this.hashPassword(newPassword);
    await this.usersService.updatePassword(userInDb._id.toString(), newPasswordHash);
    await this.sessionsService.deleteAllUserSessions(userInDb._id.toString());

    return { message: 'Đổi mật khẩu thành công. Vui lòng đăng nhập lại.' };
  }

  async setPassword(user: IUser, setPasswordDto: SetPasswordDto) {
    const { newPassword } = setPasswordDto;

    const userInDb = await this.usersService.findOneByUserEmail(user.email);
    if (!userInDb) throw new BadRequestException('User not found');

    if (userInDb.password) {
      throw new BadRequestException(
        'Tài khoản đã có mật khẩu. Vui lòng sử dụng chức năng đổi mật khẩu.',
      );
    }

    const newPasswordHash = this.hashPassword(newPassword);
    await this.usersService.updatePassword(userInDb._id.toString(), newPasswordHash);
    await this.sessionsService.deleteAllUserSessions(userInDb._id.toString());

    return { message: 'Tạo mật khẩu thành công. Vui lòng đăng nhập lại.' };
  }

  async forgotPassword(forgotPasswordDto: ForgotPasswordDto) {
    const { email } = forgotPasswordDto;
    const user = await this.usersService.findUserByEmail(email);

    if (!user) {
      return { message: 'Nếu email tồn tại, bạn sẽ nhận được hướng dẫn đặt lại mật khẩu.' };
    }

    const token = uuidv4();
    await this.cacheManager.set(`reset_password:${token}`, email, 600000);

    const url = `${this.configService.get<string>('FE_URL')}/reset-password?token=${token}&email=${email}`;

    this.mailerService.sendMail({
      to: email,
      subject: 'Reset Password Request',
      template: 'forgot-password',
      context: {
        name: user.name,
        url,
        currentYear: new Date().getFullYear(),
      },
    });

    return { message: 'Nếu email tồn tại, bạn sẽ nhận được hướng dẫn đặt lại mật khẩu.' };
  }

  async resetPassword(resetPasswordDto: ResetPasswordDto) {
    const { token, email, newPassword } = resetPasswordDto;

    const emailStored = await this.cacheManager.get<string>(`reset_password:${token}`);
    if (!emailStored || emailStored !== email) {
      throw new BadRequestException('Token không hợp lệ hoặc đã hết hạn');
    }

    const user = await this.usersService.findUserByEmail(email);
    if (!user) throw new BadRequestException('User not found');

    const newPasswordHash = this.hashPassword(newPassword);
    await this.usersService.updatePassword(user._id.toString(), newPasswordHash);
    await this.cacheManager.del(`reset_password:${token}`);

    return { message: 'Đặt lại mật khẩu thành công' };
  }
}
