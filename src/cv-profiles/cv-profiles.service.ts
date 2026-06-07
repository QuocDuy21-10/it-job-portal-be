import {
  Injectable,
  Inject,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { Model, Types } from 'mongoose';
import { CvProfile, CvProfileDocument } from './schemas/cv-profile.schema';
import { CreateCvProfileDto } from './dto/create-cv-profile.dto';
import { UpdateCvProfileDto } from './dto/update-cv-profile.dto';
import { FilesService } from '../files/files.service';
import {
  ProfileIdentitySyncService,
  UserIdentitySnapshot,
} from 'src/profile-identity/profile-identity-sync.service';

export interface CvProfileDraft {
  isDraft: true;
  userId: string;
  personalInfo: {
    fullName: string;
    title: string;
    avatar?: string;
    phone: string;
    email: string;
    birthday: string;
    gender: string;
    address: string;
    personalLink: string;
    bio: string;
  };
  education: [];
  experience: [];
  skills: [];
  languages: [];
  projects: [];
  certificates: [];
  awards: [];
  isActive: true;
}

@Injectable()
export class CvProfilesService {
  constructor(
    @InjectModel(CvProfile.name)
    private cvProfileModel: Model<CvProfileDocument>,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    private readonly filesService: FilesService,
    private readonly profileIdentitySyncService: ProfileIdentitySyncService,
  ) {}

  /**
   * Upsert CV Profile
   * If user already has CV -> update
   * If not -> create new
   */
  async upsertCvProfile(
    userId: string,
    createCvProfileDto: CreateCvProfileDto,
  ): Promise<CvProfile> {
    this.validateUserId(userId);

    const userIdentity = await this.profileIdentitySyncService.getUserIdentity(userId);
    const existingCv = await this.findByUserId(userId);
    const canonicalCvProfileDto = this.buildCanonicalCvProfileDto(
      createCvProfileDto,
      userIdentity,
      existingCv,
    );

    const result = existingCv
      ? await this.updateCvProfile(userId, canonicalCvProfileDto)
      : await this.createCvProfile(userId, canonicalCvProfileDto);

    await this.profileIdentitySyncService.syncUserIdentityFromCv(
      userId,
      canonicalCvProfileDto.personalInfo,
    );

    // Invalidate chat user context cache so next chat message gets fresh profile data
    await this.cacheManager.del(`chat_ctx:${userId}`);

    return result;
  }

  private buildCanonicalCvProfileDto(
    createCvProfileDto: CreateCvProfileDto,
    userIdentity: UserIdentitySnapshot,
    existingCv: CvProfile | null,
  ): CreateCvProfileDto {
    if (!createCvProfileDto.personalInfo) {
      throw new BadRequestException('Personal information is required');
    }

    this.profileIdentitySyncService.assertCvEmailMatchesUser(
      createCvProfileDto.personalInfo.email,
      userIdentity.email,
    );

    const existingAvatar = existingCv?.personalInfo?.avatar;
    const avatar = createCvProfileDto.personalInfo.avatar || existingAvatar || userIdentity.avatar;

    return {
      ...createCvProfileDto,
      personalInfo: {
        ...createCvProfileDto.personalInfo,
        ...(avatar ? { avatar } : {}),
        email: userIdentity.email,
      },
    };
  }

  /**
   * Create new CV Profile
   * Private method - only called from upsert
   */
  private async createCvProfile(
    userId: string,
    createCvProfileDto: CreateCvProfileDto,
  ): Promise<CvProfile> {
    const cvProfile = new this.cvProfileModel({
      userId: new Types.ObjectId(userId),
      ...createCvProfileDto,
      isActive: true,
      lastUpdated: new Date(),
    });

    try {
      return await cvProfile.save();
    } catch (error) {
      if (error.code === 11000) {
        throw new ConflictException('CV Profile already exists for this user');
      }
      throw error;
    }
  }

  /**
   * Update existing CV Profile
   * Private method - only called from upsert
   */
  private async updateCvProfile(
    userId: string,
    updateCvProfileDto: UpdateCvProfileDto,
  ): Promise<CvProfile> {
    const updatedCv = await this.cvProfileModel
      .findOneAndUpdate(
        { userId: new Types.ObjectId(userId) },
        {
          ...updateCvProfileDto,
          lastUpdated: new Date(),
        },
        { new: true, runValidators: true },
      )
      .exec();

    if (!updatedCv) {
      throw new NotFoundException('CV Profile not found');
    }

    return updatedCv;
  }

  /**
   * Get CV Profile by User ID
   */
  async findByUserId(userId: string): Promise<CvProfile | null> {
    this.validateUserId(userId);

    return this.cvProfileModel.findOne({ userId: new Types.ObjectId(userId) }).exec();
  }

  /**
   * Get current user's CV Profile
   * Throws error if not found
   */
  async getCurrentUserCv(userId: string): Promise<CvProfile | null>;
  async getCurrentUserCv(
    userId: string,
    options: { includeDraft: true },
  ): Promise<CvProfile | CvProfileDraft>;
  async getCurrentUserCv(
    userId: string,
    options: { includeDraft?: boolean } = {},
  ): Promise<CvProfile | CvProfileDraft | null> {
    const cvProfile = await this.findByUserId(userId);

    if (cvProfile) {
      return this.transformCvProfileUrls(cvProfile);
    }

    if (!options.includeDraft) {
      return null;
    }

    const userIdentity = await this.profileIdentitySyncService.getUserIdentity(userId);
    return this.buildDraftCvProfile(userIdentity);
  }

  private buildDraftCvProfile(userIdentity: UserIdentitySnapshot): CvProfileDraft {
    return {
      isDraft: true,
      userId: userIdentity._id,
      personalInfo: {
        fullName: userIdentity.name,
        title: '',
        ...(userIdentity.avatar ? { avatar: userIdentity.avatar } : {}),
        phone: '',
        email: userIdentity.email,
        birthday: '',
        gender: '',
        address: '',
        personalLink: '',
        bio: '',
      },
      education: [],
      experience: [],
      skills: [],
      languages: [],
      projects: [],
      certificates: [],
      awards: [],
      isActive: true,
    };
  }

  /**
   * Transform CV Profile avatar path to full URL
   * @param cvProfile - CV Profile document
   * @returns CV Profile with full avatar URL
   */
  private transformCvProfileUrls(cvProfile: CvProfile): any {
    if (!cvProfile) {
      return cvProfile;
    }

    const cvObject = (cvProfile as any).toObject ? (cvProfile as any).toObject() : { ...cvProfile };

    // Transform avatar URL if exists and is not already a full URL
    if (cvObject.personalInfo?.avatar && !cvObject.personalInfo.avatar.startsWith('http')) {
      const fileName = cvObject.personalInfo.avatar.split('/').pop();
      cvObject.personalInfo.avatar = this.filesService.buildFileUrl('avatar', fileName);
    }

    return cvObject;
  }

  /**
   * Delete CV Profile
   */
  async deleteCvProfile(userId: string): Promise<void> {
    this.validateUserId(userId);

    const result = await this.cvProfileModel
      .deleteOne({ userId: new Types.ObjectId(userId) })
      .exec();

    if (result.deletedCount === 0) {
      throw new NotFoundException('CV Profile not found');
    }
  }

  /**
   * Soft delete - deactivate CV Profile
   */
  async deactivateCvProfile(userId: string): Promise<CvProfile> {
    const updatedCv = await this.cvProfileModel
      .findOneAndUpdate(
        { userId: new Types.ObjectId(userId) },
        { isActive: false, lastUpdated: new Date() },
        { new: true },
      )
      .exec();

    if (!updatedCv) {
      throw new NotFoundException('CV Profile not found');
    }

    return updatedCv;
  }

  /**
   * Activate CV Profile
   */
  async activateCvProfile(userId: string): Promise<CvProfile> {
    const updatedCv = await this.cvProfileModel
      .findOneAndUpdate(
        { userId: new Types.ObjectId(userId) },
        { isActive: true, lastUpdated: new Date() },
        { new: true },
      )
      .exec();

    if (!updatedCv) {
      throw new NotFoundException('CV Profile not found');
    }

    return updatedCv;
  }

  /**
   * Check if user has CV Profile
   */
  async hasCvProfile(userId: string): Promise<boolean> {
    this.validateUserId(userId);

    const count = await this.cvProfileModel
      .countDocuments({ userId: new Types.ObjectId(userId) })
      .exec();

    return count > 0;
  }

  /**
   * Get CV Profile by ID
   */
  async findById(cvProfileId: string): Promise<CvProfile> {
    this.validateUserId(cvProfileId);

    const cvProfile = await this.cvProfileModel.findById(cvProfileId).exec();

    if (!cvProfile) {
      throw new NotFoundException('CV Profile not found');
    }

    return cvProfile;
  }

  /**
   * Validate User ID format
   */
  private validateUserId(userId: string): void {
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Invalid user ID format');
    }
  }

  /**
   * Get all CV Profiles (Admin only)
   * With pagination
   */
  async findAll(
    page: number = 1,
    limit: number = 10,
  ): Promise<{ data: CvProfile[]; total: number; page: number; limit: number }> {
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.cvProfileModel.find().skip(skip).limit(limit).sort({ createdAt: -1 }).exec(),
      this.cvProfileModel.countDocuments().exec(),
    ]);

    return {
      data,
      total,
      page,
      limit,
    };
  }
}
