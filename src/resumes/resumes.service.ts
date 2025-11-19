import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CreateResumeDto, CreateUserCvDto } from './dto/create-resume.dto';
import { UpdateResumeDto } from './dto/update-resume.dto';
import { IUser } from 'src/users/users.interface';
import { Resume, ResumeDocument } from './schemas/resume.schema';
import { InjectModel } from '@nestjs/mongoose';
import { SoftDeleteModel } from 'soft-delete-plugin-mongoose';
import aqp from 'api-query-params';
import mongoose from 'mongoose';
import { ResumeStatus } from './enums/resume-status.enum';
import { SubmitCvOnlineDto } from './dto/submit-cv-online.dto';
import { CvProfilesService } from 'src/cv-profiles/cv-profiles.service';
import { JobsService } from 'src/jobs/jobs.service';
import { MatchingService } from 'src/matching/matching.service';
import { ParsedDataDto } from './dto/parsed-data.dto';
import { CvProfile } from 'src/cv-profiles/schemas/cv-profile.schema';

@Injectable()
export class ResumesService {
  constructor(
    @InjectModel(Resume.name) private resumeModel: SoftDeleteModel<ResumeDocument>,
    private readonly cvProfilesService: CvProfilesService,
    private readonly jobsService: JobsService,
    private readonly matchingService: MatchingService,
  ) {}
  async create(createUserCvDto: CreateUserCvDto, user: IUser) {
    const newResume = await this.resumeModel.create({
      email: user.email,
      userId: user._id,
      status: ResumeStatus.PENDING,
      histories: [
        {
          status: ResumeStatus.PENDING,
          updatedAt: new Date(),
          updatedBy: { _id: user._id, email: user.email },
        },
      ],
      ...createUserCvDto,
      createdBy: { _id: user._id, email: user.email },
    });
    return { _id: newResume?._id, createdAt: newResume?.createdAt };
  }

  async findAll(page?: number, limit?: number, query?: string, user?: IUser) {
    const { filter, sort, population, projection } = aqp(query);
    delete filter.page;
    delete filter.limit;

    // Filter theo companyId nếu user là HR
    if (user && user.role?.name === 'HR' && user.company?._id) {
      filter.companyId = user.company._id;
    }

    let offset = (page - 1) * limit;
    let defaultLimit = limit ? limit : 10;

    const totalItems = (await this.resumeModel.find(filter)).length;
    const totalPages = Math.ceil(totalItems / defaultLimit);

    const result = await this.resumeModel
      .find(filter)
      .skip(offset)
      .limit(defaultLimit)
      .sort(sort as any)
      .populate(population)
      .select(projection as any)
      .exec();
    return {
      result,
      meta: {
        pagination: {
          current_page: page,
          per_page: limit,
          total_pages: totalPages,
          total: totalItems,
        },
      },
    };
  }

  async findOne(id: string, user?: IUser) {
    this.validateObjectId(id);

    const resume = await this.resumeModel.findById(id);

    // Nếu user là HR, chỉ cho phép xem resume của công ty họ
    if (user && user.role?.name === 'HR' && user.company?._id) {
      if (resume && resume.companyId?.toString() !== user.company._id.toString()) {
        throw new BadRequestException('You can only view resumes of your own company');
      }
    }

    return resume;
  }

  async update(id: string, updateResumeDto: UpdateResumeDto, user?: IUser) {
    this.validateObjectId(id);
    const { status } = updateResumeDto;
    
    const updateData: any = {
      ...updateResumeDto,
    };

    // Only add status and history if status is provided
    if (status) {
      updateData.status = status;
      
      if (user) {
        updateData.updatedBy = { _id: user._id, email: user.email };
        updateData.$push = {
          histories: {
            status,
            updatedAt: new Date(),
            updatedBy: { _id: user._id, email: user.email },
          },
        };
      }
    } else if (user) {
      updateData.updatedBy = { _id: user._id, email: user.email };
    }

    return await this.resumeModel.updateOne({ _id: id }, updateData);
  }

  async remove(id: string, user: IUser) {
    this.validateObjectId(id);
    await this.resumeModel.updateOne(
      { _id: id },
      { deletedBy: { _id: user._id, email: user.email } },
    );
    return this.resumeModel.softDelete({ _id: id });
  }

  async getResumeByUser(user: IUser) {
    return await this.resumeModel
      .find({ userId: user._id })
      .sort('-createdAt')
      .populate([
        {
          path: 'companyId',
          select: {
            name: 1,
          },
        },
        {
          path: 'jobId',
          select: {
            name: 1,
            location: 1,
            salary: 1,
          },
        },
      ]);
  }

  async getResumeOfMe(user: IUser) {
    return await this.resumeModel
      .find({ userId: user._id }).select(['url'])
      .sort('-createdAt')
  }

  /**
   * Submit CV Online - Apply for job using structured CV profile
   * 
   * Flow:
   * 1. Validate job exists and is active
   * 2. Get user's CV profile
   * 3. Check duplicate application
   * 4. Map CV profile to parsedData format
   * 5. Calculate match score using MatchingService
   * 6. Create Resume with matched data
   * 
   * @param submitCvOnlineDto - Contains jobId
   * @param user - Current authenticated user
   * @returns Created resume with matching analysis
   */
  async submitCvOnline(submitCvOnlineDto: SubmitCvOnlineDto, user: IUser) {
    const { jobId } = submitCvOnlineDto;

    // Step 1: Validate job exists and is active
    const job = await this.validateJobForApplication(jobId);

    // Step 2: Get user's CV profile
    const cvProfile = await this.cvProfilesService.getCurrentUserCv(user._id.toString());

    if (!cvProfile.isActive) {
      throw new BadRequestException('Your CV profile is inactive. Please activate it before applying.');
    }

    // Step 3: Check duplicate application
    await this.checkDuplicateApplication(user._id.toString(), jobId);

    // Step 4: Map CV profile to parsedData format
    const parsedData = this.mapCvProfileToParsedData(cvProfile);

    // Step 5: Calculate match score using MatchingService
    const matchResult = await this.matchingService.calculateMatch(parsedData, job);

    // Step 6: Create Resume record
    const newResume = await this.resumeModel.create({
      email: user.email,
      userId: user._id,
      jobId: new mongoose.Types.ObjectId(jobId),
      companyId: job.company._id,
      status: ResumeStatus.PENDING,
      
      // Parsed data from CV profile (snapshot at application time)
      parsedData,
      
      // AI Analysis (match score and insights)
      aiAnalysis: {
        matchingScore: matchResult.matchingScore,
        skillsMatch: matchResult.skillsMatch,
        strengths: matchResult.strengths,
        weaknesses: matchResult.weaknesses,
        summary: matchResult.summary,
        recommendation: matchResult.recommendation,
        analyzedAt: matchResult.analyzedAt,
      },
      
      // Priority based on match score
      priority: matchResult.priority,
      
      // Processing flags
      isParsed: true, // No parsing needed, already structured
      isAnalyzed: true, // Analysis completed synchronously
      
      // Snapshot of structured CV at application time
      cvStructuredData: cvProfile,
      
      // History tracking
      histories: [
        {
          status: ResumeStatus.PENDING,
          updatedAt: new Date(),
          updatedBy: { _id: user._id, email: user.email },
        },
      ],
      
      createdBy: { _id: user._id, email: user.email },
    });

    return {
      _id: newResume._id,
      jobId: job._id,
      jobName: job.name,
      companyName: job.company.name,
      status: newResume.status,
      priority: newResume.priority,
      matchingScore: matchResult.matchingScore,
      recommendation: matchResult.recommendation,
      summary: matchResult.summary,
      createdAt: newResume.createdAt,
      message: 'Your CV has been successfully submitted. Match analysis completed.',
    };
  }

  /**
   * Validate job for application
   * Check if job exists, is active, and not expired
   */
  private async validateJobForApplication(jobId: string) {
    this.validateObjectId(jobId);

    const job = await this.jobsService.findOne(jobId);

    if (!job) {
      throw new NotFoundException(`Job with ID ${jobId} not found`);
    }

    if (!job.isActive) {
      throw new BadRequestException('This job is no longer active');
    }

    if (job.endDate && new Date(job.endDate) < new Date()) {
      throw new BadRequestException('This job posting has expired');
    }

    return job;
  }

  /**
   * Check if user already applied to this job
   */
  private async checkDuplicateApplication(userId: string, jobId: string) {
    const existingApplication = await this.resumeModel
      .findOne({
        userId: new mongoose.Types.ObjectId(userId),
        jobId: new mongoose.Types.ObjectId(jobId),
        isDeleted: { $ne: true },
      })
      .exec();

    if (existingApplication) {
      throw new BadRequestException(
        'You have already applied to this job. Duplicate applications are not allowed.',
      );
    }
  }

  /**
   * Map CvProfile to ParsedData format
   * Transform structured CV data to match the parsedData schema
   */
  private mapCvProfileToParsedData(cvProfile: CvProfile): ParsedDataDto {
    const { personalInfo, education, experience, skills } = cvProfile;

    // Calculate years of experience from work history
    const yearsOfExperience = this.calculateYearsOfExperience(experience || []);

    return {
      fullName: personalInfo.fullName,
      email: personalInfo.email,
      phone: personalInfo.phone,
      
      // Extract skill names from structured skills
      skills: skills?.map(skill => skill.name) || [],
      
      // Map experience to parsedData format
      experience: experience?.map(exp => ({
        company: exp.company,
        position: exp.position,
        duration: `${exp.startDate} - ${exp.endDate}`,
        description: exp.description,
      })) || [],
      
      // Map education to parsedData format
      education: education?.map(edu => ({
        school: edu.school,
        degree: edu.degree,
        major: edu.field,
        duration: `${edu.startDate} - ${edu.endDate}`,
        gpa: undefined, // Not available in CV profile schema
      })) || [],
      
      summary: personalInfo.bio || 'Professional with structured CV profile',
      yearsOfExperience,
    };
  }

  /**
   * Calculate total years of experience from work history
   * Simple calculation: count unique years between start and end dates
   */
  private calculateYearsOfExperience(experiences: any[]): number {
    if (!experiences || experiences.length === 0) {
      return 0;
    }

    let totalMonths = 0;

    for (const exp of experiences) {
      try {
        const startDate = new Date(exp.startDate);
        const endDate = exp.endDate.toLowerCase() === 'present' 
          ? new Date() 
          : new Date(exp.endDate);

        if (!isNaN(startDate.getTime()) && !isNaN(endDate.getTime())) {
          const months = this.getMonthsDifference(startDate, endDate);
          totalMonths += months;
        }
      } catch (error) {
        // Skip invalid dates
        continue;
      }
    }

    return Math.max(0, Math.round(totalMonths / 12));
  }

  /**
   * Helper: Calculate months between two dates
   */
  private getMonthsDifference(startDate: Date, endDate: Date): number {
    const yearDiff = endDate.getFullYear() - startDate.getFullYear();
    const monthDiff = endDate.getMonth() - startDate.getMonth();
    return yearDiff * 12 + monthDiff;
  }

  private validateObjectId(id: string): void {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`Not found Resume with id = ${id}`);
    }
  }
}
