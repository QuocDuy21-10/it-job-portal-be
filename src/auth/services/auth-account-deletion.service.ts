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
    if (!user) throw new BadRequestException('Không tìm thấy người dùng');

    if (user.scheduledDeletionAt && user.scheduledDeletionAt > new Date()) {
      throw new ConflictException(
        'Tài khoản đang chờ xoá. Vui lòng kiểm tra email để biết ngày xoá.',
      );
    }

    if (user.authProvider === EAuthProvider.LOCAL) {
      if (!dto.password) {
        throw new BadRequestException('Cần nhập mật khẩu để xoá tài khoản.');
      }

      const valid = await this.usersService.isValidPassword(dto.password, user.password);
      if (!valid) {
        throw new UnauthorizedException('Mật khẩu không chính xác.');
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

    const frontendUrl = this.configService.get<string>('FE_URL');
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
      message: `Tài khoản của bạn sẽ bị xoá vào ${scheduledDeletionAt.toISOString()}. Bạn có thể huỷ trong vòng ${GRACE_PERIOD_DAYS} ngày.`,
      scheduledDeletionAt,
    };
  }

  async cancelAccountDeletion(userId: string): Promise<{ message: string }> {
    const userDoc = await this.usersService.findOne(userId);
    if (!userDoc) throw new BadRequestException('Không tìm thấy người dùng');

    if (!userDoc.scheduledDeletionAt) {
      throw new BadRequestException('Không có yêu cầu xoá tài khoản nào đang chờ.');
    }
    if (userDoc.scheduledDeletionAt < new Date()) {
      throw new BadRequestException('Đã hết thời hạn huỷ. Tài khoản đã bị xoá vĩnh viễn.');
    }

    await this.accountDeletionQueueService.cancelDeletionJob(userId);
    await this.usersService.cancelAccountDeletion(userId);
    await this.clearCancelDeletionToken(userId);

    return { message: 'Đã huỷ yêu cầu xoá tài khoản. Tài khoản của bạn đã hoạt động trở lại.' };
  }

  async cancelAccountDeletionByToken(token: string): Promise<{ message: string }> {
    const userId = await this.cacheManager.get<string>(`cancel_deletion:${token}`);
    if (!userId) {
      throw new BadRequestException('Liên kết huỷ xoá tài khoản không hợp lệ hoặc đã hết hạn.');
    }

    const userDoc = await this.usersService.findOne(userId);
    if (!userDoc) throw new BadRequestException('Không tìm thấy người dùng.');

    if (!userDoc.scheduledDeletionAt) {
      await this.clearCancelDeletionToken(userId);
      throw new BadRequestException('Không có yêu cầu xoá tài khoản nào đang chờ.');
    }
    if (userDoc.scheduledDeletionAt < new Date()) {
      await this.clearCancelDeletionToken(userId);
      throw new BadRequestException('Đã hết thời hạn huỷ. Tài khoản đã bị xoá vĩnh viễn.');
    }

    await this.accountDeletionQueueService.cancelDeletionJob(userId);
    await this.usersService.cancelAccountDeletion(userId);
    await this.clearCancelDeletionToken(userId);

    return { message: 'Đã huỷ yêu cầu xoá tài khoản. Bạn có thể đăng nhập ngay bây giờ.' };
  }

  private async clearCancelDeletionToken(userId: string): Promise<void> {
    const token = await this.cacheManager.get<string>(`cancel_deletion_user:${userId}`);
    if (token) {
      await this.cacheManager.del(`cancel_deletion:${token}`);
    }

    await this.cacheManager.del(`cancel_deletion_user:${userId}`);
  }
}
