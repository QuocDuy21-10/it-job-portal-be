import { Controller, Get, Post, Body, Patch, Param, Delete, Res, Query, UseInterceptors, UploadedFile, BadRequestException, Inject } from '@nestjs/common';
import { ResumesService } from './resumes.service';
import { CreateResumeDto, CreateUserCvDto } from './dto/create-resume.dto';
import { UpdateResumeDto } from './dto/update-resume.dto';
import { Public, ResponseMessage, SkipCheckPermission, User } from 'src/decorator/customize';
import { IUser } from 'src/users/users.interface';
import { ApiOperation, ApiTags, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { UploadCvDto } from './dto/upload-cv.dto';
import { ResumeProcessingService } from './resume-processing.service';
import { ResumeQueueService } from 'src/queues/services/resume-queue.service';
import { diskStorage } from 'multer';
import * as path from 'path';
import * as fs from 'fs';

@ApiTags('Resume')
@Controller('resumes')
export class ResumesController {
  constructor(
    private readonly resumesService: ResumesService,
    private readonly resumeProcessingService: ResumeProcessingService,
    private readonly resumeQueueService: ResumeQueueService,
  ) {}

  @Post()
  @ApiOperation({
    summary: 'Create a new resume',
    description: 'Creates a new resume with the provided information. Requires authentication.',
  })
  @ResponseMessage('Resume created successfully')
  create(@Body() createUserCvDto: CreateUserCvDto, @User() user: IUser) {
    return this.resumesService.create(createUserCvDto, user);
  }

  @Get()
  @ApiOperation({
    summary: 'Get all resumes',
    description: 'Retrieves a paginated list of all resumes. Supports filtering and sorting.',
  })
  @ResponseMessage('Resumes have been retrieved successfully')
  findAll(
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Query() query: string,
    @User() user: IUser,
  ) {
    return this.resumesService.findAll(+page, +limit, query, user);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get resume by ID',
    description: 'Retrieves detailed information about a specific resume by its ID',
  })
  @ResponseMessage('Resume has been retrieved successfully')
  findOne(@Param('id') id: string, @User() user: IUser) {
    return this.resumesService.findOne(id, user);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update resume by ID',
    description:
      'Updates an existing resume. Only the fields provided will be updated. Requires authentication.',
  })
  @ResponseMessage('Resume updated status successfully')
  update(@Param('id') id: string, @Body() updateResumeDto: UpdateResumeDto, @User() user: IUser) {
    return this.resumesService.update(id, updateResumeDto, user);
  }

  @Delete(':id')
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
  @SkipCheckPermission()
  @ApiOperation({
    summary: 'Get resume by user',
    description: 'Retrieves resume associated with the authenticated user.',
  })
  @ResponseMessage('Resume has been retrieved successfully')
  getResumeByUser(@User() user: IUser) {
    return this.resumesService.getResumeByUser(user);
  }

  @Post('my-resumes')
  @SkipCheckPermission()
  @ApiOperation({
    summary: 'Get resume of user',
    description: 'Gets the resume associated with the authenticated user.',
  })
  @ResponseMessage('Resume has been retrieved successfully')
  getResumeOfMe(@User() user: IUser) {
    return this.resumesService.getResumeOfMe(user);
  }

  // ========== NEW: CV PARSER & AI MATCHING ENDPOINTS ==========
  @Post('upload-cv')
  @SkipCheckPermission()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (req, file, cb) => {
          const uploadPath = path.join(process.cwd(), 'public', 'images', 'resumes');
          // Ensure directory exists
          if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
          }
          cb(null, uploadPath);
        },
        filename: (req, file, cb) => {
          const extName = path.extname(file.originalname);
          const baseName = path.basename(file.originalname, extName);
          const finalName = `${baseName}-${Date.now()}${extName}`;
          cb(null, finalName);
        },
      }),
      fileFilter: (req, file, cb) => {
        const allowedFileTypes = ['pdf', 'doc', 'docx', 'txt'];
        const fileExtension = file.originalname.split('.').pop().toLowerCase();
        if (!allowedFileTypes.includes(fileExtension)) {
          cb(new BadRequestException(`Invalid file type: ${fileExtension}. Only PDF, DOC, DOCX, and TXT are allowed.`), false);
        } else {
          cb(null, true);
        }
      },
      limits: {
        fileSize: 5 * 1024 * 1024, // 5 MB
      },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Upload CV and apply for job',
    description: 'Upload CV file (PDF, DOC, DOCX, TXT) and automatically parse + analyze with AI',
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
        jobId: {
          type: 'string',
          description: 'Job ID to apply for',
        },
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
    // Step 1: Validate file
    this.resumeProcessingService.validateFile(file);

    // Step 2: Validate job exists and is active
    const job = await this.resumeProcessingService.validateJob(uploadCvDto.jobId);

    // Step 3: Check duplicate application
    await this.resumeProcessingService.checkDuplicateApplication(
      user._id.toString(),
      uploadCvDto.jobId,
    );

    // Step 4: Create resume record
    const resume = await this.resumeProcessingService.createResume(
      file,
      uploadCvDto.jobId,
      user,
    );

    // Step 5: Get full file path
    const fullFilePath = this.resumeProcessingService.getFullFilePath(resume.url);

    // Step 5.1: Verify file exists before queuing
    if (!fs.existsSync(fullFilePath)) {
      throw new BadRequestException(
        `File not found at path: ${fullFilePath}. Please try uploading again.`,
      );
    }

    // Step 6: Queue parsing job
    const parseJob = await this.resumeQueueService.addParseResumeJob({
      resumeId: resume._id.toString(),
      filePath: fullFilePath,
    });

    // Step 7: Queue analysis job (will wait for parsing to complete)
    const analysisJob = await this.resumeQueueService.addAnalyzeResumeJob({
      resumeId: resume._id.toString(),
      jobId: uploadCvDto.jobId,
    });

    return {
      resumeId: resume._id,
      jobId: uploadCvDto.jobId,
      jobName: job.name,
      companyName: job.company.name,
      status: 'processing',
      jobs: {
        parseJobId: parseJob.id,
        analysisJobId: analysisJob.id,
      },
      file: this.resumeProcessingService.getFileMetadata(file),
      message: 'Your CV has been uploaded and is being processed. You will be notified when analysis is complete.',
      estimatedTime: '30-60 seconds',
    };
  }

  @Get(':id/analysis')
  @SkipCheckPermission()
  @ApiOperation({
    summary: 'Get CV analysis results',
    description: 'Retrieve parsed data and AI matching analysis for a resume',
  })
  @ResponseMessage('Analysis results retrieved successfully')
  async getAnalysis(@Param('id') id: string, @User() user: IUser) {
    const resume = await this.resumesService.findOne(id, user);

    if (!resume) {
      throw new BadRequestException('Resume not found');
    }

    // Check if user owns this resume
    if (resume.userId.toString() !== user._id.toString() && user.role?.name !== 'ADMIN') {
      throw new BadRequestException('You do not have permission to view this resume');
    }

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
      notes: {
        adminNotes: resume.adminNotes,
        hrNotes: resume.hrNotes,
      },
      uploadedAt: resume.createdAt,
      lastUpdated: resume.updatedAt,
    };
  }

  @Get('queue/stats')
  @ApiOperation({
    summary: 'Get queue processing statistics',
    description: 'View current status of CV processing queue (Admin only)',
  })
  @ResponseMessage('Queue statistics retrieved')
  async getQueueStats() {
    return await this.resumeQueueService.getQueueStats();
  }

  @Post(':id/reparse')
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

    const fullFilePath = this.resumeProcessingService.getFullFilePath(resume.url);

    const job = await this.resumeQueueService.addParseResumeJob({
      resumeId: id,
      filePath: fullFilePath,
    });

    return {
      resumeId: id,
      jobId: job.id,
      message: 'CV re-parsing has been queued',
    };
  }

  @Post(':id/reanalyze')
  @ApiOperation({
    summary: 'Re-analyze a CV',
    description: 'Trigger re-analysis of a parsed CV against the job',
  })
  @ResponseMessage('Re-analysis queued successfully')
  async reanalyzeCV(@Param('id') id: string, @User() user: IUser) {
    const resume = await this.resumeProcessingService.validateResumeForAnalysis(id);

    if (!resume.jobId) {
      throw new BadRequestException('No job associated with this resume');
    }

    const job = await this.resumeQueueService.addAnalyzeResumeJob({
      resumeId: id,
      jobId: resume.jobId.toString(),
    });

    return {
      resumeId: id,
      jobId: job.id,
      message: 'CV re-analysis has been queued',
    };
  }
}
