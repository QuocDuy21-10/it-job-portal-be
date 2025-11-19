/**
 * INTEGRATION EXAMPLE
 * 
 * Add these methods to ResumesController to integrate CV Parser & AI Matching
 * This file shows how to use the queue services in your existing controller
 */

import { Controller, Post, Body, Param, Get, UseGuards } from '@nestjs/common';
import { ResumeQueueService } from 'src/queues/services/resume-queue.service';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { ResponseMessage } from 'src/decorator/customize';

// Add to your ResumesController class:

/**
 * Trigger CV parsing for an existing resume
 * POST /resumes/:id/parse
 */
@Post(':id/parse')
@UseGuards(JwtAuthGuard)
@ResponseMessage('CV parsing job queued successfully')
async parseResume(@Param('id') id: string) {
  // Get resume to get file path
  const resume = await this.resumesService.findOne(id);
  
  if (!resume.url) {
    throw new BadRequestException('Resume has no file attached');
  }

  // Queue parsing job
  const job = await this.resumeQueueService.addParseResumeJob({
    resumeId: id,
    filePath: resume.url, // or construct full path: path.join(process.cwd(), 'public', resume.url)
  });

  return {
    jobId: job.id,
    resumeId: id,
    status: 'queued',
    message: 'Your CV is being processed. Check back in a few moments.'
  };
}

/**
 * Trigger AI analysis for a resume against a job
 * POST /resumes/:id/analyze
 */
@Post(':id/analyze')
@UseGuards(JwtAuthGuard)
@ResponseMessage('AI analysis job queued successfully')
async analyzeResume(
  @Param('id') id: string,
  @Body('jobId') jobId: string,
) {
  // Validate resume is parsed
  const resume = await this.resumesService.findOne(id);
  
  if (!resume.isParsed) {
    throw new BadRequestException('Resume must be parsed before analysis. Please parse first.');
  }

  // Queue analysis job
  const job = await this.resumeQueueService.addAnalyzeResumeJob({
    resumeId: id,
    jobId: jobId,
  });

  return {
    jobId: job.id,
    resumeId: id,
    status: 'queued',
    message: 'AI analysis is in progress. Results will be available soon.'
  };
}

/**
 * Get queue statistics
 * GET /resumes/queue/stats
 */
@Get('queue/stats')
@UseGuards(JwtAuthGuard)
@ResponseMessage('Queue statistics retrieved')
async getQueueStats() {
  return await this.resumeQueueService.getQueueStats();
}

/**
 * Get parsed data and AI analysis for a resume
 * GET /resumes/:id/analysis
 */
@Get(':id/analysis')
@UseGuards(JwtAuthGuard)
@ResponseMessage('Resume analysis retrieved')
async getResumeAnalysis(@Param('id') id: string) {
  const resume = await this.resumesService.findOne(id);
  
  return {
    resumeId: id,
    isParsed: resume.isParsed,
    isAnalyzed: resume.isAnalyzed,
    priority: resume.priority,
    parsedData: resume.parsedData,
    aiAnalysis: resume.aiAnalysis,
    errors: {
      parseError: resume.parseError,
      analysisError: resume.analysisError,
    }
  };
}

/**
 * ALTERNATIVE: Auto-trigger parsing on CV upload
 * Modify your existing create/upload method:
 */
async create(createUserCvDto: CreateUserCvDto, user: IUser) {
  // Create resume as normal
  const newResume = await this.resumeModel.create({
    email: user.email,
    userId: user._id,
    status: ResumeStatus.PENDING,
    histories: [...],
    ...createUserCvDto,
    createdBy: { _id: user._id, email: user.email },
  });

  // ✨ NEW: Auto-queue parsing job
  if (newResume.url) {
    await this.resumeQueueService.addParseResumeJob({
      resumeId: newResume._id.toString(),
      filePath: newResume.url,
    });
  }

  return { 
    _id: newResume?._id, 
    createdAt: newResume?.createdAt,
    message: 'Resume uploaded. Parsing will start automatically.'
  };
}

/**
 * CONSTRUCTOR INJECTION
 * Add to your ResumesController constructor:
 */
constructor(
  private readonly resumesService: ResumesService,
  private readonly resumeQueueService: ResumeQueueService, // Add this
) {}

/**
 * MODULE IMPORT
 * Add to resumes.module.ts imports:
 */
imports: [
  MongooseModule.forFeature([{ name: Resume.name, schema: ResumeSchema }]),
  QueuesModule, // Add this
],
