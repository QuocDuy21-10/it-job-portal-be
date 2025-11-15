import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger, Inject } from '@nestjs/common';
import { Job } from 'bullmq';
import { RESUME_QUEUE } from '../queues.constants';
import { CvParserService } from 'src/cv-parser/cv-parser.service';
import { GeminiService } from 'src/gemini/gemini.service';
import { MatchingService } from 'src/matching/matching.service';
import { JobsService } from 'src/jobs/jobs.service';
import { ParseResumeJobData, AnalyzeResumeJobData } from '../services/resume-queue.service';
import { ResumePriority } from 'src/resumes/enums/resume-priority.enum';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { getModelToken } from '@nestjs/mongoose';
import { Resume } from 'src/resumes/schemas/resume.schema';
import { Model } from 'mongoose';

@Processor(RESUME_QUEUE, {
  concurrency: 5, // Process up to 5 jobs concurrently
  limiter: {
    max: 10, // Max 10 jobs
    duration: 1000, // per 1 second
  },
})
export class ResumeQueueProcessor extends WorkerHost {
  private readonly logger = new Logger(ResumeQueueProcessor.name);

  constructor(
    @Inject(getModelToken(Resume.name)) private resumeModel: Model<Resume>,
    private readonly cvParserService: CvParserService,
    private readonly geminiService: GeminiService,
    private readonly matchingService: MatchingService,
    private readonly jobsService: JobsService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    this.logger.log(`Processing job ${job.id} of type ${job.name}`);

    switch (job.name) {
      case 'parse-resume':
        return this.handleParseResume(job);
      case 'analyze-resume':
        return this.handleAnalyzeResume(job);
      default:
        this.logger.warn(`Unknown job type: ${job.name}`);
        return null;
    }
  }

  /**
   * Handle CV parsing job
   */
  private async handleParseResume(job: Job<ParseResumeJobData>) {
    const { resumeId, filePath } = job.data;
    
    try {
      this.logger.log(`[Parse Job ${job.id}] Starting CV parsing for resume ${resumeId}`);
      await job.updateProgress(10);

      // Check if already parsed (cache)
      const cacheKey = `parsed_cv:${resumeId}`;
      const cached = await this.cacheManager.get(cacheKey);
      if (cached) {
        this.logger.log(`Using cached parsed data for resume ${resumeId}`);
        await job.updateProgress(100);
        return cached;
      }

      // Step 1: Extract text from file
      this.logger.log(`[Parse Job ${job.id}] Extracting text from: ${filePath}`);
      await job.updateProgress(20);
      
      const cvText = await this.cvParserService.extractTextFromCV(filePath);
      this.logger.log(`[Parse Job ${job.id}] Extracted ${cvText.length} characters`);
      
      // Step 2: Validate extracted text
      await job.updateProgress(30);
      const validation = this.cvParserService.validateExtractedText(cvText);
      if (!validation.valid) {
        throw new Error(`Invalid CV text: ${validation.reason}`);
      }

      // Step 3: Clean text
      await job.updateProgress(40);
      const cleanedText = this.cvParserService.cleanText(cvText);
      console.log("cleanedText:", cleanedText);
      
      this.logger.log(`[Parse Job ${job.id}] Text cleaned and validated`);

      // Step 4: Parse CV using Gemini AI
      this.logger.log(`[Parse Job ${job.id}] Calling Gemini AI for parsing...`);
      await job.updateProgress(50);
      
      const parsedData = await this.geminiService.parseCV(cleanedText);
      this.logger.log(`[Parse Job ${job.id}] AI parsing completed`);
      await job.updateProgress(80);

      // Step 5: Update resume with parsed data
      await this.resumeModel.findByIdAndUpdate(resumeId, {
        parsedData,
        isParsed: true,
        parseError: null,
      });
      
      this.logger.log(`[Parse Job ${job.id}] Resume updated with parsed data`);
      await job.updateProgress(90);

      // Cache the result for 1 hour
      await this.cacheManager.set(cacheKey, parsedData, 3600);
      await job.updateProgress(100);

      this.logger.log(`[Parse Job ${job.id}] ✅ Successfully parsed CV for resume ${resumeId}`);
      
      return { 
        success: true, 
        parsedData,
        extractedLength: cvText.length,
        parsedFields: Object.keys(parsedData).length 
      };
    } catch (error) {
      this.logger.error(`[Parse Job ${job.id}] ❌ Failed to parse CV for resume ${resumeId}:`, error.message);
      
      // Update resume with error
      await this.resumeModel.findByIdAndUpdate(resumeId, {
        isParsed: false,
        parseError: error.message,
      });

      throw error;
    }
  }

  /**
   * Handle AI analysis job
   * 🔄 UPDATED: Now uses MatchingService instead of AI for scoring
   */
  private async handleAnalyzeResume(job: Job<AnalyzeResumeJobData>) {
    const { resumeId, jobId } = job.data;
    
    try {
      this.logger.log(`[Analysis Job ${job.id}] Starting hybrid analysis for resume ${resumeId} and job ${jobId}`);
      await job.updateProgress(10);

      // Step 1: Get resume and job data
      this.logger.log(`[Analysis Job ${job.id}] Fetching resume and job data...`);
      const resume = await this.resumeModel.findById(resumeId);
      const jobData = await this.jobsService.findOne(jobId);
      await job.updateProgress(20);

      if (!resume.parsedData) {
        throw new Error('Resume must be parsed before analysis');
      }

      // Validate job is active
      if (!jobData.isActive) {
        throw new Error('Job is no longer active');
      }

      this.logger.log(`[Analysis Job ${job.id}] Data fetched: ${jobData.name}`);
      await job.updateProgress(30);

      // Step 2: Perform HYBRID matching (AI extract + Backend score)
      this.logger.log(`[Analysis Job ${job.id}] Running MatchingService calculation...`);
      await job.updateProgress(40);
      
      // 🆕 Use MatchingService instead of AI
      const matchResult = await this.matchingService.calculateMatch(
        resume.parsedData,
        jobData,
      );
      
      this.logger.log(
        `[Analysis Job ${job.id}] Matching completed - Score: ${matchResult.matchingScore}, Priority: ${matchResult.priority}`,
      );
      await job.updateProgress(70);

      // Step 3: Convert to AIAnalysis format for backward compatibility
      const analysis = {
        matchingScore: matchResult.matchingScore,
        skillsMatch: matchResult.skillsMatch,
        strengths: matchResult.strengths,
        weaknesses: matchResult.weaknesses,
        summary: matchResult.summary,
        recommendation: matchResult.recommendation,
        analyzedAt: matchResult.analyzedAt,
      };

      this.logger.log(`[Analysis Job ${job.id}] Priority calculated: ${matchResult.priority}`);
      await job.updateProgress(80);

      // Step 4: Update resume with analysis and auto status
      await this.resumeModel.findByIdAndUpdate(resumeId, {
        aiAnalysis: analysis,
        priority: matchResult.priority,
        status: matchResult.autoStatus, // Auto set status based on score
        isAnalyzed: true,
        analysisError: null,
      });
      
      await job.updateProgress(100);

      this.logger.log(
        `[Analysis Job ${job.id}] ✅ Successfully analyzed resume ${resumeId} - Score: ${matchResult.matchingScore}, Priority: ${matchResult.priority}, Status: ${matchResult.autoStatus}`
      );
      
      return { 
        success: true, 
        analysis, 
        priority: matchResult.priority,
        autoStatus: matchResult.autoStatus,
        matchingScore: matchResult.matchingScore,
        recommendation: matchResult.recommendation,
      };
    } catch (error) {
      this.logger.error(`[Analysis Job ${job.id}] ❌ Failed to analyze resume ${resumeId}:`, error.message);
      
      // Update resume with error
      await this.resumeModel.findByIdAndUpdate(resumeId, {
        isAnalyzed: false,
        analysisError: error.message,
      });

      throw error;
    }
  }

  /**
   * @deprecated - Priority now calculated by MatchingService
   * Calculate priority based on matching score
   */
  private calculatePriority(matchingScore: number): ResumePriority {
    if (matchingScore >= 85) return ResumePriority.EXCELLENT;
    if (matchingScore >= 70) return ResumePriority.HIGH;
    if (matchingScore >= 50) return ResumePriority.MEDIUM;
    return ResumePriority.LOW;
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    this.logger.log(`Job ${job.id} completed successfully`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error) {
    this.logger.error(`Job ${job.id} failed with error: ${error.message}`);
  }

  @OnWorkerEvent('progress')
  onProgress(job: Job, progress: number | object) {
    this.logger.debug(`Job ${job.id} progress: ${JSON.stringify(progress)}`);
  }
}
