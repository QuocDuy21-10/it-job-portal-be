import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CvProfile, CvProfileDocument } from './schemas/cv-profile.schema';
import { CreateCvProfileDto } from './dto/create-cv-profile.dto';
import { UpdateCvProfileDto } from './dto/update-cv-profile.dto';

@Injectable()
export class CvProfilesService {
  constructor(
    @InjectModel(CvProfile.name)
    private cvProfileModel: Model<CvProfileDocument>,
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

    const existingCv = await this.findByUserId(userId);

    if (existingCv) {
      return this.updateCvProfile(userId, createCvProfileDto);
    }

    return this.createCvProfile(userId, createCvProfileDto);
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

    return this.cvProfileModel
      .findOne({ userId: new Types.ObjectId(userId) })
      .exec();
  }

  /**
   * Get current user's CV Profile
   * Throws error if not found
   */
  async getCurrentUserCv(userId: string): Promise<CvProfile> {
  const cvProfile = await this.findByUserId(userId);
  return cvProfile;
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

    const cvProfile = await this.cvProfileModel
      .findById(cvProfileId)
      .exec();

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
      this.cvProfileModel
        .find()
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 })
        .exec(),
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
