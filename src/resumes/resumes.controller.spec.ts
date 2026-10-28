import { Test, TestingModule } from '@nestjs/testing';
import { ResumesController } from './resumes.controller';
import { ResumesService } from './resumes.service';
import { ResumeProcessingService } from './resume-processing.service';
import { ResumeQueueService } from 'src/queues/services/resume-queue.service';
import { ThrottlerGuard } from '@nestjs/throttler';
import { ApplicationSubmissionService } from './services/application-submission.service';
import mongoose from 'mongoose';

describe('ResumesController', () => {
  let controller: ResumesController;
  let mockResumesService: any;
  let mockApplicationSubmissionService: any;

  beforeEach(async () => {
    mockResumesService = {
      notifyHrNewApplication: jest.fn().mockResolvedValue(undefined),
    };
    mockApplicationSubmissionService = {
      submitCvOnline: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ResumesController],
      providers: [
        { provide: ResumesService, useValue: mockResumesService },
        { provide: ResumeProcessingService, useValue: {} },
        { provide: ResumeQueueService, useValue: {} },
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
});
