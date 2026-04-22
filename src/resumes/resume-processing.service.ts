import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { SoftDeleteModel } from 'soft-delete-plugin-mongoose';
import * as path from 'path';
import * as fs from 'fs';
import { Resume, ResumeDocument } from './schemas/resume.schema';
import { IUser } from 'src/users/user.interface';
import { EResumeStatus } from './enums/resume-status.enum';
import { JobsService } from 'src/jobs/jobs.service';
import { UploadCvDto } from './dto/upload-cv.dto';
import { ResumeQueueService } from 'src/queues/services/resume-queue.service';

@Injectable()
export class ResumeProcessingService {
  private readonly logger = new Logger(ResumeProcessingService.name);

  constructor(
    @InjectModel(Resume.name) private readonly resumeModel: SoftDeleteModel<ResumeDocument>,
    private readonly jobsService: JobsService,
  ) {}

  async handleUploadAndQueue(
    file: Express.Multer.File,
    uploadCvDto: UploadCvDto,
    user: IUser,
    resumeQueueService: ResumeQueueService,
  ) {
    this.validateFile(file);

    const job = await this.validateJob(uploadCvDto.jobId);

    await this.checkDuplicateApplication(user._id.toString(), uploadCvDto.jobId);

    const resume = await this.createResume(file, uploadCvDto.jobId, user);

    const fullFilePath = this.getFullFilePath(resume.url);
    if (!fs.existsSync(fullFilePath)) {
      throw new BadRequestException('File not found after upload. Please try again.');
    }

    const parseJob = await resumeQueueService.addParseResumeJob({
      resumeId: resume._id.toString(),
      filePath: fullFilePath,
      jobId: uploadCvDto.jobId,
    });

    const analysisJob = await resumeQueueService.addAnalyzeResumeJob({
      resumeId: resume._id.toString(),
      jobId: uploadCvDto.jobId,
    });

    return {
      resumeId: resume._id.toString(),
      jobName: job.name,
      companyName: job.company.name,
      companyId: job.company._id?.toString(),
      response: {
        _id: resume._id,
        jobId: uploadCvDto.jobId,
        jobName: job.name,
        companyName: job.company.name,
        status: 'processing',
        jobs: { parseJobId: parseJob.id, analysisJobId: analysisJob.id },
        file: this.getFileMetadata(file),
        message:
          'Your CV has been uploaded and is being processed. You will be notified when analysis is complete.',
        estimatedTime: '30-60 seconds',
      },
    };
  }

  // File validation helper method to keep the main flow clean
  validateFile(file: Express.Multer.File): void {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }
    if (!file.path || !file.filename) {
      throw new BadRequestException('Invalid file upload');
    }

    const allowedMimeTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
    ];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException(
        `Invalid file type: ${file.mimetype}. Only PDF, DOC, DOCX, and TXT are allowed.`,
      );
    }

    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      throw new BadRequestException(
        `File too large: ${(file.size / 1024 / 1024).toFixed(2)}MB. Maximum size is 5MB.`,
      );
    }

    this.logger.log(
      `File validated: ${file.filename} (${file.mimetype}, ${(file.size / 1024).toFixed(2)}KB)`,
    );
  }

  async validateJob(jobId: string) {
    const job = await this.jobsService.findOne(jobId);

    if (!job) {
      throw new NotFoundException(`Job not found with id: ${jobId}`);
    }
    if (!job.isActive) {
      throw new BadRequestException('This job is no longer active');
    }
    if (job.endDate && new Date(job.endDate) < new Date()) {
      throw new BadRequestException('This job posting has expired');
    }

    this.logger.log(`Job validated: ${job.name} (${jobId})`);
    return job;
  }

  async checkDuplicateApplication(userId: string, jobId: string): Promise<void> {
    const existing = await this.resumeModel.findOne({
      userId: userId,
      jobId: jobId,
      isDeleted: { $ne: true },
    });
    if (existing) {
      throw new BadRequestException(
        'You have already applied to this job. Duplicate applications are not allowed.',
      );
    }
  }

  async createResume(
    file: Express.Multer.File,
    jobId: string,
    user: IUser,
  ): Promise<ResumeDocument> {
    const job = await this.jobsService.findOne(jobId);

    const resume = await this.resumeModel.create({
      email: user.email,
      userId: user._id,
      jobId: jobId,
      companyId: job.company._id,
      url: `images/resumes/${file.filename}`,
      status: EResumeStatus.PENDING,
      isParsed: false,
      isAnalyzed: false,
      histories: [
        {
          status: EResumeStatus.PENDING,
          updatedAt: new Date(),
          updatedBy: { _id: user._id, email: user.email },
        },
      ],
      createdBy: { _id: user._id, email: user.email },
    });

    this.logger.log(`Resume created: ${resume._id} for job ${jobId}`);
    return resume;
  }

  getFullFilePath(relativeUrl: string): string {
    const cleanPath = relativeUrl.replace(/^images\/resumes\//, '');
    const fullPath = path.join(process.cwd(), 'public', 'images', 'resumes', cleanPath);

    // Guard: resolved path must stay within the upload directory
    const uploadDir = path.join(process.cwd(), 'public', 'images', 'resumes');
    if (!fullPath.startsWith(uploadDir)) {
      throw new BadRequestException('Invalid file path');
    }

    this.logger.log(`Resolved file path: ${relativeUrl} -> ${fullPath}`);
    return fullPath;
  }

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

  async validateResumeForAnalysis(resumeId: string): Promise<ResumeDocument> {
    const resume = await this.resumeModel.findById(resumeId);

    if (!resume) {
      throw new NotFoundException(`Resume not found with id: ${resumeId}`);
    }
    if (!resume.isParsed) {
      throw new BadRequestException(
        'Resume must be parsed before analysis. Please wait for parsing to complete.',
      );
    }
    if (!resume.parsedData) {
      throw new BadRequestException('No parsed data available. Please re-upload the CV.');
    }

    return resume;
  }
}
