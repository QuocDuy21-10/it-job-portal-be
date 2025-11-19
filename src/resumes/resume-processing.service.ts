import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { SoftDeleteModel } from 'soft-delete-plugin-mongoose';
import { Resume, ResumeDocument } from '../resumes/schemas/resume.schema';
import { Job, JobDocument } from '../jobs/schemas/job.schema';
import { Model } from 'mongoose';
import { IUser } from 'src/users/users.interface';
import { ResumeStatus } from '../resumes/enums/resume-status.enum';

@Injectable()
export class ResumeProcessingService {
  private readonly logger = new Logger(ResumeProcessingService.name);

  constructor(
    @InjectModel(Resume.name) private resumeModel: SoftDeleteModel<ResumeDocument>,
    @InjectModel(Job.name) private jobModel: Model<JobDocument>,
  ) {}

  /**
   * Validate file upload
   */
  validateFile(file: Express.Multer.File): void {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    // Check file exists
    if (!file.path || !file.filename) {
      throw new BadRequestException('Invalid file upload');
    }

    // Validate mimetype
    const allowedMimeTypes = [
      'application/pdf',
      'application/msword', // .doc
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
      'text/plain', // .txt
    ];

    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException(
        `Invalid file type: ${file.mimetype}. Only PDF, DOC, DOCX, and TXT are allowed.`
      );
    }

    // Validate file size (5MB max - already handled by Multer but double-check)
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      throw new BadRequestException(
        `File too large: ${(file.size / 1024 / 1024).toFixed(2)}MB. Maximum size is 5MB.`
      );
    }

    this.logger.log(`File validated: ${file.filename} (${file.mimetype}, ${(file.size / 1024).toFixed(2)}KB)`);
  }

  /**
   * Validate job exists and is active
   */
  async validateJob(jobId: string): Promise<JobDocument> {
    const job = await this.jobModel.findById(jobId);

    if (!job) {
      throw new NotFoundException(`Job not found with id: ${jobId}`);
    }

    if (!job.isActive) {
      throw new BadRequestException('This job is no longer active');
    }

    // Check if job has expired
    if (job.endDate && new Date(job.endDate) < new Date()) {
      throw new BadRequestException('This job posting has expired');
    }

    this.logger.log(`Job validated: ${job.name} (${jobId})`);
    return job;
  }

  /**
   * Check if user has already applied to this job
   */
  async checkDuplicateApplication(userId: string, jobId: string): Promise<void> {
    const existingResume = await this.resumeModel.findOne({
      userId: userId,
      jobId: jobId,
      isDeleted: false,
    });

    if (existingResume) {
      throw new BadRequestException(
        'You have already applied to this job. Duplicate applications are not allowed.'
      );
    }

    this.logger.log(`No duplicate application found for user ${userId} and job ${jobId}`);
  }

  /**
   * Create resume record
   */
  async createResume(
    file: Express.Multer.File,
    jobId: string,
    user: IUser,
  ): Promise<ResumeDocument> {
    // Get job to extract company info
    const job = await this.jobModel.findById(jobId);

    const resume = await this.resumeModel.create({
      email: user.email,
      userId: user._id,
      jobId: jobId,
      companyId: job.company._id,
      url: `images/resumes/${file.filename}`, // Relative path
      status: ResumeStatus.PENDING,
      isParsed: false,
      isAnalyzed: false,
      histories: [
        {
          status: ResumeStatus.PENDING,
          updatedAt: new Date(),
          updatedBy: { _id: user._id, email: user.email },
        },
      ],
      createdBy: { _id: user._id, email: user.email },
    });

    this.logger.log(`Resume created: ${resume._id} for job ${jobId}`);
    return resume;
  }

  /**
   * Get full file path from relative path
   * Handles both Docker and local environments
   */
  getFullFilePath(relativeUrl: string): string {
    const path = require('path');
    const fs = require('fs');
    
    // Remove 'images/resumes/' prefix if it exists since we'll add 'public' prefix
    const cleanPath = relativeUrl.replace(/^images\/resumes\//, '');
    
    // Build full path
    const fullPath = path.join(process.cwd(), 'public', 'images', 'resumes', cleanPath);
    
    this.logger.log(`Resolved file path: ${relativeUrl} -> ${fullPath}`);
    
    // Verify path exists
    if (!fs.existsSync(fullPath)) {
      this.logger.warn(`File does not exist at: ${fullPath}`);
    }
    
    return fullPath;
  }

  /**
   * Extract metadata from file
   */
  getFileMetadata(file: Express.Multer.File) {
    return {
      filename: file.filename,
      originalName: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      sizeInMB: (file.size / 1024 / 1024).toFixed(2),
      uploadedAt: new Date(),
    };
  }

  /**
   * Validate resume processing status
   */
  async validateResumeForAnalysis(resumeId: string): Promise<ResumeDocument> {
    const resume = await this.resumeModel.findById(resumeId);

    if (!resume) {
      throw new NotFoundException(`Resume not found with id: ${resumeId}`);
    }

    if (!resume.isParsed) {
      throw new BadRequestException(
        'Resume must be parsed before analysis. Please wait for parsing to complete.'
      );
    }

    if (!resume.parsedData) {
      throw new BadRequestException('No parsed data available. Please re-upload the CV.');
    }

    return resume;
  }
}
