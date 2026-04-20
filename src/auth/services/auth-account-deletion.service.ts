import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject } from '@nestjs/common';
import { Cache } from 'cache-manager';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { MailService } from 'src/mail/mail.service';
import { AccountDeletionQueueService } from 'src/queues/services/account-deletion-queue.service';
import { SessionsService } from 'src/sessions/sessions.service';
import { IUser } from 'src/users/user.interface';
import { UsersService } from 'src/users/users.service';
import { RequestAccountDeletionDto } from '../dto/request-account-deletion.dto';
import { EAuthProvider } from '../enums/auth-provider.enum';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class AuthAccountDeletionService {
  constructor(
    private readonly usersService: UsersService,
    private readonly sessionsService: SessionsService,
    private readonly accountDeletionQueueService: AccountDeletionQueueService,
    private readonly configService: ConfigService,
    private readonly mailService: MailService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  async requestAccountDeletion(
    currentUser: IUser,
    dto: RequestAccountDeletionDto,
    response: Response,
  ): Promise<{ message: string; scheduledDeletionAt: Date }> {
    const GRACE_PERIOD_DAYS = 30;
    const GRACE_PERIOD_MS = GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000;

    const user = await this.usersService.findOneByUserEmail(currentUser.email);
    if (!user) throw new BadRequestException('User not found');

    if (user.scheduledDeletionAt && user.scheduledDeletionAt > new Date()) {
      throw new ConflictException(
        'Account deletion is already pending. Check your email for the scheduled date.',
      );
    }

    if (user.authProvider === EAuthProvider.LOCAL) {
      if (!dto.password) {
        throw new BadRequestException('Password is required to delete a local account.');
      }

      const valid = this.usersService.isValidPassword(dto.password, user.password);
      if (!valid) {
        throw new UnauthorizedException('Incorrect password.');
      }
    }

    const scheduledDeletionAt = new Date(Date.now() + GRACE_PERIOD_MS);
    const userId = user._id.toString();

    await this.usersService.scheduleAccountDeletion(userId, scheduledDeletionAt);
    await this.sessionsService.deleteAllUserSessions(userId);
    response.clearCookie('refresh_token');

    await this.accountDeletionQueueService.addDeletionJob(userId, GRACE_PERIOD_MS);

    const cancelToken = uuidv4();
    await this.cacheManager.set(`cancel_deletion:${cancelToken}`, userId, GRACE_PERIOD_MS);
    await this.cacheManager.set(`cancel_deletion_user:${userId}`, cancelToken, GRACE_PERIOD_MS);

    const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000';
    const cancelUrl = `${frontendUrl}/account/cancel-deletion?token=${cancelToken}`;

    try {
      await this.mailService.sendAccountDeletionScheduled({
        userName: user.name,
        userEmail: user.email,
        scheduledDeletionAt,
        cancelUrl,
      });
    } catch (mailError) {
      const message = mailError instanceof Error ? mailError.message : 'Unknown error';
      console.error('Failed to send account deletion scheduled email:', message);
    }

    return {
      message: `Your account has been scheduled for deletion on ${scheduledDeletionAt.toISOString()}. You can cancel within ${GRACE_PERIOD_DAYS} days.`,
      scheduledDeletionAt,
    };
  }

  async cancelAccountDeletion(userId: string): Promise<{ message: string }> {
    const userDoc = await this.usersService.findOne(userId);
    if (!userDoc) throw new BadRequestException('User not found');

    if (!userDoc.scheduledDeletionAt) {
      throw new BadRequestException('No pending account deletion found.');
    }
    if (userDoc.scheduledDeletionAt < new Date()) {
      throw new BadRequestException(
        'The grace period has expired. The account has already been permanently deleted.',
      );
    }

    await this.accountDeletionQueueService.cancelDeletionJob(userId);
    await this.usersService.cancelAccountDeletion(userId);
    await this.clearCancelDeletionToken(userId);

    return { message: 'Account deletion cancelled successfully. Your account is now active.' };
  }

  async cancelAccountDeletionByToken(token: string): Promise<{ message: string }> {
    const userId = await this.cacheManager.get<string>(`cancel_deletion:${token}`);
    if (!userId) {
      throw new BadRequestException('Invalid or expired cancellation token.');
    }

    const userDoc = await this.usersService.findOne(userId);
    if (!userDoc) throw new BadRequestException('User not found.');

    if (!userDoc.scheduledDeletionAt) {
      await this.clearCancelDeletionToken(userId);
      throw new BadRequestException('No pending account deletion found.');
    }
    if (userDoc.scheduledDeletionAt < new Date()) {
      await this.clearCancelDeletionToken(userId);
      throw new BadRequestException(
        'The grace period has expired. The account has already been permanently deleted.',
      );
    }

    await this.accountDeletionQueueService.cancelDeletionJob(userId);
    await this.usersService.cancelAccountDeletion(userId);
    await this.clearCancelDeletionToken(userId);

    return { message: 'Account deletion cancelled successfully. You can now log in.' };
  }

  private async clearCancelDeletionToken(userId: string): Promise<void> {
    const token = await this.cacheManager.get<string>(`cancel_deletion_user:${userId}`);
    if (token) {
      await this.cacheManager.del(`cancel_deletion:${token}`);
    }

    await this.cacheManager.del(`cancel_deletion_user:${userId}`);
  }
}
