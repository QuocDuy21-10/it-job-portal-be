import { Injectable } from '@nestjs/common';
import { Response } from 'express';
import { AuthRegisterDto } from './dto/auth-register.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { SetPasswordDto } from './dto/set-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyAuthDto } from './dto/verify-auth.dto';
import { IJwtAccessPayload, IJwtRefreshPayload } from './interfaces/jwt-payload.interface';
import { RequestAccountDeletionDto } from './dto/request-account-deletion.dto';
import { IUser } from 'src/users/user.interface';
import { AuthCredentialsService } from './services/auth-credentials.service';
import { AuthVerificationService } from './services/auth-verification.service';
import { AuthSessionService } from './services/auth-session.service';
import { AuthGoogleService } from './services/auth-google.service';
import { AuthAccountDeletionService } from './services/auth-account-deletion.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly authCredentialsService: AuthCredentialsService,
    private readonly authVerificationService: AuthVerificationService,
    private readonly authSessionService: AuthSessionService,
    private readonly authGoogleService: AuthGoogleService,
    private readonly authAccountDeletionService: AuthAccountDeletionService,
  ) {}

  hashPassword(password: string) {
    return this.authCredentialsService.hashPassword(password);
  }

  async validateUser(email: string, password: string): Promise<any> {
    return this.authCredentialsService.validateUser(email, password);
  }

  async register(registerUserDto: AuthRegisterDto) {
    return this.authCredentialsService.register(registerUserDto);
  }

  async sendVerificationCode(user: any): Promise<void> {
    return this.authVerificationService.sendVerificationCode(user);
  }

  async verifyEmail(dto: VerifyAuthDto) {
    return this.authVerificationService.verifyEmail(dto);
  }

  async resendCode(email: string) {
    return this.authVerificationService.resendCode(email);
  }

  async login(user: IUser, response: Response, ipAddress: string, userAgent: string) {
    return this.authSessionService.login(user, response, ipAddress, userAgent);
  }

  createAccessToken(payload: IJwtAccessPayload): string {
    return this.authSessionService.createAccessToken(payload);
  }

  createRefreshToken(payload: IJwtRefreshPayload): string {
    return this.authSessionService.createRefreshToken(payload);
  }

  async refreshAccessToken(
    oldRefreshToken: string,
    response: Response,
    user: IUser,
    userAgent: string,
    ipAddress: string,
  ) {
    return this.authSessionService.refreshAccessToken(
      oldRefreshToken,
      response,
      user,
      userAgent,
      ipAddress,
    );
  }

  async logout(response: Response, refreshToken: string) {
    return this.authSessionService.logout(response, refreshToken);
  }

  async logoutAllDevices(response: Response, userId: string) {
    return this.authSessionService.logoutAllDevices(response, userId);
  }

  async getActiveSessions(userId: string) {
    return this.authSessionService.getActiveSessions(userId);
  }

  async googleLogin(idToken: string, response: Response) {
    return this.authGoogleService.googleLogin(idToken, response);
  }

  async changePassword(user: IUser, changePasswordDto: ChangePasswordDto) {
    return this.authCredentialsService.changePassword(user, changePasswordDto);
  }

  async setPassword(user: IUser, setPasswordDto: SetPasswordDto) {
    return this.authCredentialsService.setPassword(user, setPasswordDto);
  }

  async forgotPassword(forgotPasswordDto: ForgotPasswordDto) {
    return this.authCredentialsService.forgotPassword(forgotPasswordDto);
  }

  async resetPassword(resetPasswordDto: ResetPasswordDto) {
    return this.authCredentialsService.resetPassword(resetPasswordDto);
  }

  async requestAccountDeletion(
    currentUser: IUser,
    dto: RequestAccountDeletionDto,
    response: Response,
  ): Promise<{ message: string; scheduledDeletionAt: Date }> {
    return this.authAccountDeletionService.requestAccountDeletion(currentUser, dto, response);
  }

  async cancelAccountDeletion(userId: string): Promise<{ message: string }> {
    return this.authAccountDeletionService.cancelAccountDeletion(userId);
  }

  async cancelAccountDeletionByToken(token: string): Promise<{ message: string }> {
    return this.authAccountDeletionService.cancelAccountDeletionByToken(token);
  }
}
