import { Test, TestingModule } from '@nestjs/testing';
import { ResumesController } from './resumes.controller';
import { ResumesService } from './resumes.service';
import { ResumeProcessingService } from './resume-processing.service';
import { ResumeQueueService } from 'src/queues/services/resume-queue.service';
import { ThrottlerGuard } from '@nestjs/throttler';
import { ApplicationSubmissionService } from './services/application-submission.service';
import mongoose from 'mongoose';
import { ForbiddenException, StreamableFile } from '@nestjs/common';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ERole } from 'src/casl/enums/role.enum';

describe('ResumesController', () => {
  let controller: ResumesController;
  let mockResumesService: any;
  let mockApplicationSubmissionService: any;
  let mockResumeProcessingService: any;
  let mockResumeQueueService: any;

  beforeEach(async () => {
    mockResumesService = {
      notifyHrNewApplication: jest.fn().mockResolvedValue(undefined),
      findOne: jest.fn(),
      findOneForRead: jest.fn(),
      getFileForRead: jest.fn(),
    };
    mockResumeProcessingService = { validateResumeForAnalysis: jest.fn() };
    mockResumeQueueService = { addAnalyzeResumeJob: jest.fn() };
    mockApplicationSubmissionService = {
      submitCvOnline: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ResumesController],
      providers: [
        { provide: ResumesService, useValue: mockResumesService },
        { provide: ResumeProcessingService, useValue: mockResumeProcessingService },
        { provide: ResumeQueueService, useValue: mockResumeQueueService },
        { provide: ApplicationSubmissionService, useValue: mockApplicationSubmissionService },
      ],
    })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ResumesController>(ResumesController);
  });

  describe('submitCvOnline', () => {
    it('should call notifyHrNewApplication with companyId, not jobId', async () => {
      const companyId = new mongoose.Types.ObjectId();
      const jobId = new mongoose.Types.ObjectId();
      const resumeId = new mongoose.Types.ObjectId();

      mockApplicationSubmissionService.submitCvOnline.mockResolvedValue({
        _id: resumeId,
        jobId,
        jobName: 'Developer',
        companyId,
        companyName: 'Test Corp',
        status: 'PENDING',
        priority: 'HIGH',
        matchingScore: 80,
        recommendation: 'Recommended',
        summary: 'Good match',
        createdAt: new Date(),
        message: 'CV submitted',
      });

      const mockUser = {
        _id: 'user123',
        email: 'user@test.com',
        name: 'Test User',
      } as any;

      await controller.submitCvOnline({ jobId: jobId.toString() }, mockUser);

      // Wait for fire-and-forget promise to settle
      await new Promise(resolve => setImmediate(resolve));

      expect(mockResumesService.notifyHrNewApplication).toHaveBeenCalledWith(
        resumeId.toString(),
        'Developer',
        'Test Corp',
        companyId.toString(), // Must be companyId, NOT jobId
        'Test User',
        'user@test.com',
      );

      // Verify the 4th argument is companyId, not jobId
      const fourthArg = mockResumesService.notifyHrNewApplication.mock.calls[0][3];
      expect(fourthArg).toBe(companyId.toString());
      expect(fourthArg).not.toBe(jobId.toString());
    });

    it('should not fail the request when notification throws', async () => {
      const companyId = new mongoose.Types.ObjectId();

      mockApplicationSubmissionService.submitCvOnline.mockResolvedValue({
        _id: new mongoose.Types.ObjectId(),
        jobId: new mongoose.Types.ObjectId(),
        jobName: 'Developer',
        companyId,
        companyName: 'Test Corp',
        status: 'PENDING',
        priority: 'HIGH',
        matchingScore: 80,
        recommendation: 'Recommended',
        summary: 'Good match',
        createdAt: new Date(),
        message: 'CV submitted',
      });

      mockResumesService.notifyHrNewApplication.mockRejectedValue(new Error('Notification failed'));

      const mockUser = {
        _id: 'user123',
        email: 'user@test.com',
        name: 'Test User',
      } as any;

      // Should not throw despite notification failure
      const result = await controller.submitCvOnline(
        { jobId: new mongoose.Types.ObjectId().toString() },
        mockUser,
      );

      // Wait for fire-and-forget promise to settle
      await new Promise(resolve => setImmediate(resolve));

      expect(result).toHaveProperty('companyId');
    });
  });
  describe('reanalyzeCV', () => {
    it('checks company access before queueing', async () => {
      mockResumesService.findOne.mockRejectedValue(new ForbiddenException());
      const hr = { _id: 'hr', role: ERole.HR, company: { _id: 'c1' } } as any;

      await expect(controller.reanalyzeCV('r1', hr)).rejects.toThrow(ForbiddenException);

      expect(mockResumesService.findOne).toHaveBeenCalledWith('r1', hr);
      expect(mockResumeProcessingService.validateResumeForAnalysis).not.toHaveBeenCalled();
      expect(mockResumeQueueService.addAnalyzeResumeJob).not.toHaveBeenCalled();
    });
  });

  describe('getAnalysis', () => {
    const resume = {
      _id: 'r1',
      jobId: 'j1',
      companyId: 'c1',
      status: 'PENDING',
      adminNotes: 'internal admin',
      hrNotes: 'internal hr',
    };

    it('hides internal notes from the candidate', async () => {
      mockResumesService.findOneForRead.mockResolvedValue(resume);
      const candidate = { _id: 'cand', role: ERole.NORMAL_USER } as any;

      const result = await controller.getAnalysis('r1', candidate);

      expect(mockResumesService.findOneForRead).toHaveBeenCalledWith('r1', candidate);
      expect(result).not.toHaveProperty('notes');
    });

    it('shows notes to HR of the company', async () => {
      mockResumesService.findOneForRead.mockResolvedValue(resume);
      const hr = { _id: 'hr', role: ERole.HR, company: { _id: 'c1' } } as any;

      const result = await controller.getAnalysis('r1', hr);

      expect(result.notes).toEqual({ adminNotes: 'internal admin', hrNotes: 'internal hr' });
    });
  });
  describe('getResumeFile', () => {
    it('streams the file with inline disposition and RFC 5987 filename', async () => {
      const tmp = path.join(os.tmpdir(), `cv-${Date.now()}.txt`);
      fs.writeFileSync(tmp, 'hello');
      mockResumesService.getFileForRead.mockResolvedValue({
        filePath: tmp,
        contentType: 'text/plain; charset=utf-8',
        fileName: 'Đinh Duy.txt',
      });
      const res = { set: jest.fn() } as any;

      const file = await controller.getResumeFile('r1', { _id: 'u' } as any, res);

      expect(res.set).toHaveBeenCalledWith({
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent('Đinh Duy.txt')}`,
      });
      expect(file).toBeInstanceOf(StreamableFile);
      file.getStream().destroy();
      fs.unlinkSync(tmp);
    });
  });
});
