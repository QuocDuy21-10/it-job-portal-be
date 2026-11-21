import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { genSaltSync, hashSync } from 'bcryptjs';
import { AuthRegisterDto } from 'src/auth/dto/auth-register.dto';
import { SessionsService } from 'src/sessions/sessions.service';
import { IUser } from '../user.interface';
import { LockUserDto } from '../dto/lock-user.dto';
import { UserRepository } from '../repositories/user.repository';

@Injectable()
export class UserAccountService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly sessionsService: SessionsService,
  ) {}

  private hashPassword(password: string): string {
    const salt = genSaltSync(10);
    return hashSync(password, salt);
  }

  async activateUser(id: string) {
    this.userRepository.validateObjectId(id);
    return this.userRepository.updateOne(id, {
      $set: { isActive: true },
      $unset: { verificationExpires: 1 },
    });
  }

  async scheduleAccountDeletion(id: string, scheduledDeletionAt: Date) {
    this.userRepository.validateObjectId(id);
    return this.userRepository.updateOne(id, { $set: { scheduledDeletionAt } });
  }

  async cancelAccountDeletion(id: string) {
    this.userRepository.validateObjectId(id);
    return this.userRepository.updateOne(id, { $unset: { scheduledDeletionAt: 1 } });
  }

  async updateUserStatus(id: string, isActive: boolean) {
    this.userRepository.validateObjectId(id);
    return this.userRepository.updateOne(id, { isActive });
  }

  async updatePassword(id: string, newPasswordHash: string) {
    this.userRepository.validateObjectId(id);
    return this.userRepository.updateOne(id, {
      password: newPasswordHash,
      passwordChangedAt: new Date(),
    });
  }

  async updateUnverifiedUser(id: string, dto: AuthRegisterDto) {
    this.userRepository.validateObjectId(id);
    const hashedPassword = this.hashPassword(dto.password);
    const verificationExpires = new Date(Date.now() + 15 * 60 * 1000);
    await this.userRepository.updateOne(id, {
      name: dto.name,
      password: hashedPassword,
      verificationExpires,
    });
    return this.userRepository.findById(id);
  }

  async lockUser(id: string, dto: LockUserDto, adminUser: IUser) {
    this.userRepository.validateObjectId(id);

    if (id === adminUser._id.toString()) {
      throw new BadRequestException('Bạn không thể khoá tài khoản của chính mình');
    }

    const user = await this.userRepository.findActiveUser(id);
    if (!user) {
      throw new NotFoundException(`Không tìm thấy người dùng có ID ${id}`);
    }

    if (user.isLocked) {
      throw new BadRequestException('Tài khoản đã bị khoá trước đó');
    }

    await this.userRepository.updateOne(id, {
      isLocked: true,
      lockReason: dto.reason ?? null,
      lockedBy: { _id: adminUser._id, email: adminUser.email },
      lockedAt: new Date(),
      updatedBy: { _id: adminUser._id, email: adminUser.email },
    });

    await this.sessionsService.deactivateAllUserSessions(id);

    return { _id: id, email: user.email, isLocked: true, lockReason: dto.reason ?? null };
  }

  async unlockUser(id: string, adminUser: IUser) {
    this.userRepository.validateObjectId(id);

    const user = await this.userRepository.findActiveUser(id);
    if (!user) {
      throw new NotFoundException(`Không tìm thấy người dùng có ID ${id}`);
    }

    if (!user.isLocked) {
      throw new BadRequestException('Tài khoản đang không bị khoá');
    }

    await this.userRepository.updateOne(id, {
      isLocked: false,
      $unset: { lockReason: '', lockedBy: '', lockedAt: '' },
      updatedBy: { _id: adminUser._id, email: adminUser.email },
    });

    return { _id: id, email: user.email, isLocked: false };
  }
}
