import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import mongoose from 'mongoose';
import { ResumeRepository } from '../repositories/resume.repository';
import { JobsService } from 'src/jobs/jobs.service';
import { CvProfilesService } from 'src/cv-profiles/cv-profiles.service';
import { MatchingService } from 'src/matching/matching.service';
import { IUser } from 'src/users/user.interface';
import { SubmitCvOnlineDto } from '../dto/submit-cv-online.dto';
import { ParsedDataDto } from '../dto/parsed-data.dto';
import { EResumeStatus } from '../enums/resume-status.enum';
import { CvProfile } from 'src/cv-profiles/schemas/cv-profile.schema';

@Injectable()
export class ApplicationSubmissionService {
  constructor(
    private readonly resumeRepository: ResumeRepository,
    private readonly jobsService: JobsService,
    private readonly cvProfilesService: CvProfilesService,
    private readonly matchingService: MatchingService,
  ) {}

  async submitCvOnline(submitCvOnlineDto: SubmitCvOnlineDto, user: IUser) {
    const { jobId } = submitCvOnlineDto;

    const job = await this.validateJobForApplication(jobId);

    const cvProfile = await this.cvProfilesService.getCurrentUserCv(user._id.toString());
    if (!cvProfile.isActive) {
      throw new BadRequestException(
        'Your CV profile is inactive. Please activate it before applying.',
      );
    }

    await this.checkDuplicateApplication(user._id.toString(), jobId);

    const parsedData = this.mapCvProfileToParsedData(cvProfile);
    const matchResult = await this.matchingService.calculateMatch(parsedData, job);

    const newResume = await this.resumeRepository.create({
      email: user.email,
      userId: user._id,
      jobId: new mongoose.Types.ObjectId(jobId),
      companyId: job.company._id,
      status: EResumeStatus.PENDING,
      parsedData,
      aiAnalysis: {
        matchingScore: matchResult.matchingScore,
        skillsMatch: matchResult.skillsMatch,
        strengths: matchResult.strengths,
        weaknesses: matchResult.weaknesses,
        summary: matchResult.summary,
        recommendation: matchResult.recommendation,
        analyzedAt: matchResult.analyzedAt,
      },
      priority: matchResult.priority,
      isParsed: true,
      isAnalyzed: true,
      cvStructuredData: cvProfile,
      histories: [
        {
          status: EResumeStatus.PENDING,
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
      companyId: job.company._id,
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

  async validateJobForApplication(jobId: string) {
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

  async checkDuplicateApplication(userId: string, jobId: string): Promise<void> {
    const existing = await this.resumeRepository.findDuplicateApplication(userId, jobId);
    if (existing) {
      throw new BadRequestException(
        'You have already applied to this job. Duplicate applications are not allowed.',
      );
    }
  }

  private mapCvProfileToParsedData(cvProfile: CvProfile): ParsedDataDto {
    const { personalInfo, education, experience, skills } = cvProfile;
    const yearsOfExperience = this.calculateYearsOfExperience(experience || []);

    return {
      fullName: personalInfo.fullName,
      email: personalInfo.email,
      phone: personalInfo.phone,
      skills: skills?.map(skill => skill.name) || [],
      experience:
        experience?.map(exp => ({
          company: exp.company,
          position: exp.position,
          duration: `${exp.startDate} - ${exp.endDate}`,
          description: exp.description,
        })) || [],
      education:
        education?.map(edu => ({
          school: edu.school,
          degree: edu.degree,
          major: edu.field,
          duration: `${edu.startDate} - ${edu.endDate}`,
          gpa: undefined,
        })) || [],
      summary: personalInfo.bio || 'Professional with structured CV profile',
      yearsOfExperience,
    };
  }

  private calculateYearsOfExperience(experiences: any[]): number {
    if (!experiences || experiences.length === 0) return 0;

    let totalMonths = 0;
    for (const exp of experiences) {
      try {
        const startDate = new Date(exp.startDate);
        const endDate =
          exp.endDate?.toLowerCase() === 'present' ? new Date() : new Date(exp.endDate);
        if (!isNaN(startDate.getTime()) && !isNaN(endDate.getTime())) {
          const yearDiff = endDate.getFullYear() - startDate.getFullYear();
          const monthDiff = endDate.getMonth() - startDate.getMonth();
          totalMonths += yearDiff * 12 + monthDiff;
        }
      } catch {
        continue;
      }
    }

    return Math.max(0, Math.round(totalMonths / 12));
  }
}
