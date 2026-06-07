import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CvProfile, CvProfileDocument } from 'src/cv-profiles/schemas/cv-profile.schema';
import { User, UserDocument } from 'src/users/schemas/user.schema';

export interface UserIdentitySnapshot {
  _id: string;
  name: string;
  email: string;
  avatar?: string;
}

export interface CvPersonalInfoIdentity {
  fullName?: string;
  email?: string;
  avatar?: string;
}

@Injectable()
export class ProfileIdentitySyncService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(CvProfile.name) private readonly cvProfileModel: Model<CvProfileDocument>,
  ) {}

  async getUserIdentity(userId: string): Promise<UserIdentitySnapshot> {
    this.validateObjectId(userId);

    const user = await this.userModel
      .findOne({ _id: new Types.ObjectId(userId), isDeleted: { $ne: true } })
      .select('_id name email avatar')
      .lean()
      .exec();

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return {
      _id: user._id.toString(),
      name: user.name,
      email: user.email,
      avatar: user.avatar,
    };
  }

  assertCvEmailMatchesUser(incomingEmail: string | undefined, userEmail: string): void {
    if (!incomingEmail) {
      return;
    }

    if (this.normalizeEmail(incomingEmail) !== this.normalizeEmail(userEmail)) {
      throw new BadRequestException('CV profile email must match the account email');
    }
  }

  async syncUserIdentityFromCv(
    userId: string,
    personalInfo: CvPersonalInfoIdentity,
  ): Promise<void> {
    this.validateObjectId(userId);

    const $set: Record<string, string> = {};
    if (personalInfo.fullName) {
      $set.name = personalInfo.fullName;
    }
    if (personalInfo.avatar) {
      $set.avatar = personalInfo.avatar;
    }

    if (Object.keys($set).length === 0) {
      return;
    }

    await this.userModel
      .updateOne({ _id: new Types.ObjectId(userId), isDeleted: { $ne: true } }, { $set })
      .exec();
  }

  async syncCvIdentityFromUser(
    userId: string,
    identity: Partial<UserIdentitySnapshot>,
  ): Promise<void> {
    this.validateObjectId(userId);

    const $set: Record<string, any> = {};
    if (identity.name) {
      $set['personalInfo.fullName'] = identity.name;
    }
    if (identity.email) {
      $set['personalInfo.email'] = identity.email;
    }
    if (identity.avatar) {
      $set['personalInfo.avatar'] = identity.avatar;
    }

    if (Object.keys($set).length === 0) {
      return;
    }

    $set.lastUpdated = new Date();

    await this.cvProfileModel.updateOne({ userId: new Types.ObjectId(userId) }, { $set }).exec();
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private validateObjectId(id: string): void {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid user ID format');
    }
  }
}
