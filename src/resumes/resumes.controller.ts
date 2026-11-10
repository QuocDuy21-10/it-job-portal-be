import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Logger,
  UseGuards,
  Res,
  StreamableFile,
} from '@nestjs/common';
import type { Response } from 'express';
import { SkipTransform } from 'src/utils/decorators/skip-transform.decorator';
import { ThrottlerGuard, Throttle } from '@nestjs/throttler';
import { BulkDeleteDto } from 'src/utils/dto/bulk-delete.dto';
import { ResumesService } from './resumes.service';
import { CreateUserCvDto } from './dto/create-resume.dto';
import { UpdateResumeDto } from './dto/update-resume.dto';
import { ResponseMessage } from 'src/utils/decorators/response-message.decorator';
import { User } from 'src/utils/decorators/user.decorator';
import { PaginationQueryDto } from 'src/utils/dto/pagination-query.dto';
import { IUser } from 'src/users/user.interface';
import { ApiOperation, ApiTags, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { UploadCvDto } from './dto/upload-cv.dto';
import { ResumeProcessingService } from './resume-processing.service';
import { ResumeQueueService } from 'src/queues/services/resume-queue.service';
import { ApplicationSubmissionService } from './services/application-submission.service';
import { diskStorage } from 'multer';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { RESUME_STORAGE_DIR } from './resume-storage.util';
import * as fs from 'fs';
import { SubmitCvOnlineDto } from './dto/submit-cv-online.dto';
import { Roles, ERole } from 'src/casl';

@ApiTags('Resume')
@Controller('resumes')
export class ResumesController {
  private readonly logger = new Logger(ResumesController.name);

  constructor(
    private readonly resumesService: ResumesService,
    private readonly resumeProcessingService: ResumeProcessingService,
    private readonly resumeQueueService: ResumeQueueService,
    private readonly applicationSubmissionService: ApplicationSubmissionService,
  ) {}

  @Post()
  @Roles(ERole.SUPER_ADMIN, ERole.HR)
  @ApiOperation({
    description: 'Creates a new resume with the provided information. Requires authentication.',
  })
  @ResponseMessage('Resume created successfully')
  create(@Body() createUserCvDto: CreateUserCvDto, @User() user: IUser) {
    return this.resumesService.create(createUserCvDto, user);
  }

  @Get()
  @Roles(ERole.SUPER_ADMIN, ERole.HR)
  @ApiOperation({
    summary: 'Get all resumes',
    description: 'Retrieves a paginated list of all resumes. Supports filtering and sorting.',
  })
  @ResponseMessage('Resumes have been retrieved successfully')
  findAll(@Query() pagination: PaginationQueryDto, @Query() query: string, @User() user: IUser) {
    return this.resumesService.findAll(pagination.page, pagination.limit, query, user);
  }

  @Get(':id')
  @Roles(ERole.SUPER_ADMIN, ERole.HR)
  @ApiOperation({
    summary: 'Get resume by ID',
    description: 'Retrieves detailed information about a specific resume by its ID',
  })
  @ResponseMessage('Resume has been retrieved successfully')
  findOne(@Param('id') id: string, @User() user: IUser) {
    return this.resumesService.findOne(id, user);
  }

  @Patch(':id')
  @Roles(ERole.SUPER_ADMIN, ERole.HR)
  @ApiOperation({
    summary: 'Update resume by ID',
    description:
      'Updates an existing resume. Only the fields provided will be updated. Requires authentication.',
  })
  @ResponseMessage('Resume updated status successfully')
  update(@Param('id') id: string, @Body() updateResumeDto: UpdateResumeDto, @User() user: IUser) {
    return this.resumesService.update(id, updateResumeDto, user);
  }

  @Delete('bulk')
  @Roles(ERole.SUPER_ADMIN, ERole.HR)
  @ApiOperation({
    summary: 'Bulk delete resumes',
    description:
      'Soft deletes multiple resumes by IDs (max 100). HR can only delete resumes belonging to their own company.',
  })
  @ResponseMessage('Bulk delete resumes')
  bulkRemove(@Body() bulkDeleteDto: BulkDeleteDto, @User() user: IUser) {
    return this.resumesService.bulkRemove(bulkDeleteDto.ids, user);
  }

  @Delete(':id')
  @Roles(ERole.SUPER_ADMIN, ERole.HR)
  @ApiOperation({
    summary: 'Delete resume by ID',
    description:
      'Soft deletes a resume. The resume will be marked as deleted but not removed from database. Requires authentication.',
  })
  @ResponseMessage('Resume deleted successfully')
  remove(@Param('id') id: string, @User() user: IUser) {
    return this.resumesService.remove(id, user);
  }

  @Post('by-user')
  @ApiOperation({
    summary: 'Get resume by user',
    description: 'Retrieves resume associated with the authenticated user.',
  })
  @ResponseMessage('Resume has been retrieved successfully')
  getResumeByUser(@User() user: IUser) {
    return this.resumesService.getResumeByUser(user);
  }

  @Post('my-resumes')
  @ApiOperation({
    summary: 'Get resume of user',
    description: 'Gets the resume associated with the authenticated user.',
  })
  @ResponseMessage('Resume has been retrieved successfully')
  getResumeOfMe(@User() user: IUser) {
    return this.resumesService.getResumeOfMe(user);
  }

  // CV Online Submission

  @Post('cv-online')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { ttl: 300000, limit: 10 } })
  @ApiOperation({
    summary: 'Submit CV Online - Apply using structured CV profile',
    description:
      'Apply for a job using your pre-created structured CV profile. The system will automatically calculate match score and create application.',
  })
  @ResponseMessage('CV submitted successfully')
  async submitCvOnline(@Body() submitCvOnlineDto: SubmitCvOnlineDto, @User() user: IUser) {
    const result = await this.applicationSubmissionService.submitCvOnline(submitCvOnlineDto, user);

    // Notify HR about the new application
    this.resumesService
      .notifyHrNewApplication(
        result._id.toString(),
        result.jobName,
        result.companyName,
        result.companyId?.toString(),
        user.name,
        user.email,
      )
      .catch(err =>
        this.logger.error(
          `Failed to notify HR for cv-online submission: resumeId=${result._id}, error=${err.message}`,
        ),
      );

    return result;
  }

  // CV File Upload

  @Post('upload-cv')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { ttl: 3600000, limit: 20 } })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (req, file, cb) => {
          fs.mkdirSync(RESUME_STORAGE_DIR, { recursive: true });
          cb(null, RESUME_STORAGE_DIR);
        },
        filename: (req, file, cb) => {
          // Opaque name: original filenames usually contain the candidate's name.
          cb(null, `${randomUUID()}${path.extname(file.originalname).toLowerCase()}`);
        },
      }),
      fileFilter: (req, file, cb) => {
        const allowedFileTypes = ['pdf', 'doc', 'docx', 'txt'];
        const fileExtension = file.originalname.split('.').pop().toLowerCase();
        if (!allowedFileTypes.includes(fileExtension)) {
          cb(
            new BadRequestException(
              `Invalid file type: ${fileExtension}. Only PDF, DOC, DOCX, and TXT are allowed.`,
            ),
            false,
          );
        } else {
          cb(null, true);
        }
      },
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Upload CV and apply for job',
    description: 'Upload CV file (PDF, DOC, DOCX, TXT) and automatically parse + analyze',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'CV file (PDF, DOC, DOCX, TXT - Max 5MB)',
        },
        jobId: { type: 'string', description: 'Job ID to apply for' },
      },
      required: ['file', 'jobId'],
    },
  })
  @ResponseMessage('CV uploaded and queued for processing')
  async uploadCV(
    @UploadedFile() file: Express.Multer.File,
    @Body() uploadCvDto: UploadCvDto,
    @User() user: IUser,
  ) {
    // Delegate all orchestration to the processing service
    const result = await this.resumeProcessingService.handleUploadAndQueue(
      file,
      uploadCvDto,
      user,
      this.resumeQueueService,
    );

    // Notify HR about the new application
    this.resumesService
      .notifyHrNewApplication(
        result.resumeId,
        result.jobName,
        result.companyName,
        result.companyId,
        user.name,
        user.email,
      )
      .catch(err =>
        this.logger.error(
          `Failed to notify HR for upload-cv submission: resumeId=${result.resumeId}, error=${err.message}`,
        ),
      );

    return result.response;
  }

  // Analysis & Queue Management

  @Get(':id/file')
  @SkipTransform()
  @ApiOperation({
    summary: 'Download CV file',
    description:
      'Streams the CV file. Allowed: the candidate, HR of the same company, SUPER ADMIN.',
  })
  async getResumeFile(
    @Param('id') id: string,
    @User() user: IUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { filePath, contentType, fileName } = await this.resumesService.getFileForRead(id, user);
    res.set({
      'Content-Type': contentType,
      // Legacy filenames contain Vietnamese characters, which are invalid in a plain header value.
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    });
    return new StreamableFile(fs.createReadStream(filePath));
  }

  @Get(':id/analysis')
  @ApiOperation({
    summary: 'Get CV analysis results',
    description: 'Retrieve parsed data and AI matching analysis for a resume',
  })
  @ResponseMessage('Analysis results retrieved successfully')
  async getAnalysis(@Param('id') id: string, @User() user: IUser) {
    const resume = await this.resumesService.findOneForRead(id, user);
    const canSeeNotes = user.role === ERole.SUPER_ADMIN || user.role === ERole.HR;

    return {
      resumeId: resume._id,
      jobId: resume.jobId,
      companyId: resume.companyId,
      status: resume.status,
      processing: {
        isParsed: resume.isParsed,
        isAnalyzed: resume.isAnalyzed,
        parseError: resume.parseError,
        analysisError: resume.analysisError,
      },
      parsedData: resume.parsedData,
      aiAnalysis: resume.aiAnalysis,
      priority: resume.priority,
      ...(canSeeNotes && {
        notes: { adminNotes: resume.adminNotes, hrNotes: resume.hrNotes },
      }),
      uploadedAt: resume.createdAt,
      lastUpdated: resume.updatedAt,
    };
  }

  @Get('queue/stats')
  @Roles(ERole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Get queue processing statistics',
    description: 'View current status of CV processing queue (Admin only)',
  })
  @ResponseMessage('Queue statistics retrieved')
  async getQueueStats() {
    return await this.resumeQueueService.getQueueStats();
  }

  @Post(':id/reparse')
  @Roles(ERole.SUPER_ADMIN, ERole.HR)
  @ApiOperation({
    summary: 'Re-parse a CV',
    description: 'Trigger re-parsing of an already uploaded CV',
  })
  @ResponseMessage('Re-parsing queued successfully')
  async reparseCV(@Param('id') id: string, @User() user: IUser) {
    const resume = await this.resumesService.findOne(id, user);

    if (!resume.url) {
      throw new BadRequestException('No CV file found for this resume');
    }

    const job = await this.resumeQueueService.addParseResumeJob({
      resumeId: id,
      jobId: resume.jobId.toString(),
    });

    return { resumeId: id, jobId: job.id, message: 'CV re-parsing has been queued' };
  }

  @Post(':id/reanalyze')
  @Roles(ERole.SUPER_ADMIN, ERole.HR)
  @ApiOperation({
    summary: 'Re-analyze a CV',
    description: 'Trigger re-analysis of a parsed CV against the job',
  })
  @ResponseMessage('Re-analysis queued successfully')
  async reanalyzeCV(@Param('id') id: string, @User() user: IUser) {
    // Company scope check first; validateResumeForAnalysis has no notion of the caller.
    await this.resumesService.findOne(id, user);
    const resume = await this.resumeProcessingService.validateResumeForAnalysis(id);

    if (!resume.jobId) {
      throw new BadRequestException('No job associated with this resume');
    }

    const job = await this.resumeQueueService.addAnalyzeResumeJob({
      resumeId: id,
      jobId: resume.jobId.toString(),
    });

    return { resumeId: id, jobId: job.id, message: 'CV re-analysis has been queued' };
  }
}
