import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CvProfile, CvProfileDocument } from 'src/cv-profiles/schemas/cv-profile.schema';
import { Resume, ResumeDocument } from 'src/resumes/schemas/resume.schema';
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
    @InjectModel(Resume.name) private readonly resumeModel: Model<ResumeDocument>,
  ) {}

  async getUserIdentity(userId: string): Promise<UserIdentitySnapshot> {
    this.validateObjectId(userId);

    const user = await this.userModel
      .findOne({ _id: new Types.ObjectId(userId), isDeleted: { $ne: true } })
      .select('_id name email avatar')
      .lean()
      .exec();

    if (!user) {
      throw new NotFoundException('Không tìm thấy người dùng');
    }

    return {
      _id: user._id.toString(),
      name: user.name,
      email: user.email,
      avatar: user.avatar,
    };
  }

  /** File names under images/avatar that a user, CV profile or submitted CV snapshot points to. */
  async findReferencedAvatarFileNames(): Promise<Set<string>> {
    // The raw collection skips the soft-delete filter, so a restorable account keeps its avatar.
    const [userAvatars, cvAvatars, sentAvatars] = await Promise.all([
      this.userModel.collection.distinct('avatar'),
      this.cvProfileModel.collection.distinct('personalInfo.avatar'),
      this.resumeModel.collection.distinct('cvStructuredData.personalInfo.avatar'),
    ]);

    return new Set(
      [...userAvatars, ...cvAvatars, ...sentAvatars]
        .filter((value): value is string => typeof value === 'string' && value.length > 0)
        .map(value => value.split('?')[0].split('/').pop() as string),
    );
  }

  assertCvEmailMatchesUser(incomingEmail: string | undefined, userEmail: string): void {
    if (!incomingEmail) {
      return;
    }

    if (this.normalizeEmail(incomingEmail) !== this.normalizeEmail(userEmail)) {
      throw new BadRequestException('Email trong hồ sơ CV phải trùng với email tài khoản');
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
      throw new BadRequestException('ID người dùng không đúng định dạng');
    }
  }
}
